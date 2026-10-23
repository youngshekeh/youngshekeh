-- V263: service-only, provider-reverified charge fulfillment in one transaction.
-- No existing payment, checkout, subscription, role, job or schedule is changed.
-- Apply as one migration after the rollback-only fixture passes.
create table private.flutterwave_charge_fulfillments (
  transaction_id text primary key,
  transaction_reference text not null,
  payment_event_id uuid not null unique references public.payment_events(id),
  checkout_intent_id uuid unique references public.checkout_intents(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null references public.plans(id),
  provider_customer_id text not null,
  amount numeric not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  paid_at timestamptz not null,
  period_end timestamptz not null,
  receipt jsonb not null,
  committed_at timestamptz not null default now(),
  constraint v263_paid_term check (period_end > paid_at)
);
alter table private.flutterwave_charge_fulfillments enable row level security;
revoke all on private.flutterwave_charge_fulfillments from public, anon, authenticated, service_role;

create function private.fulfill_flutterwave_charge(p_verified jsonb, p_signature_mode text)
returns jsonb
language plpgsql security definer
set search_path = ''
set timezone = 'UTC'
set lock_timeout = '3s'
as $v263$
declare
  v_id text := p_verified->>'id';
  v_ref text := p_verified->>'tx_ref';
  v_customer text := p_verified->'customer'->>'id';
  v_email text := lower(btrim(p_verified->'customer'->>'email'));
  v_subscription text := nullif(p_verified->>'subscription_id','');
  v_currency text := p_verified->>'currency';
  v_amount numeric;
  v_paid_at timestamptz;
  v_verified_at timestamptz;
  v_period_end timestamptz;
  v_expiry timestamptz;
  v_user uuid;
  v_plan text;
  v_expected_amount numeric;
  v_expected_currency text;
  v_count integer;
  v_intent public.checkout_intents%rowtype;
  v_sub public.subscriptions%rowtype;
  v_mapping public.billing_plan_mappings%rowtype;
  v_prior private.flutterwave_charge_fulfillments%rowtype;
  v_event uuid;
  v_receipt_id uuid := gen_random_uuid();
  v_receipt jsonb;
  v_initial boolean := false;
begin
  -- EXECUTE is restricted to the service role. These fields are the Edge
  -- function's authenticated provider response, never the webhook body.
  if jsonb_typeof(p_verified) is distinct from 'object'
     or p_signature_mode is null or p_signature_mode not in ('hmac_sha256','verif_hash')
     or p_verified->>'status' is distinct from 'successful'
     or v_id is null or v_id !~ '^[1-9][0-9]{0,29}$'
     or v_ref is null or length(v_ref) not between 1 and 250
     or v_customer is null or v_customer !~ '^[1-9][0-9]{0,29}$'
     or v_email is null or length(v_email) not between 3 and 320
     or v_currency is null or v_currency !~ '^[A-Z]{3}$'
     or coalesce(p_verified->>'amount','') !~ '^[0-9]+(\.[0-9]+)?$'
     or coalesce(p_verified->>'created_at','') !~ '^\d{4}-\d{2}-\d{2}T'
     or coalesce(p_verified->>'verified_at','') !~ '^\d{4}-\d{2}-\d{2}T' then
    return jsonb_build_object('ok',false,'state','REVIEW_REQUIRED','reason','INVALID_VERIFIED_TRANSACTION');
  end if;
  v_amount := (p_verified->>'amount')::numeric;
  v_paid_at := (p_verified->>'created_at')::timestamptz;
  v_verified_at := (p_verified->>'verified_at')::timestamptz;
  v_period_end := v_paid_at + interval '1 month';
  if v_amount <= 0 or v_paid_at > now()+interval '5 minutes'
     or v_verified_at > now()+interval '5 seconds'
     or v_verified_at < now()-interval '2 minutes' then
    return jsonb_build_object('ok',false,'state','REVIEW_REQUIRED','reason','INVALID_TRANSACTION_TIME_OR_AMOUNT');
  end if;

  -- Serialize the provider transaction first, then the member. A lost HTTP
  -- response can be retried without adding time or sending another receipt.
  perform pg_advisory_xact_lock(hashtextextended('v263:flw:tx:'||v_id,0));
  select * into v_prior from private.flutterwave_charge_fulfillments where transaction_id=v_id;
  if found then
    if v_prior.transaction_reference is distinct from v_ref
       or v_prior.provider_customer_id is distinct from v_customer
       or v_prior.amount is distinct from v_amount or v_prior.currency is distinct from v_currency
       or v_prior.paid_at is distinct from v_paid_at then
      return jsonb_build_object('ok',false,'state','REVIEW_REQUIRED','reason','COMMITTED_TRANSACTION_MISMATCH');
    end if;
    -- Retain the ORIGINAL receipt timestamps; a retry is not new evidence.
    return jsonb_build_object('ok',true,'state','ALREADY_COMMITTED','receipt',v_prior.receipt);
  end if;
  if v_period_end <= now() then
    return jsonb_build_object('ok',false,'state','REVIEW_REQUIRED','reason','PAID_TERM_EXPIRED');
  end if;
  if exists(select 1 from public.payment_events where provider='flutterwave'
    and (provider_event_key='charge.completed:'||v_id||':successful'
      or raw_payload->>'transaction_id'=v_id
      or (status='successful' and raw_payload->>'tx_ref'=v_ref
        and raw_payload->>'fulfillment_version' is distinct from 'v263'))) then
    return jsonb_build_object('ok',false,'state','REVIEW_REQUIRED','reason','LEGACY_EVENT_REQUIRES_RECONCILIATION');
  end if;

  select count(*) into v_count from public.checkout_intents
    where provider='flutterwave' and provider_reference=v_ref;
  if v_count > 1 then
    return jsonb_build_object('ok',false,'state','REVIEW_REQUIRED','reason','AMBIGUOUS_CHECKOUT');
  end if;
  if v_count=1 then
    select * into v_intent from public.checkout_intents
      where provider='flutterwave' and provider_reference=v_ref;
    v_user := v_intent.user_id; v_plan := v_intent.plan_id;
    v_initial := v_intent.status <> 'paid';
  else
    if v_subscription is null then
      return jsonb_build_object('ok',false,'state','REVIEW_REQUIRED','reason','UNBOUND_RENEWAL');
    end if;
    select count(*) into v_count from public.subscriptions where provider='flutterwave'
      and provider_customer_id=v_customer and provider_subscription_id=v_subscription;
    if v_count<>1 then
      return jsonb_build_object('ok',false,'state','REVIEW_REQUIRED','reason','UNBOUND_RENEWAL');
    end if;
    select * into v_sub from public.subscriptions where provider='flutterwave'
      and provider_customer_id=v_customer and provider_subscription_id=v_subscription;
    v_user := v_sub.user_id; v_plan := v_sub.plan_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('v263:flw:user:'||v_user::text,0));
  if v_intent.id is not null then
    select * into v_intent from public.checkout_intents where id=v_intent.id for update;
    v_initial := v_intent.status <> 'paid';
  end if;
  select * into v_sub from public.subscriptions where user_id=v_user for update;
  select * into v_mapping from public.billing_plan_mappings
    where provider='flutterwave' and plan_id=v_plan and is_active=true;
  if v_plan='free' or v_mapping.plan_id is null or v_mapping.provider_plan_id is null or not exists
    (select 1 from public.plans where id=v_plan and is_active=true and price_monthly_usd>0) then
    return jsonb_build_object('ok',false,'state','REVIEW_REQUIRED','reason','PLAN_NOT_AVAILABLE');
  end if;
  if not exists(select 1 from auth.users where id=v_user and lower(btrim(email))=v_email)
     or (p_verified->'meta'->>'user_id' is not null and p_verified->'meta'->>'user_id'<>v_user::text)
     or (p_verified->'meta'->>'plan_id' is not null and p_verified->'meta'->>'plan_id'<>v_plan)
     or (p_verified->>'payment_plan' is not null and p_verified->>'payment_plan'<>v_mapping.provider_plan_id) then
    return jsonb_build_object('ok',false,'state','REVIEW_REQUIRED','reason','CUSTOMER_OR_PLAN_MISMATCH');
  end if;
  if v_sub.status='canceled' and v_paid_at<=v_sub.updated_at then
    return jsonb_build_object('ok',false,'state','REVIEW_REQUIRED','reason','PAYMENT_PRECEDES_CANCELLATION');
  end if;
  if v_sub.plan_id not in ('free',v_plan) and v_sub.current_period_end>now() then
    return jsonb_build_object('ok',false,'state','REVIEW_REQUIRED','reason','PLAN_CHANGE_REQUIRES_REVIEW');
  end if;
  if v_initial then
    if v_intent.status='canceled' or v_paid_at<v_intent.created_at-interval '5 seconds'
       or (p_verified->'meta'->>'checkout_intent_id' is not null
         and p_verified->'meta'->>'checkout_intent_id'<>v_intent.id::text) then
      return jsonb_build_object('ok',false,'state','REVIEW_REQUIRED','reason','CHECKOUT_NOT_PAYABLE');
    end if;
    v_expiry := coalesce(v_intent.expires_at,nullif(v_intent.metadata->>'link_expiration','')::timestamptz);
    if v_expiry is not null and v_paid_at>v_expiry then
      return jsonb_build_object('ok',false,'state','REVIEW_REQUIRED','reason','PAYMENT_AFTER_CHECKOUT_EXPIRY');
    end if;
    v_expected_amount := v_intent.amount; v_expected_currency := v_intent.currency;
  else
    if v_subscription is null or v_sub.provider is distinct from 'flutterwave'
       or v_sub.provider_customer_id is distinct from v_customer
       or v_sub.provider_subscription_id is distinct from v_subscription
       or v_sub.plan_id is distinct from v_plan or v_mapping.recurring is distinct from true then
      return jsonb_build_object('ok',false,'state','REVIEW_REQUIRED','reason','UNBOUND_RENEWAL');
    end if;
    select price_monthly_usd into v_expected_amount from public.plans where id=v_plan;
    v_expected_currency := v_mapping.currency;
  end if;
  if v_expected_amount<=0 or v_amount<v_expected_amount
     or v_currency is distinct from v_expected_currency
     or v_currency is distinct from v_mapping.currency then
    return jsonb_build_object('ok',false,'state','REVIEW_REQUIRED','reason','CURRENCY_OR_AMOUNT_MISMATCH');
  end if;

  -- All writes below share the calling transaction. Any trigger, constraint,
  -- lock or connection failure rolls back the event, checkout and entitlement.
  insert into public.payment_events(provider,provider_event_key,event_type,user_id,plan_id,amount,currency,status,raw_payload)
  values('flutterwave','charge.completed:'||v_id||':successful','charge.completed',v_user,v_plan,v_amount,v_currency,'successful',
    jsonb_build_object('transaction_id',v_id,'tx_ref',v_ref,'event_type','charge.completed',
      'verified',true,'signature_mode',p_signature_mode,'recurring',not v_initial,'fulfillment_version','v263'))
  returning id into v_event;
  if v_initial then
    update public.checkout_intents set status='paid',updated_at=now() where id=v_intent.id;
  end if;
  -- One provider-paid monthly term, never another month starting at replay time.
  -- Out-of-order same-plan payments cannot shorten an existing paid term.
  v_period_end := greatest(v_period_end,case when v_sub.plan_id=v_plan then v_sub.current_period_end end);
  insert into public.subscriptions(user_id,plan_id,status,provider,provider_customer_id,provider_subscription_id,current_period_end)
  values(v_user,v_plan,'active','flutterwave',v_customer,v_subscription,v_period_end)
  on conflict(user_id) do update set plan_id=excluded.plan_id,status='active',provider='flutterwave',
    provider_customer_id=excluded.provider_customer_id,
    provider_subscription_id=coalesce(excluded.provider_subscription_id,public.subscriptions.provider_subscription_id),
    current_period_end=excluded.current_period_end,updated_at=now()
  where public.subscriptions.plan_id is distinct from excluded.plan_id
     or public.subscriptions.status is distinct from 'active'
     or public.subscriptions.provider is distinct from 'flutterwave'
     or public.subscriptions.provider_customer_id is distinct from excluded.provider_customer_id
     or (excluded.provider_subscription_id is not null and public.subscriptions.provider_subscription_id is distinct from excluded.provider_subscription_id)
     or public.subscriptions.current_period_end is distinct from excluded.current_period_end;
  v_receipt := jsonb_build_object('receipt_id',v_receipt_id,'version','v263-atomic-flutterwave-charge',
    'observed_at',now(),'signature_valid',true,'provider_reverified',true,
    'transaction_reference_matches',true,'customer_matches',true,'plan_matches',true,
    'currency_matches',true,'amount_matches',true,'provider_status','successful',
    'atomic_fulfillment_committed',true,'event_dedupe_record_committed',true,
    'entitlement_upsert_committed',true,'checkout_paid_committed',v_initial,
    'membership_status','active','membership_checked_at',now(),'current_period_end',v_period_end,
    'legacy_historical_replay',false,'event_is_expired',false,'recurring',not v_initial);
  insert into private.flutterwave_charge_fulfillments(transaction_id,transaction_reference,payment_event_id,
    checkout_intent_id,user_id,plan_id,provider_customer_id,amount,currency,paid_at,period_end,receipt)
  values(v_id,v_ref,v_event,case when v_initial then v_intent.id end,v_user,v_plan,v_customer,v_amount,v_currency,v_paid_at,v_period_end,v_receipt);
  return jsonb_build_object('ok',true,'state','COMMITTED','receipt',v_receipt);
end;
$v263$;
revoke all on function private.fulfill_flutterwave_charge(jsonb,text) from public, anon, authenticated;
grant execute on function private.fulfill_flutterwave_charge(jsonb,text) to service_role;

-- The exposed RPC runs as its caller; its privileged implementation is private.
create function public.fulfill_flutterwave_charge(p_verified jsonb, p_signature_mode text)
returns jsonb language sql security invoker set search_path = ''
as $v263$ select private.fulfill_flutterwave_charge(p_verified,p_signature_mode); $v263$;
revoke all on function public.fulfill_flutterwave_charge(jsonb,text) from public, anon, authenticated;
grant execute on function public.fulfill_flutterwave_charge(jsonb,text) to service_role;
