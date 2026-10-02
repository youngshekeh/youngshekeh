-- V186 Read-Only Live XAUUSD Market Data Spine
create table if not exists public.gold_live_market_bridges (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  owner_user_id uuid not null,
  bridge_label text not null check (char_length(bridge_label) between 1 and 80),
  source_code text not null check (source_code ~ '^[A-Z0-9_-]{3,64}$'),
  provider_symbol text not null check (provider_symbol ~ '^XAUUSD[A-Za-z0-9._-]{0,16}$'),
  key_sha256 text not null unique check (key_sha256 ~ '^[a-f0-9]{64}$'),
  last_used_at timestamptz,
  use_count bigint not null default 0 check (use_count>=0),
  revoked_at timestamptz,
  mode text not null default 'READ_ONLY_LIVE_MARKET_DATA' check (mode='READ_ONLY_LIVE_MARKET_DATA'),
  production_capable boolean not null default false check (production_capable=false),
  live_order_submission_enabled boolean not null default false check (live_order_submission_enabled=false)
);
alter table public.gold_live_market_bridges enable row level security;
revoke all on table public.gold_live_market_bridges from public,anon,authenticated;
grant select,insert,update on table public.gold_live_market_bridges to service_role;
grant usage,select on sequence public.gold_live_market_bridges_id_seq to service_role;
create unique index if not exists gold_live_market_bridges_active_source_uq
  on public.gold_live_market_bridges(owner_user_id,source_code) where revoked_at is null;

create table if not exists public.gold_live_xauusd_ticks (
  id bigint generated always as identity primary key,
  bridge_id bigint not null references public.gold_live_market_bridges(id) on delete restrict,
  received_at timestamptz not null default now(),
  observed_at timestamptz not null,
  sequence bigint not null check (sequence>0 and sequence<=9007199254740991),
  trade_mode text not null check (trade_mode in ('DEMO','REAL')),
  bid numeric not null check (bid>0),
  ask numeric not null check (ask>0 and ask>=bid),
  last numeric,
  terminal_tick_time_msc bigint not null check (terminal_tick_time_msc>0),
  tick_flags integer not null check (tick_flags>=0),
  volume_real numeric not null default 0 check (volume_real>=0),
  terminal_build integer not null check (terminal_build>0),
  terminal_connected boolean not null check (terminal_connected=true),
  digits integer not null check (digits between 1 and 6),
  point numeric not null check (point>0 and point<=1),
  relay_version text not null check (relay_version='v186.0'),
  mt5_package_version text not null check (mt5_package_version='5.0.6231'),
  os_family text not null check (os_family='Windows'),
  midpoint numeric generated always as ((bid+ask)/2) stored,
  spread_usd numeric generated always as (ask-bid) stored,
  spread_ticks numeric generated always as ((ask-bid)/point) stored,
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  unique(bridge_id,sequence)
);
alter table public.gold_live_xauusd_ticks enable row level security;
revoke all on table public.gold_live_xauusd_ticks from public,anon,authenticated;
grant select,insert on table public.gold_live_xauusd_ticks to service_role;
grant usage,select on sequence public.gold_live_xauusd_ticks_id_seq to service_role;
create index if not exists gold_live_xauusd_ticks_recent_idx on public.gold_live_xauusd_ticks(bridge_id,observed_at desc,id desc);
create index if not exists gold_live_xauusd_ticks_time_idx on public.gold_live_xauusd_ticks(observed_at desc,id desc);
drop trigger if exists prevent_v186_live_tick_mutation on public.gold_live_xauusd_ticks;
create trigger prevent_v186_live_tick_mutation before update or delete on public.gold_live_xauusd_ticks
for each row execute function public.prevent_v125_gold_learning_mutation();

CREATE OR REPLACE FUNCTION public.authenticate_v186_gold_live_market_bridge(p_bridge_id bigint, p_key_sha256 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare v_bridge public.gold_live_market_bridges%rowtype;
begin
  if p_bridge_id is null or p_bridge_id<=0 or p_key_sha256 is null or p_key_sha256 !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('ok',false,'error','invalid_bridge_credential','capital_permission','0R');
  end if;
  update public.gold_live_market_bridges
  set last_used_at=now(),use_count=use_count+1
  where id=p_bridge_id and key_sha256=p_key_sha256 and revoked_at is null
  returning * into v_bridge;
  if not found then
    return jsonb_build_object('ok',false,'error','invalid_bridge_credential','capital_permission','0R');
  end if;
  return jsonb_build_object(
    'ok',true,'state','LIVE_MARKET_BRIDGE_AUTHENTICATED',
    'bridge_id',v_bridge.id,'owner_user_id',v_bridge.owner_user_id,
    'source_code',v_bridge.source_code,'provider_symbol',v_bridge.provider_symbol,
    'mode','READ_ONLY_LIVE_MARKET_DATA','market_data_only',true,
    'production_capable',false,'live_order_submission_enabled',false,'capital_permission','0R'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_v186_gold_live_market_bridge(p_owner_user_id uuid, p_bridge_label text, p_source_code text, p_provider_symbol text, p_key_sha256 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare v_id bigint;
begin
  if p_owner_user_id is null
     or not exists(select 1 from public.owner_users where user_id=p_owner_user_id and active=true) then
    return jsonb_build_object('ok',false,'error','owner_only','capital_permission','0R');
  end if;
  if p_bridge_label is null or char_length(trim(p_bridge_label)) not between 1 and 80
     or p_source_code is null or p_source_code !~ '^[A-Z0-9_-]{3,64}$'
     or p_provider_symbol is null or p_provider_symbol !~ '^XAUUSD[A-Za-z0-9._-]{0,16}$'
     or p_key_sha256 is null or p_key_sha256 !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('ok',false,'error','invalid_bridge_configuration','capital_permission','0R');
  end if;
  if exists(select 1 from public.gold_live_market_bridges
            where owner_user_id=p_owner_user_id and source_code=p_source_code and revoked_at is null) then
    return jsonb_build_object('ok',false,'error','active_bridge_already_exists','capital_permission','0R');
  end if;
  insert into public.gold_live_market_bridges(owner_user_id,bridge_label,source_code,provider_symbol,key_sha256)
  values(p_owner_user_id,trim(p_bridge_label),p_source_code,p_provider_symbol,p_key_sha256)
  returning id into v_id;
  return jsonb_build_object(
    'ok',true,'version','v186-live-xauusd-v1','state','LIVE_MARKET_BRIDGE_CREATED',
    'bridge_id',v_id,'bridge_label',trim(p_bridge_label),'source_code',p_source_code,
    'provider_symbol',p_provider_symbol,'mode','READ_ONLY_LIVE_MARKET_DATA',
    'production_capable',false,'live_order_submission_enabled',false,'capital_permission','0R'
  );
exception when unique_violation then
  return jsonb_build_object('ok',false,'error','bridge_conflict','capital_permission','0R');
end;
$function$;

CREATE OR REPLACE FUNCTION private.evaluate_v186_gold_live_tick(p_tick jsonb, p_as_of timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_errors text[]:='{}'::text[];
  v_observed timestamptz;
  v_age numeric;
  v_bid numeric;
  v_ask numeric;
  v_point numeric;
begin
  if jsonb_typeof(p_tick) is distinct from 'object'
     or p_as_of is null or not isfinite(p_as_of) then
    v_errors:=array_append(v_errors,'INVALID_ENVELOPE');
  else
    if exists(
      select 1 from jsonb_object_keys(p_tick) k(key)
      where not (key=any(array[
        'observed_at','sequence','trade_mode','bid','ask','last','terminal_tick_time_msc',
        'tick_flags','volume_real','terminal_build','terminal_connected','digits','point',
        'relay_version','mt5_package_version','os_family'
      ]::text[]))
    ) then v_errors:=array_append(v_errors,'UNEXPECTED_FIELDS'); end if;

    begin
      if jsonb_typeof(p_tick->'observed_at') is distinct from 'string'
         or coalesce(p_tick->>'observed_at','') !~
           '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+-][0-9]{2}:[0-9]{2})$' then
        v_errors:=array_append(v_errors,'INVALID_TIMESTAMP');
      else
        v_observed:=(p_tick->>'observed_at')::timestamptz;
        v_age:=extract(epoch from p_as_of-v_observed);
        if v_age < -5 then v_errors:=array_append(v_errors,'FUTURE_TICK');
        elsif v_age >= 10 then v_errors:=array_append(v_errors,'STALE_TICK'); end if;
      end if;
    exception when invalid_datetime_format or datetime_field_overflow then
      v_errors:=array_append(v_errors,'INVALID_TIMESTAMP');
    end;

    if jsonb_typeof(p_tick->'sequence') is distinct from 'number'
       or coalesce(p_tick->>'sequence','') !~ '^[1-9][0-9]{0,15}$'
       or (p_tick->>'sequence')::numeric>9007199254740991 then
      v_errors:=array_append(v_errors,'INVALID_SEQUENCE');
    end if;

    if p_tick->>'trade_mode' not in ('DEMO','REAL') then
      v_errors:=array_append(v_errors,'INVALID_TRADE_MODE');
    end if;

    if jsonb_typeof(p_tick->'bid') is distinct from 'number'
       or jsonb_typeof(p_tick->'ask') is distinct from 'number' then
      v_errors:=array_append(v_errors,'INVALID_BID_ASK');
    else
      v_bid:=(p_tick->>'bid')::numeric;
      v_ask:=(p_tick->>'ask')::numeric;
      if v_bid<=0 or v_ask<v_bid or v_ask-v_bid>v_bid*0.01 then
        v_errors:=array_append(v_errors,'INVALID_BID_ASK');
      end if;
    end if;

    if p_tick ? 'last' and jsonb_typeof(p_tick->'last') is distinct from 'number' then
      v_errors:=array_append(v_errors,'INVALID_LAST');
    end if;

    if jsonb_typeof(p_tick->'terminal_tick_time_msc') is distinct from 'number'
       or coalesce(p_tick->>'terminal_tick_time_msc','') !~ '^[1-9][0-9]{9,15}$'
       or jsonb_typeof(p_tick->'tick_flags') is distinct from 'number'
       or coalesce(p_tick->>'tick_flags','') !~ '^[0-9]{1,10}$'
       or jsonb_typeof(p_tick->'volume_real') is distinct from 'number'
       or (p_tick->>'volume_real')::numeric<0 then
      v_errors:=array_append(v_errors,'INVALID_TICK_METADATA');
    end if;

    if jsonb_typeof(p_tick->'terminal_build') is distinct from 'number'
       or coalesce(p_tick->>'terminal_build','') !~ '^[1-9][0-9]{0,8}$'
       or p_tick->'terminal_connected' is distinct from 'true'::jsonb
       or jsonb_typeof(p_tick->'digits') is distinct from 'number'
       or coalesce(p_tick->>'digits','') !~ '^[1-6]$'
       or jsonb_typeof(p_tick->'point') is distinct from 'number' then
      v_errors:=array_append(v_errors,'INVALID_TERMINAL_METADATA');
    else
      v_point:=(p_tick->>'point')::numeric;
      if v_point<=0 or v_point>1 then v_errors:=array_append(v_errors,'INVALID_TERMINAL_METADATA'); end if;
    end if;

    if p_tick->>'relay_version' is distinct from 'v186.0'
       or p_tick->>'mt5_package_version' is distinct from '5.0.6231'
       or p_tick->>'os_family' is distinct from 'Windows' then
      v_errors:=array_append(v_errors,'INVALID_CLIENT_VERSION');
    end if;
  end if;

  return jsonb_build_object(
    'ok',cardinality(v_errors)=0,
    'violations',to_jsonb(v_errors),
    'tick_age_seconds',v_age,
    'market_data_only',true,
    'machine_execution_allowed',false,
    'live_order_submission_enabled',false,
    'capital_permission','0R'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_v186_gold_live_market_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_tick public.gold_live_xauusd_ticks%rowtype;
  v_bridge public.gold_live_market_bridges%rowtype;
  v_age numeric;
  v_state text:='WAITING_FOR_LIVE_MARKET_BRIDGE';
  v_tick_60 integer:=0;
  v_tick_5m integer:=0;
  v_high numeric;
  v_low numeric;
  v_avg_spread numeric;
  v_max_spread numeric;
  v_real boolean:=false;
  v_fresh boolean:=false;
begin
  select t.* into v_tick
  from public.gold_live_xauusd_ticks t
  join public.gold_live_market_bridges b on b.id=t.bridge_id
  where b.revoked_at is null
  order by t.observed_at desc,t.id desc
  limit 1;

  if not found then
    if exists(select 1 from public.gold_live_market_bridges where revoked_at is null) then
      v_state:='LIVE_MARKET_BRIDGE_WAITING_FOR_TICK';
    end if;
    return jsonb_build_object(
      'ok',true,'version','v186-live-xauusd-v1','state',v_state,'checked_at',now(),
      'symbol','XAUUSD','quote',null,
      'quality',jsonb_build_object('fresh',false,'tick_count_60s',0,'tick_count_5m',0),
      'source',jsonb_build_object('kind','MT5_READ_ONLY_BROKER','connected',false),
      'governance',jsonb_build_object(
        'action_permitted','WAIT','capital_permission','0R','machine_execution_allowed',false,
        'live_order_submission_enabled',false,'market_data_only',true
      )
    );
  end if;

  select * into v_bridge from public.gold_live_market_bridges where id=v_tick.bridge_id;
  v_age:=extract(epoch from now()-v_tick.observed_at);
  v_real:=v_tick.trade_mode='REAL';
  v_fresh:=v_age<3;
  v_state:=case
    when v_age<3 then 'BROKER_LIVE'
    when v_age<15 then 'BROKER_LAGGING'
    else 'BROKER_STALE'
  end;

  select
    count(*) filter(where observed_at>=now()-interval '60 seconds')::int,
    count(*)::int,
    max(midpoint),min(midpoint),avg(spread_usd),max(spread_usd)
  into v_tick_60,v_tick_5m,v_high,v_low,v_avg_spread,v_max_spread
  from public.gold_live_xauusd_ticks
  where bridge_id=v_tick.bridge_id and observed_at>=now()-interval '5 minutes';

  return jsonb_build_object(
    'ok',true,'version','v186-live-xauusd-v1','state',v_state,'checked_at',now(),
    'symbol','XAUUSD',
    'quote',jsonb_build_object(
      'bid',round(v_tick.bid,6),'ask',round(v_tick.ask,6),'mid',round(v_tick.midpoint,6),
      'last',v_tick.last,'spread_usd',round(v_tick.spread_usd,6),
      'spread_ticks',round(v_tick.spread_ticks,2),'point',v_tick.point,'digits',v_tick.digits,
      'observed_at',v_tick.observed_at,'received_at',v_tick.received_at,
      'age_seconds',round(v_age,3),'trade_mode',v_tick.trade_mode,
      'real_account_quote',v_real,'terminal_tick_time_msc',v_tick.terminal_tick_time_msc
    ),
    'quality',jsonb_build_object(
      'fresh',v_fresh,'tick_count_60s',v_tick_60,'tick_count_5m',v_tick_5m,
      'tick_rate_per_second_60s',round(v_tick_60::numeric/60,3),
      'high_5m',round(v_high,6),'low_5m',round(v_low,6),
      'range_5m',case when v_high is null or v_low is null then null else round(v_high-v_low,6) end,
      'avg_spread_5m',round(v_avg_spread,6),'max_spread_5m',round(v_max_spread,6),
      'manual_execution_reference',v_real and v_fresh
    ),
    'source',jsonb_build_object(
      'kind','MT5_READ_ONLY_BROKER','connected',true,'bridge_id',v_bridge.id,
      'bridge_label',v_bridge.bridge_label,'source_code',v_bridge.source_code,
      'provider_symbol',v_bridge.provider_symbol,'terminal_build',v_tick.terminal_build,
      'relay_version',v_tick.relay_version,'mt5_package_version',v_tick.mt5_package_version
    ),
    'governance',jsonb_build_object(
      'action_permitted','WAIT','capital_permission','0R','machine_execution_allowed',false,
      'live_order_submission_enabled',false,'market_data_only',true,
      'real_account_quote_does_not_unlock_capital',true
    ),
    'truth_label','BROKER_LIVE_READ_ONLY_MARKET_DATA'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_v186_gold_live_tick(p_bridge_id bigint, p_tick jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_check jsonb;
  v_bridge public.gold_live_market_bridges%rowtype;
  v_existing public.gold_live_xauusd_ticks%rowtype;
  v_last public.gold_live_xauusd_ticks%rowtype;
  v_payload jsonb;
  v_sha text;
  v_id bigint;
begin
  select * into v_bridge from public.gold_live_market_bridges
  where id=p_bridge_id and revoked_at is null;
  if not found then
    return jsonb_build_object('ok',false,'error','bridge_not_active','capital_permission','0R');
  end if;

  v_check:=private.evaluate_v186_gold_live_tick(p_tick,now());
  if v_check->'ok' is distinct from 'true'::jsonb then
    return v_check||jsonb_build_object('error','live_tick_rejected');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('v186|'||p_bridge_id::text,186));

  v_payload:=jsonb_build_object(
    'bridge_id',p_bridge_id,
    'observed_at',(p_tick->>'observed_at')::timestamptz,
    'sequence',(p_tick->>'sequence')::bigint,
    'trade_mode',p_tick->>'trade_mode',
    'bid',(p_tick->>'bid')::numeric,
    'ask',(p_tick->>'ask')::numeric,
    'last',case when p_tick ? 'last' then (p_tick->>'last')::numeric else null end,
    'terminal_tick_time_msc',(p_tick->>'terminal_tick_time_msc')::bigint,
    'tick_flags',(p_tick->>'tick_flags')::integer,
    'volume_real',(p_tick->>'volume_real')::numeric,
    'terminal_build',(p_tick->>'terminal_build')::integer,
    'terminal_connected',true,
    'digits',(p_tick->>'digits')::integer,
    'point',(p_tick->>'point')::numeric,
    'relay_version','v186.0',
    'mt5_package_version','5.0.6231',
    'os_family','Windows'
  );
  v_sha:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');

  select * into v_existing from public.gold_live_xauusd_ticks
  where bridge_id=p_bridge_id and sequence=(p_tick->>'sequence')::bigint;
  if found then
    if v_existing.payload_sha256<>v_sha then
      return v_check||jsonb_build_object('ok',false,'error','conflicting_tick_replay');
    end if;
    return v_check||jsonb_build_object(
      'state','DUPLICATE_TICK_ALREADY_RECORDED','tick_id',v_existing.id,'inserted',false
    );
  end if;

  select * into v_last from public.gold_live_xauusd_ticks
  where bridge_id=p_bridge_id order by sequence desc limit 1;
  if found and (
    (p_tick->>'sequence')::bigint<=v_last.sequence
    or (p_tick->>'observed_at')::timestamptz<v_last.observed_at
  ) then
    return v_check||jsonb_build_object('ok',false,'error','out_of_order_tick');
  end if;

  insert into public.gold_live_xauusd_ticks(
    bridge_id,observed_at,sequence,trade_mode,bid,ask,last,
    terminal_tick_time_msc,tick_flags,volume_real,terminal_build,terminal_connected,
    digits,point,relay_version,mt5_package_version,os_family,payload_sha256
  ) values (
    p_bridge_id,(p_tick->>'observed_at')::timestamptz,(p_tick->>'sequence')::bigint,
    p_tick->>'trade_mode',(p_tick->>'bid')::numeric,(p_tick->>'ask')::numeric,
    case when p_tick ? 'last' then (p_tick->>'last')::numeric else null end,
    (p_tick->>'terminal_tick_time_msc')::bigint,(p_tick->>'tick_flags')::integer,
    (p_tick->>'volume_real')::numeric,(p_tick->>'terminal_build')::integer,true,
    (p_tick->>'digits')::integer,(p_tick->>'point')::numeric,'v186.0','5.0.6231','Windows',v_sha
  ) returning id into v_id;

  return v_check||jsonb_build_object(
    'state','LIVE_XAUUSD_TICK_RECORDED','tick_id',v_id,'inserted',true,
    'bridge_id',p_bridge_id,'source_code',v_bridge.source_code,
    'provider_symbol',v_bridge.provider_symbol,'trade_mode',p_tick->>'trade_mode'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_v186_gold_live_market_bridges(p_owner_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
begin
  if p_owner_user_id is null
     or not exists(select 1 from public.owner_users where user_id=p_owner_user_id and active=true) then
    return jsonb_build_object('ok',false,'error','owner_only','capital_permission','0R');
  end if;
  return jsonb_build_object(
    'ok',true,'version','v186-live-xauusd-v1',
    'bridges',coalesce((
      select jsonb_agg(jsonb_build_object(
        'bridge_id',id,'bridge_label',bridge_label,'source_code',source_code,
        'provider_symbol',provider_symbol,'created_at',created_at,'last_used_at',last_used_at,
        'use_count',use_count,'active',revoked_at is null,'revoked_at',revoked_at,
        'mode','READ_ONLY_LIVE_MARKET_DATA','production_capable',false,'live_order_submission_enabled',false
      ) order by created_at desc)
      from public.gold_live_market_bridges where owner_user_id=p_owner_user_id
    ),'[]'::jsonb),
    'governance',jsonb_build_object(
      'action_permitted','WAIT','capital_permission','0R','live_order_submission_enabled',false,
      'market_data_only',true
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_v186_gold_live_market_bridge(p_owner_user_id uuid, p_bridge_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare v_count integer;
begin
  update public.gold_live_market_bridges
  set revoked_at=now()
  where id=p_bridge_id and owner_user_id=p_owner_user_id and revoked_at is null;
  get diagnostics v_count=row_count;
  return jsonb_build_object(
    'ok',v_count=1,'state',case when v_count=1 then 'LIVE_MARKET_BRIDGE_REVOKED' else 'BRIDGE_NOT_ACTIVE' end,
    'bridge_id',p_bridge_id,'capital_permission','0R','live_order_submission_enabled',false
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.selftest_v186_gold_live_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_now timestamptz:=now();
  v_passed integer:=0;
  v_total constant integer:=4;
  v_case jsonb;
begin
  v_case:=private.evaluate_v186_gold_live_tick(jsonb_build_object(
    'observed_at',v_now,'sequence',1,'trade_mode','REAL','bid',4165.10,'ask',4165.30,
    'last',4165.20,'terminal_tick_time_msc',1790964000123,'tick_flags',6,'volume_real',0,
    'terminal_build',6200,'terminal_connected',true,'digits',2,'point',0.01,
    'relay_version','v186.0','mt5_package_version','5.0.6231','os_family','Windows'
  ),v_now);
  if v_case->'ok'='true'::jsonb then v_passed:=v_passed+1; end if;

  v_case:=private.evaluate_v186_gold_live_tick(jsonb_build_object(
    'observed_at',v_now,'sequence',2,'trade_mode','DEMO','bid',4165.10,'ask',4165.30,
    'last',4165.20,'terminal_tick_time_msc',1790964000124,'tick_flags',6,'volume_real',0,
    'terminal_build',6200,'terminal_connected',true,'digits',2,'point',0.01,
    'relay_version','v186.0','mt5_package_version','5.0.6231','os_family','Windows'
  ),v_now);
  if v_case->'ok'='true'::jsonb then v_passed:=v_passed+1; end if;

  v_case:=private.evaluate_v186_gold_live_tick(jsonb_build_object(
    'observed_at',v_now,'sequence',3,'trade_mode','LIVE','bid',4165.10,'ask',4165.30,
    'terminal_tick_time_msc',1790964000125,'tick_flags',6,'volume_real',0,
    'terminal_build',6200,'terminal_connected',true,'digits',2,'point',0.01,
    'relay_version','v186.0','mt5_package_version','5.0.6231','os_family','Windows'
  ),v_now);
  if v_case->'ok'='false'::jsonb then v_passed:=v_passed+1; end if;

  v_case:=private.evaluate_v186_gold_live_tick(jsonb_build_object(
    'observed_at',v_now,'sequence',4,'trade_mode','REAL','bid',4165.10,'ask',4165.30,
    'terminal_tick_time_msc',1790964000126,'tick_flags',6,'volume_real',0,
    'terminal_build',6200,'terminal_connected',true,'digits',2,'point',0.01,
    'relay_version','v186.0','mt5_package_version','5.0.6231','os_family','Windows',
    'password','forbidden'
  ),v_now);
  if v_case->'ok'='false'::jsonb then v_passed:=v_passed+1; end if;

  return jsonb_build_object(
    'ok',v_passed=v_total,'version','v186-live-tick-selftest-v1',
    'passed',v_passed,'total',v_total,'capital_permission','0R',
    'live_order_submission_enabled',false
  );
end;
$function$;

revoke all on function public.create_v186_gold_live_market_bridge(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_v186_gold_live_market_bridge(uuid,text,text,text,text) to service_role;
revoke all on function public.list_v186_gold_live_market_bridges(uuid) from public,anon,authenticated;
grant execute on function public.list_v186_gold_live_market_bridges(uuid) to service_role;
revoke all on function public.revoke_v186_gold_live_market_bridge(uuid,bigint) from public,anon,authenticated;
grant execute on function public.revoke_v186_gold_live_market_bridge(uuid,bigint) to service_role;
revoke all on function public.authenticate_v186_gold_live_market_bridge(bigint,text) from public,anon,authenticated;
grant execute on function public.authenticate_v186_gold_live_market_bridge(bigint,text) to service_role;
revoke all on function private.evaluate_v186_gold_live_tick(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function private.evaluate_v186_gold_live_tick(jsonb,timestamptz) to service_role;
revoke all on function public.ingest_v186_gold_live_tick(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_v186_gold_live_tick(bigint,jsonb) to service_role;
revoke all on function public.get_v186_gold_live_market_status() from public,anon,authenticated;
grant execute on function public.get_v186_gold_live_market_status() to service_role;
revoke all on function private.selftest_v186_gold_live_tick() from public,anon,authenticated;
grant execute on function private.selftest_v186_gold_live_tick() to service_role;
