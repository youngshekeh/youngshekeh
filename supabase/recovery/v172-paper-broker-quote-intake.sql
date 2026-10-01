-- V172 accepts owner-supplied demo quotes for paper observation only.
-- It cannot clear broker readiness, place orders or change canonical market feeds.
set local lock_timeout = '3s';
set local statement_timeout = '20s';

create function private.evaluate_v172_paper_quote(p_quote jsonb,p_as_of timestamptz)
returns jsonb language plpgsql stable security invoker
set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  v_errors text[] := '{}'::text[];
  v_time timestamptz;
  v_bid numeric;
  v_ask numeric;
  v_age numeric;
begin
  if jsonb_typeof(p_quote) is distinct from 'object' or p_as_of is null or not isfinite(p_as_of) then
    v_errors:=array_append(v_errors,'INVALID_ENVELOPE');
  else
    if p_quote->>'mode' is distinct from 'PAPER_DEMO'
       or p_quote->>'asset' is distinct from 'XAUUSD'
       or p_quote->>'provenance' is distinct from 'BROKER_DEMO_USER_SUPPLIED'
       or (p_quote ? 'broker_verified' and p_quote->'broker_verified' is distinct from 'false'::jsonb)
       or (p_quote ? 'execution_grade' and p_quote->'execution_grade' is distinct from 'false'::jsonb)
       or (p_quote ? 'live_order_submission_enabled' and p_quote->'live_order_submission_enabled' is distinct from 'false'::jsonb) then
      v_errors:=array_append(v_errors,'PAPER_BOUNDARY_REQUIRED');
    end if;
    if jsonb_typeof(p_quote->'source_code') is distinct from 'string'
       or coalesce(p_quote->>'source_code','') !~ '^[A-Z0-9_-]{3,64}$'
       or jsonb_typeof(p_quote->'provider_symbol') is distinct from 'string'
       or coalesce(p_quote->>'provider_symbol','') !~ '^XAUUSD[A-Za-z0-9._-]{0,16}$' then
      v_errors:=array_append(v_errors,'INVALID_SOURCE_OR_SYMBOL');
    end if;
    if jsonb_typeof(p_quote->'sequence') is distinct from 'number'
       or coalesce(p_quote->>'sequence','') !~ '^[1-9][0-9]{0,15}$' then
      v_errors:=array_append(v_errors,'INVALID_SEQUENCE');
    elsif (p_quote->>'sequence')::numeric>9007199254740991 then
      v_errors:=array_append(v_errors,'INVALID_SEQUENCE');
    end if;
    if jsonb_typeof(p_quote->'bid') is distinct from 'number'
       or jsonb_typeof(p_quote->'ask') is distinct from 'number' then
      v_errors:=array_append(v_errors,'INVALID_BID_ASK');
    else
      v_bid:=(p_quote->>'bid')::numeric; v_ask:=(p_quote->>'ask')::numeric;
      if v_bid<=0 or v_ask<=v_bid or v_ask-v_bid>v_bid*0.02 then
        v_errors:=array_append(v_errors,'INVALID_BID_ASK');
      end if;
    end if;
    begin
      if jsonb_typeof(p_quote->'observed_at') is distinct from 'string'
         or coalesce(p_quote->>'observed_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+-][0-9]{2}:[0-9]{2})$' then
        v_errors:=array_append(v_errors,'INVALID_TIMESTAMP');
      else
        v_time:=(p_quote->>'observed_at')::timestamptz;
        if v_time is null or not isfinite(v_time) then
          v_errors:=array_append(v_errors,'INVALID_TIMESTAMP');
        else
          v_age:=extract(epoch from p_as_of-v_time);
          if v_age<0 then v_errors:=array_append(v_errors,'FUTURE_QUOTE');
          elsif v_age>=10 then v_errors:=array_append(v_errors,'STALE_QUOTE'); end if;
        end if;
      end if;
    exception when invalid_datetime_format or datetime_field_overflow then
      v_errors:=array_append(v_errors,'INVALID_TIMESTAMP');
    end;
  end if;
  return jsonb_build_object('ok',cardinality(v_errors)=0,'violations',to_jsonb(v_errors),
    'quote_age_seconds',v_age,'spread_points',case when cardinality(v_errors)=0 then v_ask-v_bid else null end,
    'execution_grade',false,'broker_verified',false,'live_order_submission_enabled',false,
    'capital_permission','0R','mode','PAPER_DEMO');
end;
$function$;
revoke all on function private.evaluate_v172_paper_quote(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function private.evaluate_v172_paper_quote(jsonb,timestamptz) to service_role;

create table public.gold_paper_broker_quotes (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  owner_user_id uuid not null,
  source_code text not null check (source_code ~ '^[A-Z0-9_-]{3,64}$'),
  provider_symbol text not null check (provider_symbol ~ '^XAUUSD[A-Za-z0-9._-]{0,16}$'),
  sequence bigint not null check (sequence>0 and sequence<=9007199254740991),
  observed_at timestamptz not null,
  bid numeric not null check (bid>0),
  ask numeric not null check (ask>bid and ask-bid<=bid*0.02),
  mode text not null default 'PAPER_DEMO' check (mode='PAPER_DEMO'),
  provenance text not null default 'BROKER_DEMO_USER_SUPPLIED' check (provenance='BROKER_DEMO_USER_SUPPLIED'),
  execution_grade boolean not null default false check (execution_grade=false),
  broker_verified boolean not null default false check (broker_verified=false),
  live_order_submission_enabled boolean not null default false check (live_order_submission_enabled=false),
  payload_sha256 text not null,
  unique(owner_user_id,source_code,sequence)
);
alter table public.gold_paper_broker_quotes enable row level security;
revoke all on table public.gold_paper_broker_quotes from public,anon,authenticated;
grant select,insert on table public.gold_paper_broker_quotes to service_role;
grant usage,select on sequence public.gold_paper_broker_quotes_id_seq to service_role;
create index gold_paper_broker_quotes_latest_idx on public.gold_paper_broker_quotes(received_at desc,id desc);
create trigger prevent_v172_quote_mutation before update or delete on public.gold_paper_broker_quotes
for each row execute function public.prevent_v125_gold_learning_mutation();

create function public.ingest_v172_gold_paper_quote(p_owner_user_id uuid,p_quote jsonb)
returns jsonb language plpgsql security invoker
set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  v_check jsonb;
  v_last public.gold_paper_broker_quotes%rowtype;
  v_existing public.gold_paper_broker_quotes%rowtype;
  v_payload jsonb;
  v_sha text;
  v_id bigint;
begin
  if p_owner_user_id is null or not exists(select 1 from public.owner_users where user_id=p_owner_user_id and active=true) then
    return jsonb_build_object('ok',false,'error','owner_only','capital_permission','0R');
  end if;
  v_check:=private.evaluate_v172_paper_quote(p_quote,now());
  if v_check->'ok' is distinct from 'true'::jsonb then
    return v_check||jsonb_build_object('error','quote_rejected');
  end if;
  -- Serialize same-owner/source intake before replay checks and append-only insertion.
  perform pg_advisory_xact_lock(hashtextextended(p_owner_user_id::text||'|'||(p_quote->>'source_code'),172));
  v_payload:=jsonb_build_object('asset','XAUUSD','mode','PAPER_DEMO','provenance','BROKER_DEMO_USER_SUPPLIED',
    'source_code',p_quote->>'source_code','provider_symbol',p_quote->>'provider_symbol',
    'sequence',(p_quote->>'sequence')::bigint,'observed_at',(p_quote->>'observed_at')::timestamptz,
    'bid',(p_quote->>'bid')::numeric,'ask',(p_quote->>'ask')::numeric);
  v_sha:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from public.gold_paper_broker_quotes
    where owner_user_id=p_owner_user_id and source_code=p_quote->>'source_code' and sequence=(p_quote->>'sequence')::bigint;
  if found then
    if v_existing.payload_sha256<>v_sha then
      return v_check||jsonb_build_object('ok',false,'error','conflicting_replay');
    end if;
    return v_check||jsonb_build_object('state','DUPLICATE_ALREADY_RECORDED','receipt_id',v_existing.id,'inserted',false);
  end if;
  select * into v_last from public.gold_paper_broker_quotes
    where owner_user_id=p_owner_user_id and source_code=p_quote->>'source_code' order by sequence desc limit 1;
  if found then
    if (p_quote->>'sequence')::bigint<=v_last.sequence or (p_quote->>'observed_at')::timestamptz<v_last.observed_at then
      return v_check||jsonb_build_object('ok',false,'error','out_of_order_quote');
    end if;
    if now()-v_last.received_at<interval '1 second' then
      return v_check||jsonb_build_object('ok',false,'error','paper_intake_rate_limit');
    end if;
  end if;
  insert into public.gold_paper_broker_quotes(owner_user_id,source_code,provider_symbol,sequence,observed_at,bid,ask,payload_sha256)
  values(p_owner_user_id,p_quote->>'source_code',p_quote->>'provider_symbol',(p_quote->>'sequence')::bigint,
    (p_quote->>'observed_at')::timestamptz,(p_quote->>'bid')::numeric,(p_quote->>'ask')::numeric,v_sha)
  returning id into v_id;
  return v_check||jsonb_build_object('state','PAPER_QUOTE_RECORDED','receipt_id',v_id,'inserted',true,'payload_sha256',v_sha);
end;
$function$;
revoke all on function public.ingest_v172_gold_paper_quote(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_v172_gold_paper_quote(uuid,jsonb) to service_role;

create function public.get_v172_gold_paper_quote_status()
returns jsonb language plpgsql stable security invoker
set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  v_quote public.gold_paper_broker_quotes%rowtype;
  v_state text:='NOT_CONNECTED';
  v_fresh boolean:=false;
begin
  select * into v_quote from public.gold_paper_broker_quotes order by received_at desc,id desc limit 1;
  if found then
    v_fresh:=v_quote.observed_at<=now() and now()-v_quote.observed_at<interval '10 seconds'
      and v_quote.received_at<=now() and now()-v_quote.received_at<interval '10 seconds';
    v_state:=case when v_fresh then 'PAPER_QUOTE_FRESH_UNVERIFIED' else 'PAPER_QUOTE_STALE' end;
  end if;
  return jsonb_build_object('ok',true,'version','v172-paper-broker-quote-intake-v1','state',v_state,
    'checked_at',now(),'freshness_limit_seconds',10,'broker_connection_verified',false,
    'latest_quote',case when v_quote.id is null then null else jsonb_build_object(
      'provider_symbol',v_quote.provider_symbol,'observed_at',v_quote.observed_at,'received_at',v_quote.received_at,
      'expires_at',least(v_quote.observed_at,v_quote.received_at)+interval '10 seconds',
      'age_seconds',round(extract(epoch from now()-v_quote.observed_at),3),
      'bid',case when v_fresh then v_quote.bid else null end,'ask',case when v_fresh then v_quote.ask else null end,
      'spread_points',case when v_fresh then v_quote.ask-v_quote.bid else null end,
      'mode','PAPER_DEMO','provenance','BROKER_DEMO_USER_SUPPLIED') end,
    'governance',jsonb_build_object('action_permitted','WAIT','capital_permission','0R',
      'live_order_submission_enabled',false,'execution_grade',false,'paper_quotes_can_unlock_capital',false));
end;
$function$;
revoke all on function public.get_v172_gold_paper_quote_status() from public,anon,authenticated;
grant execute on function public.get_v172_gold_paper_quote_status() to service_role;
