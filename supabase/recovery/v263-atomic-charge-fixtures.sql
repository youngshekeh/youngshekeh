-- Run after the V263 DDL INSIDE THE SAME ROLLBACK-ONLY TRANSACTION.
-- Uses a fresh, uncommitted .invalid fixture member. Existing customers are
-- untouched. Email outbox rows are transactional and never visible to workers.
-- No provider HTTP requests, charges, notifications or committed fixture data.
create temporary table v263_assertions(label text primary key) on commit drop;
create function pg_temp.v263_assert(p_ok boolean,p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'V263 fixture failed: %',p_label; end if;
  insert into pg_temp.v263_assertions values(p_label);
end; $$;
create temporary table v263_context as
 select gen_random_uuid() as user_id,gen_random_uuid() as intent_id,
   'v263-fixture-'||gen_random_uuid()::text as reference,
   '999263'||(10000000000000+floor(random()*80000000000000)::bigint)::text as tx_id,
   '92631234'::text as customer_id,'92635678'::text as subscription_id,
   now()-interval '1 minute' as paid_at,p.id as plan_id,p.price_monthly_usd as amount,m.provider_plan_id
 from public.plans p join public.billing_plan_mappings m on m.plan_id=p.id and m.provider='flutterwave'
 where p.id='pro' and p.is_active and m.is_active and m.recurring;
select pg_temp.v263_assert((select count(*)=1 from pg_temp.v263_context),'active fixture plan available');
insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
 select user_id,'v263-'||user_id::text||'@example.invalid','{}'::jsonb,'{}'::jsonb from pg_temp.v263_context;
update public.member_notification_preferences set email_opt_in=false
 where user_id=(select user_id from pg_temp.v263_context);
insert into public.checkout_intents(id,user_id,plan_id,provider,amount,currency,status,provider_reference,expires_at,created_at)
 select intent_id,user_id,plan_id,'flutterwave',amount,'USD','pending',reference,now()+interval '30 minutes',now()-interval '2 minutes'
 from pg_temp.v263_context;
create function pg_temp.v263_payment() returns jsonb language sql as $$
 select jsonb_build_object('id',tx_id,'tx_ref',reference,'status','successful','amount',amount,
   'currency','USD','created_at',paid_at,'verified_at',now(),
   'customer',jsonb_build_object('id',customer_id,'email','v263-'||user_id::text||'@example.invalid'),
   'subscription_id',subscription_id,'payment_plan',provider_plan_id,
   'meta',jsonb_build_object('user_id',user_id,'plan_id',plan_id,'checkout_intent_id',intent_id))
 from pg_temp.v263_context; $$;

do $fixtures$
declare v jsonb; r jsonb; patch jsonb; before_count integer;
begin
 perform pg_temp.v263_assert(not has_function_privilege('anon','public.fulfill_flutterwave_charge(jsonb,text)','EXECUTE')
   and not has_function_privilege('authenticated','public.fulfill_flutterwave_charge(jsonb,text)','EXECUTE'),
   'public RPC denies anonymous and member callers');
 perform pg_temp.v263_assert(not has_function_privilege('anon','private.fulfill_flutterwave_charge(jsonb,text)','EXECUTE')
   and not has_function_privilege('authenticated','private.fulfill_flutterwave_charge(jsonb,text)','EXECUTE'),
   'private implementation denies anonymous and member callers');
 perform pg_temp.v263_assert(has_function_privilege('service_role','public.fulfill_flutterwave_charge(jsonb,text)','EXECUTE')
   and has_function_privilege('service_role','private.fulfill_flutterwave_charge(jsonb,text)','EXECUTE'),
   'service role can execute both functions');
 perform pg_temp.v263_assert(not has_table_privilege('anon','private.flutterwave_charge_fulfillments','SELECT')
   and not has_table_privilege('authenticated','private.flutterwave_charge_fulfillments','SELECT')
   and not has_table_privilege('service_role','private.flutterwave_charge_fulfillments','INSERT'),
   'receipt table has no direct client or service writes');
 perform pg_temp.v263_assert((select not prosecdef from pg_proc where oid='public.fulfill_flutterwave_charge(jsonb,text)'::regprocedure),
   'exposed wrapper is security invoker');
 v:=pg_temp.v263_payment();
 for patch in select value from jsonb_array_elements(jsonb_build_array(
  jsonb_build_object('status','pending'),jsonb_build_object('currency','NGN'),jsonb_build_object('amount',0),
  jsonb_build_object('amount',(v->>'amount')::numeric-1),jsonb_build_object('id','../1'),
  jsonb_build_object('customer',jsonb_build_object('id','92631234','email','other@example.invalid')),
  jsonb_build_object('meta',jsonb_build_object('plan_id','enterprise')),
  jsonb_build_object('meta',jsonb_build_object('user_id',gen_random_uuid())),
  jsonb_build_object('meta',jsonb_build_object('checkout_intent_id',gen_random_uuid())),
  jsonb_build_object('created_at',now()+interval '6 minutes'),
  jsonb_build_object('verified_at',now()-interval '3 minutes'),
  jsonb_build_object('payment_plan','-1')
 )) loop
   r:=public.fulfill_flutterwave_charge(v||patch,'verif_hash');
   if r->>'ok' is distinct from 'false' then raise exception 'invalid payment accepted'; end if;
 end loop;
 perform pg_temp.v263_assert(not exists(select 1 from public.payment_events where user_id=(select user_id from pg_temp.v263_context)),
   'twelve mismatched provider transactions cause zero event writes');
 r:=public.fulfill_flutterwave_charge(v,'unverified');
 perform pg_temp.v263_assert(r->>'ok'='false','invalid signature attestation rejected');
 r:=public.fulfill_flutterwave_charge(v||jsonb_build_object('created_at',now()-interval '40 days'),'verif_hash');
 perform pg_temp.v263_assert(r->>'reason'='PAID_TERM_EXPIRED','historical payment cannot grant a new monthly term');
 update public.checkout_intents set expires_at=now()-interval '90 seconds' where id=(select intent_id from pg_temp.v263_context);
 r:=public.fulfill_flutterwave_charge(v,'verif_hash');
 perform pg_temp.v263_assert(r->>'reason'='PAYMENT_AFTER_CHECKOUT_EXPIRY','payment after checkout expiry rejected');
 update public.checkout_intents set expires_at=now()+interval '30 minutes',status='canceled'
   where id=(select intent_id from pg_temp.v263_context);
 r:=public.fulfill_flutterwave_charge(v,'verif_hash');
 perform pg_temp.v263_assert(r->>'reason'='CHECKOUT_NOT_PAYABLE','canceled checkout cannot activate access');
 update public.checkout_intents set status='pending' where id=(select intent_id from pg_temp.v263_context);
end;
$fixtures$;

-- Fail the LAST insert, after event, checkout, entitlement and outbox writes.
alter table private.flutterwave_charge_fulfillments add constraint v263_fixture_failure
 check (receipt->>'version'<>'v263-atomic-flutterwave-charge') not valid;
do $fixtures$
declare r jsonb;
begin
 begin
  r:=public.fulfill_flutterwave_charge(pg_temp.v263_payment(),'hmac_sha256');
  raise exception 'fixture expected a final-insert failure';
 exception when check_violation then null;
 end;
 perform pg_temp.v263_assert(not exists(select 1 from public.payment_events where user_id=(select user_id from pg_temp.v263_context)),
   'late failure rolls back payment event');
 perform pg_temp.v263_assert((select status='pending' from public.checkout_intents where id=(select intent_id from pg_temp.v263_context)),
   'late failure rolls back paid checkout');
 perform pg_temp.v263_assert((select plan_id='free' and provider='internal' from public.subscriptions where user_id=(select user_id from pg_temp.v263_context)),
   'late failure rolls back subscription activation');
 perform pg_temp.v263_assert(not exists(select 1 from public.transactional_email_outbox where user_id=(select user_id from pg_temp.v263_context) and category='billing'),
   'late failure rolls back email outbox');
 perform pg_temp.v263_assert(not exists(select 1 from private.flutterwave_charge_fulfillments where user_id=(select user_id from pg_temp.v263_context)),
   'late failure leaves no committed receipt');
end;
$fixtures$;
alter table private.flutterwave_charge_fulfillments drop constraint v263_fixture_failure;

do $fixtures$
declare v jsonb; r jsonb; original jsonb; renewal jsonb; old_end timestamptz; email_count integer;
begin
 v:=pg_temp.v263_payment();
 execute 'set local role service_role';
 r:=public.fulfill_flutterwave_charge(v,'hmac_sha256');
 execute 'reset role';
 perform pg_temp.v263_assert(r->>'state'='COMMITTED','retry after rollback commits all writes');
 original:=r->'receipt';
 perform pg_temp.v263_assert((select status='paid' from public.checkout_intents where id=(select intent_id from pg_temp.v263_context)),
   'paid checkout committed with receipt');
 perform pg_temp.v263_assert((select status='active' and plan_id='pro' and current_period_end=(select paid_at+interval '1 month' from pg_temp.v263_context)
   from public.subscriptions where user_id=(select user_id from pg_temp.v263_context)),
   'paid term starts at provider payment time');
 select count(*) into email_count from public.transactional_email_outbox where user_id=(select user_id from pg_temp.v263_context);
 r:=public.fulfill_flutterwave_charge(v,'verif_hash');
 perform pg_temp.v263_assert(r->>'state'='ALREADY_COMMITTED' and r->'receipt'=original,
   'duplicate returns original receipt and timestamps');
 perform pg_temp.v263_assert((select count(*)=1 from public.payment_events where user_id=(select user_id from pg_temp.v263_context))
   and (select count(*)=email_count from public.transactional_email_outbox where user_id=(select user_id from pg_temp.v263_context)),
   'duplicate creates no second event or email');
 r:=public.fulfill_flutterwave_charge(v||jsonb_build_object('amount',(v->>'amount')::numeric+1),'verif_hash');
 perform pg_temp.v263_assert(r->>'reason'='COMMITTED_TRANSACTION_MISMATCH','duplicate cannot change verified payment facts');
 renewal:=v||jsonb_build_object('id',((v->>'id')::numeric+1)::text,'tx_ref','renewal-'||(v->>'tx_ref'),
   'created_at',(v->>'created_at')::timestamptz+interval '20 seconds','meta','{}'::jsonb);
 r:=public.fulfill_flutterwave_charge(renewal-'subscription_id','verif_hash');
 perform pg_temp.v263_assert(r->>'reason'='UNBOUND_RENEWAL','customer-only renewal cannot select a subscription');
 r:=public.fulfill_flutterwave_charge(renewal,'verif_hash');
 perform pg_temp.v263_assert(r->>'state'='COMMITTED' and r->'receipt'->>'recurring'='true'
   and r->'receipt'->>'checkout_paid_committed'='false','exact customer and subscription bind renewal');
 select current_period_end into old_end from public.subscriptions where user_id=(select user_id from pg_temp.v263_context);
 renewal:=renewal||jsonb_build_object('id',((v->>'id')::numeric+2)::text,'tx_ref','older-'||(v->>'tx_ref'),
   'created_at',(v->>'created_at')::timestamptz-interval '10 seconds');
 r:=public.fulfill_flutterwave_charge(renewal,'verif_hash');
 perform pg_temp.v263_assert(r->>'state'='COMMITTED' and
   (select current_period_end=old_end from public.subscriptions where user_id=(select user_id from pg_temp.v263_context)),
   'out-of-order renewal neither shortens nor adds another month');
 update public.subscriptions set status='canceled' where user_id=(select user_id from pg_temp.v263_context);
 renewal:=renewal||jsonb_build_object('id',((v->>'id')::numeric+3)::text,'tx_ref','canceled-'||(v->>'tx_ref'));
 r:=public.fulfill_flutterwave_charge(renewal,'verif_hash');
 perform pg_temp.v263_assert(r->>'reason'='PAYMENT_PRECEDES_CANCELLATION' and
   (select status='canceled' from public.subscriptions where user_id=(select user_id from pg_temp.v263_context)),
   'older payment cannot undo a newer cancellation');
 insert into public.payment_events(provider,provider_event_key,event_type,user_id,plan_id,amount,currency,status,raw_payload)
 select 'flutterwave','v263-legacy-fixture-'||tx_id,'charge.completed',user_id,plan_id,amount,'USD','successful',
   jsonb_build_object('transaction_id',(tx_id::numeric+4)::text,'tx_ref','legacy-'||reference)
 from pg_temp.v263_context;
 renewal:=renewal||jsonb_build_object('id',((v->>'id')::numeric+4)::text,'tx_ref','legacy-'||(v->>'tx_ref'));
 r:=public.fulfill_flutterwave_charge(renewal,'verif_hash');
 perform pg_temp.v263_assert(r->>'reason'='LEGACY_EVENT_REQUIRES_RECONCILIATION',
   'old event without atomic receipt requires explicit reconciliation');
end;
$fixtures$;

-- ROLLBACK is appended by the runner. Do not execute these fixtures standalone
-- outside a transaction. The final SELECT occurs only after rollback succeeds.
