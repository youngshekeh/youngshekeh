-- V183 Broker Sandbox Certification Spine
-- Owner-supplied demo broker receipts only. No production broker route, no real orders, no capital unlock.

create table if not exists public.gold_broker_sandbox_receipts (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  owner_user_id uuid not null,
  source_code text not null check (source_code ~ '^[A-Z0-9_-]{3,64}$'),
  provider_symbol text not null check (provider_symbol ~ '^XAUUSD[A-Za-z0-9._-]{0,16}$'),
  sequence bigint not null check (sequence > 0 and sequence <= 9007199254740991),
  observed_at timestamptz not null,
  event_type text not null check (event_type in ('QUOTE','ORDER_ACK','FILL','CANCEL_ACK','KILL_SWITCH_ACK')),
  client_order_id text,
  broker_order_id text,
  side text check (side is null or side in ('LONG','SHORT')),
  requested_r numeric,
  requested_price numeric,
  fill_price numeric,
  bid numeric,
  ask numeric,
  kill_switch_state text check (kill_switch_state is null or kill_switch_state='ENGAGED'),
  mode text not null default 'BROKER_DEMO_SANDBOX' check (mode='BROKER_DEMO_SANDBOX'),
  provenance text not null default 'DEMO_BROKER_USER_SUPPLIED' check (provenance='DEMO_BROKER_USER_SUPPLIED'),
  real_money boolean not null default false check (real_money=false),
  execution_grade boolean not null default false check (execution_grade=false),
  production_broker_verified boolean not null default false check (production_broker_verified=false),
  live_order_submission_enabled boolean not null default false check (live_order_submission_enabled=false),
  spread_points numeric generated always as (
    case when event_type='QUOTE' and bid is not null and ask is not null then ask-bid else null end
  ) stored,
  signed_slippage_points numeric generated always as (
    case
      when event_type='FILL' and side='LONG' and requested_price is not null and fill_price is not null then fill_price-requested_price
      when event_type='FILL' and side='SHORT' and requested_price is not null and fill_price is not null then requested_price-fill_price
      else null
    end
  ) stored,
  payload_sha256 text not null,
  unique(owner_user_id,source_code,sequence)
);
alter table public.gold_broker_sandbox_receipts enable row level security;
revoke all on table public.gold_broker_sandbox_receipts from public,anon,authenticated;
grant select,insert on table public.gold_broker_sandbox_receipts to service_role;
grant usage,select on sequence public.gold_broker_sandbox_receipts_id_seq to service_role;
create index if not exists gold_broker_sandbox_receipts_source_time_idx on public.gold_broker_sandbox_receipts(owner_user_id,source_code,observed_at desc,id desc);
create index if not exists gold_broker_sandbox_receipts_order_idx on public.gold_broker_sandbox_receipts(owner_user_id,source_code,client_order_id,event_type,observed_at);
drop trigger if exists prevent_v183_sandbox_receipt_mutation on public.gold_broker_sandbox_receipts;
create trigger prevent_v183_sandbox_receipt_mutation before update or delete on public.gold_broker_sandbox_receipts for each row execute function public.prevent_v125_gold_learning_mutation();

create or replace function private.evaluate_v183_sandbox_receipt(p_receipt jsonb,p_as_of timestamptz)
returns jsonb language plpgsql stable security invoker set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  v_errors text[] := '{}'::text[]; v_event text; v_time timestamptz; v_age numeric;
  v_bid numeric; v_ask numeric; v_req numeric; v_fill numeric;
begin
  if jsonb_typeof(p_receipt) is distinct from 'object' or p_as_of is null or not isfinite(p_as_of) then
    v_errors:=array_append(v_errors,'INVALID_ENVELOPE');
  else
    if exists (select 1 from jsonb_object_keys(p_receipt) as k(key)
      where not (key = any(array['mode','asset','provenance','source_code','provider_symbol','sequence','observed_at','event_type','client_order_id','broker_order_id','side','requested_r','requested_price','fill_price','bid','ask','kill_switch_state']::text[])))
    then v_errors:=array_append(v_errors,'UNEXPECTED_FIELDS'); end if;
    if p_receipt->>'mode' is distinct from 'BROKER_DEMO_SANDBOX' or p_receipt->>'asset' is distinct from 'XAUUSD'
       or p_receipt->>'provenance' is distinct from 'DEMO_BROKER_USER_SUPPLIED'
    then v_errors:=array_append(v_errors,'SANDBOX_BOUNDARY_REQUIRED'); end if;
    if jsonb_typeof(p_receipt->'source_code') is distinct from 'string' or coalesce(p_receipt->>'source_code','') !~ '^[A-Z0-9_-]{3,64}$'
       or jsonb_typeof(p_receipt->'provider_symbol') is distinct from 'string' or coalesce(p_receipt->>'provider_symbol','') !~ '^XAUUSD[A-Za-z0-9._-]{0,16}$'
    then v_errors:=array_append(v_errors,'INVALID_SOURCE_OR_SYMBOL'); end if;
    if jsonb_typeof(p_receipt->'sequence') is distinct from 'number' or coalesce(p_receipt->>'sequence','') !~ '^[1-9][0-9]{0,15}$'
       or (p_receipt->>'sequence')::numeric>9007199254740991
    then v_errors:=array_append(v_errors,'INVALID_SEQUENCE'); end if;
    begin
      if jsonb_typeof(p_receipt->'observed_at') is distinct from 'string'
         or coalesce(p_receipt->>'observed_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+-][0-9]{2}:[0-9]{2})$'
      then v_errors:=array_append(v_errors,'INVALID_TIMESTAMP');
      else
        v_time:=(p_receipt->>'observed_at')::timestamptz;
        if v_time is null or not isfinite(v_time) then v_errors:=array_append(v_errors,'INVALID_TIMESTAMP');
        else v_age:=extract(epoch from p_as_of-v_time);
          if v_age<0 then v_errors:=array_append(v_errors,'FUTURE_RECEIPT');
          elsif v_age>=30 then v_errors:=array_append(v_errors,'STALE_RECEIPT'); end if;
        end if;
      end if;
    exception when invalid_datetime_format or datetime_field_overflow then v_errors:=array_append(v_errors,'INVALID_TIMESTAMP'); end;
    v_event:=p_receipt->>'event_type';
    if v_event is null or v_event not in ('QUOTE','ORDER_ACK','FILL','CANCEL_ACK','KILL_SWITCH_ACK')
    then v_errors:=array_append(v_errors,'INVALID_EVENT_TYPE'); end if;
    if v_event='QUOTE' then
      if jsonb_typeof(p_receipt->'bid') is distinct from 'number' or jsonb_typeof(p_receipt->'ask') is distinct from 'number'
      then v_errors:=array_append(v_errors,'INVALID_BID_ASK');
      else v_bid:=(p_receipt->>'bid')::numeric; v_ask:=(p_receipt->>'ask')::numeric;
        if v_bid<=0 or v_ask<=v_bid or v_ask-v_bid>v_bid*0.02 then v_errors:=array_append(v_errors,'INVALID_BID_ASK'); end if;
      end if;
      if p_receipt ? 'fill_price' or p_receipt ? 'requested_price' or p_receipt ? 'broker_order_id' or p_receipt ? 'client_order_id' or p_receipt ? 'kill_switch_state'
      then v_errors:=array_append(v_errors,'QUOTE_FIELD_MISMATCH'); end if;
    elsif v_event in ('ORDER_ACK','FILL','CANCEL_ACK') then
      if coalesce(p_receipt->>'client_order_id','') !~ '^[A-Za-z0-9._:-]{1,96}$'
         or coalesce(p_receipt->>'broker_order_id','') !~ '^[A-Za-z0-9._:-]{1,96}$'
         or coalesce(p_receipt->>'side','') not in ('LONG','SHORT')
         or jsonb_typeof(p_receipt->'requested_r') is distinct from 'number'
         or jsonb_typeof(p_receipt->'requested_price') is distinct from 'number'
      then v_errors:=array_append(v_errors,'INVALID_ORDER_FIELDS');
      else v_req:=(p_receipt->>'requested_price')::numeric;
        if (p_receipt->>'requested_r')::numeric<=0 or (p_receipt->>'requested_r')::numeric>1 or v_req<=0
        then v_errors:=array_append(v_errors,'INVALID_ORDER_FIELDS'); end if;
      end if;
      if v_event='FILL' then
        if jsonb_typeof(p_receipt->'fill_price') is distinct from 'number' then v_errors:=array_append(v_errors,'INVALID_FILL');
        else v_fill:=(p_receipt->>'fill_price')::numeric; if v_fill<=0 then v_errors:=array_append(v_errors,'INVALID_FILL'); end if; end if;
      elsif p_receipt ? 'fill_price' then v_errors:=array_append(v_errors,'UNEXPECTED_FILL'); end if;
      if p_receipt ? 'bid' or p_receipt ? 'ask' or p_receipt ? 'kill_switch_state' then v_errors:=array_append(v_errors,'ORDER_FIELD_MISMATCH'); end if;
    elsif v_event='KILL_SWITCH_ACK' then
      if p_receipt->>'kill_switch_state' is distinct from 'ENGAGED' or p_receipt ? 'client_order_id' or p_receipt ? 'broker_order_id'
         or p_receipt ? 'fill_price' or p_receipt ? 'requested_price' or p_receipt ? 'requested_r' or p_receipt ? 'side'
         or p_receipt ? 'bid' or p_receipt ? 'ask'
      then v_errors:=array_append(v_errors,'INVALID_KILL_SWITCH_RECEIPT'); end if;
    end if;
  end if;
  return jsonb_build_object('ok',cardinality(v_errors)=0,'violations',to_jsonb(v_errors),'receipt_age_seconds',v_age,
    'sandbox_only',true,'execution_grade',false,'production_broker_verified',false,'live_order_submission_enabled',false,'capital_permission','0R');
end;$function$;
revoke all on function private.evaluate_v183_sandbox_receipt(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function private.evaluate_v183_sandbox_receipt(jsonb,timestamptz) to service_role;

create or replace function public.get_v183_gold_sandbox_certification_status()
returns jsonb language plpgsql stable security invoker set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  v_total integer:=0; v_quotes integer:=0; v_fills integer:=0; v_matched integer:=0; v_kills integer:=0;
  v_latest timestamptz; v_avg_spread numeric; v_avg_abs_slippage numeric; v_max_abs_slippage numeric;
  v_spread boolean:=false; v_slippage boolean:=false; v_recon boolean:=false; v_kill boolean:=false; v_ready boolean:=false;
  v_state text:='WAITING_FOR_SANDBOX_RECEIPTS';
begin
  select count(*)::int,count(*) filter(where event_type='QUOTE')::int,count(*) filter(where event_type='FILL')::int,
         count(*) filter(where event_type='KILL_SWITCH_ACK')::int,max(observed_at),
         avg(spread_points) filter(where event_type='QUOTE'),avg(abs(signed_slippage_points)) filter(where event_type='FILL'),
         max(abs(signed_slippage_points)) filter(where event_type='FILL')
  into v_total,v_quotes,v_fills,v_kills,v_latest,v_avg_spread,v_avg_abs_slippage,v_max_abs_slippage
  from public.gold_broker_sandbox_receipts where observed_at>=now()-interval '24 hours';
  select count(*)::int into v_matched from public.gold_broker_sandbox_receipts f
  where f.event_type='FILL' and f.observed_at>=now()-interval '24 hours'
    and exists(select 1 from public.gold_broker_sandbox_receipts a where a.owner_user_id=f.owner_user_id and a.source_code=f.source_code
      and a.event_type='ORDER_ACK' and a.client_order_id=f.client_order_id and a.broker_order_id=f.broker_order_id and a.observed_at<=f.observed_at);
  v_spread:=v_quotes>=5 and v_avg_spread is not null; v_slippage:=v_fills>=3 and v_avg_abs_slippage is not null;
  v_recon:=v_fills>=3 and v_matched=v_fills; v_kill:=v_kills>=1;
  v_ready:=v_spread and v_slippage and v_recon and v_kill and v_latest is not null and now()-v_latest<interval '30 minutes';
  v_state:=case when v_total=0 then 'WAITING_FOR_SANDBOX_RECEIPTS' when v_ready then 'SANDBOX_CERTIFICATION_COMPLETE_PRODUCTION_STILL_LOCKED' else 'SANDBOX_EVIDENCE_COLLECTING' end;
  return jsonb_build_object('ok',true,'version','v183-broker-sandbox-certification-v1','state',v_state,'checked_at',now(),'window_hours',24,
    'thresholds',jsonb_build_object('quote_receipts',5,'fill_receipts',3,'kill_switch_receipts',1,'freshness_minutes',30),
    'evidence',jsonb_build_object('total_receipts',v_total,'quote_receipts',v_quotes,'fill_receipts',v_fills,'reconciled_fill_receipts',v_matched,
      'kill_switch_receipts',v_kills,'latest_observed_at',v_latest,'avg_observed_spread_points',case when v_spread then round(v_avg_spread,6) else null end,
      'avg_abs_observed_slippage_points',case when v_slippage then round(v_avg_abs_slippage,6) else null end,'max_abs_observed_slippage_points',case when v_slippage then round(v_max_abs_slippage,6) else null end),
    'sandbox_gates',jsonb_build_object('observed_spread_available',v_spread,'observed_slippage_available',v_slippage,'order_reconciliation_tested',v_recon,'kill_switch_receipt_observed',v_kill,'sandbox_certification_complete',v_ready),
    'production_boundary',jsonb_build_object('production_broker_verified',false,'real_broker_connected',false,'execution_grade_quote_available',false,'measured_production_spread_available',false,'measured_production_slippage_available',false,'production_order_reconciliation_tested',false,'production_kill_switch_tested',false,'live_order_submission_enabled',false,'real_order_sent',false),
    'governance',jsonb_build_object('action_permitted','WAIT','capital_permission','0R','automatic_real_capital',false,'sandbox_evidence_can_unlock_capital',false,'human_release_required',true),
    'truth_label','BROKER_DEMO_SANDBOX_EVIDENCE_NOT_PRODUCTION_EXECUTION_PERMISSION');
end;$function$;
revoke all on function public.get_v183_gold_sandbox_certification_status() from public,anon,authenticated;
grant execute on function public.get_v183_gold_sandbox_certification_status() to service_role;

create or replace function public.ingest_v183_gold_sandbox_receipt(p_owner_user_id uuid,p_receipt jsonb)
returns jsonb language plpgsql security invoker set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  v_check jsonb; v_existing public.gold_broker_sandbox_receipts%rowtype; v_last public.gold_broker_sandbox_receipts%rowtype;
  v_payload jsonb; v_sha text; v_id bigint; v_status jsonb;
begin
  if p_owner_user_id is null or not exists(select 1 from public.owner_users where user_id=p_owner_user_id and active=true)
  then return jsonb_build_object('ok',false,'error','owner_only','capital_permission','0R'); end if;
  v_check:=private.evaluate_v183_sandbox_receipt(p_receipt,now());
  if v_check->'ok' is distinct from 'true'::jsonb then return v_check||jsonb_build_object('error','sandbox_receipt_rejected'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner_user_id::text||'|'||(p_receipt->>'source_code'),183));
  v_payload:=jsonb_strip_nulls(jsonb_build_object('mode','BROKER_DEMO_SANDBOX','asset','XAUUSD','provenance','DEMO_BROKER_USER_SUPPLIED',
    'source_code',p_receipt->>'source_code','provider_symbol',p_receipt->>'provider_symbol','sequence',(p_receipt->>'sequence')::bigint,
    'observed_at',(p_receipt->>'observed_at')::timestamptz,'event_type',p_receipt->>'event_type','client_order_id',p_receipt->>'client_order_id',
    'broker_order_id',p_receipt->>'broker_order_id','side',p_receipt->>'side',
    'requested_r',case when p_receipt ? 'requested_r' then (p_receipt->>'requested_r')::numeric else null end,
    'requested_price',case when p_receipt ? 'requested_price' then (p_receipt->>'requested_price')::numeric else null end,
    'fill_price',case when p_receipt ? 'fill_price' then (p_receipt->>'fill_price')::numeric else null end,
    'bid',case when p_receipt ? 'bid' then (p_receipt->>'bid')::numeric else null end,'ask',case when p_receipt ? 'ask' then (p_receipt->>'ask')::numeric else null end,
    'kill_switch_state',p_receipt->>'kill_switch_state'));
  v_sha:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from public.gold_broker_sandbox_receipts where owner_user_id=p_owner_user_id and source_code=p_receipt->>'source_code' and sequence=(p_receipt->>'sequence')::bigint;
  if found then
    if v_existing.payload_sha256<>v_sha then return v_check||jsonb_build_object('ok',false,'error','conflicting_replay'); end if;
    v_status:=public.get_v183_gold_sandbox_certification_status();
    return v_check||jsonb_build_object('state','DUPLICATE_ALREADY_RECORDED','receipt_id',v_existing.id,'inserted',false,'certification',v_status);
  end if;
  select * into v_last from public.gold_broker_sandbox_receipts where owner_user_id=p_owner_user_id and source_code=p_receipt->>'source_code' order by sequence desc limit 1;
  if found and ((p_receipt->>'sequence')::bigint<=v_last.sequence or (p_receipt->>'observed_at')::timestamptz<v_last.observed_at)
  then return v_check||jsonb_build_object('ok',false,'error','out_of_order_receipt'); end if;
  insert into public.gold_broker_sandbox_receipts(owner_user_id,source_code,provider_symbol,sequence,observed_at,event_type,client_order_id,broker_order_id,side,requested_r,requested_price,fill_price,bid,ask,kill_switch_state,payload_sha256)
  values(p_owner_user_id,p_receipt->>'source_code',p_receipt->>'provider_symbol',(p_receipt->>'sequence')::bigint,(p_receipt->>'observed_at')::timestamptz,p_receipt->>'event_type',
    p_receipt->>'client_order_id',p_receipt->>'broker_order_id',p_receipt->>'side',
    case when p_receipt ? 'requested_r' then (p_receipt->>'requested_r')::numeric else null end,
    case when p_receipt ? 'requested_price' then (p_receipt->>'requested_price')::numeric else null end,
    case when p_receipt ? 'fill_price' then (p_receipt->>'fill_price')::numeric else null end,
    case when p_receipt ? 'bid' then (p_receipt->>'bid')::numeric else null end,case when p_receipt ? 'ask' then (p_receipt->>'ask')::numeric else null end,
    p_receipt->>'kill_switch_state',v_sha) returning id into v_id;
  v_status:=public.get_v183_gold_sandbox_certification_status();
  return v_check||jsonb_build_object('state','SANDBOX_RECEIPT_RECORDED','receipt_id',v_id,'inserted',true,'payload_sha256',v_sha,'certification',v_status);
end;$function$;
revoke all on function public.ingest_v183_gold_sandbox_receipt(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_v183_gold_sandbox_receipt(uuid,jsonb) to service_role;

create or replace function private.selftest_v183_sandbox_receipt_contract()
returns jsonb language plpgsql stable security invoker set search_path to 'pg_catalog','pg_temp'
as $function$
declare v_now timestamptz:=now(); v_passed integer:=0; v_total constant integer:=6; v_case jsonb;
begin
  v_case:=private.evaluate_v183_sandbox_receipt(jsonb_build_object('mode','BROKER_DEMO_SANDBOX','asset','XAUUSD','provenance','DEMO_BROKER_USER_SUPPLIED','source_code','SELFTEST','provider_symbol','XAUUSD','sequence',1,'observed_at',v_now,'event_type','QUOTE','bid',4200.00,'ask',4200.20),v_now);
  if v_case->'ok'='true'::jsonb then v_passed:=v_passed+1; end if;
  v_case:=private.evaluate_v183_sandbox_receipt(jsonb_build_object('mode','BROKER_DEMO_SANDBOX','asset','XAUUSD','provenance','DEMO_BROKER_USER_SUPPLIED','source_code','SELFTEST','provider_symbol','XAUUSD','sequence',2,'observed_at',v_now,'event_type','ORDER_ACK','client_order_id','TFA-SELF-1','broker_order_id','DEMO-1','side','LONG','requested_r',0.10,'requested_price',4200.00),v_now);
  if v_case->'ok'='true'::jsonb then v_passed:=v_passed+1; end if;
  v_case:=private.evaluate_v183_sandbox_receipt(jsonb_build_object('mode','BROKER_DEMO_SANDBOX','asset','XAUUSD','provenance','DEMO_BROKER_USER_SUPPLIED','source_code','SELFTEST','provider_symbol','XAUUSD','sequence',3,'observed_at',v_now,'event_type','FILL','client_order_id','TFA-SELF-1','broker_order_id','DEMO-1','side','LONG','requested_r',0.10,'requested_price',4200.00,'fill_price',4200.15),v_now);
  if v_case->'ok'='true'::jsonb then v_passed:=v_passed+1; end if;
  v_case:=private.evaluate_v183_sandbox_receipt(jsonb_build_object('mode','BROKER_DEMO_SANDBOX','asset','XAUUSD','provenance','DEMO_BROKER_USER_SUPPLIED','source_code','SELFTEST','provider_symbol','XAUUSD','sequence',4,'observed_at',v_now,'event_type','KILL_SWITCH_ACK','kill_switch_state','ENGAGED'),v_now);
  if v_case->'ok'='true'::jsonb then v_passed:=v_passed+1; end if;
  v_case:=private.evaluate_v183_sandbox_receipt(jsonb_build_object('mode','LIVE','asset','XAUUSD','provenance','DEMO_BROKER_USER_SUPPLIED','source_code','SELFTEST','provider_symbol','XAUUSD','sequence',5,'observed_at',v_now,'event_type','QUOTE','bid',4200.00,'ask',4200.20),v_now);
  if v_case->'ok'='false'::jsonb then v_passed:=v_passed+1; end if;
  v_case:=private.evaluate_v183_sandbox_receipt(jsonb_build_object('mode','BROKER_DEMO_SANDBOX','asset','XAUUSD','provenance','DEMO_BROKER_USER_SUPPLIED','source_code','SELFTEST','provider_symbol','XAUUSD','sequence',6,'observed_at',v_now,'event_type','QUOTE','bid',4200.00,'ask',4200.20,'api_key','forbidden'),v_now);
  if v_case->'ok'='false'::jsonb then v_passed:=v_passed+1; end if;
  return jsonb_build_object('ok',v_passed=v_total,'version','v183-sandbox-receipt-contract-selftest-v1','passed',v_passed,'total',v_total,'capital_permission','0R','live_order_submission_enabled',false);
end;$function$;
revoke all on function private.selftest_v183_sandbox_receipt_contract() from public,anon,authenticated;
grant execute on function private.selftest_v183_sandbox_receipt_contract() to service_role;