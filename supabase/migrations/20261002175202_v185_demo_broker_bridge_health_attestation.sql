
-- V185 Demo Broker Bridge Preflight + Health Attestation
-- Health telemetry is operational evidence only. It cannot unlock production capital.

create table if not exists public.gold_broker_sandbox_bridge_heartbeats (
  id bigint generated always as identity primary key,
  bridge_id bigint not null references public.gold_broker_sandbox_bridges(id) on delete restrict,
  received_at timestamptz not null default now(),
  observed_at timestamptz not null,
  heartbeat_sequence bigint not null check (heartbeat_sequence > 0 and heartbeat_sequence <= 9007199254740991),
  relay_version text not null check (relay_version ~ '^v[0-9]+\.[0-9]+$'),
  mt5_package_version text not null check (mt5_package_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  python_version text not null check (python_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  os_family text not null check (char_length(os_family) between 1 and 32),
  terminal_build integer not null check (terminal_build > 0),
  terminal_connected boolean not null,
  trade_mode text not null check (trade_mode='DEMO'),
  symbol_resolved boolean not null,
  history_access boolean not null,
  process_uptime_seconds bigint not null check (process_uptime_seconds >= 0),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  unique(bridge_id,heartbeat_sequence)
);

alter table public.gold_broker_sandbox_bridge_heartbeats enable row level security;
revoke all on table public.gold_broker_sandbox_bridge_heartbeats from public,anon,authenticated;
grant select,insert on table public.gold_broker_sandbox_bridge_heartbeats to service_role;
grant usage,select on sequence public.gold_broker_sandbox_bridge_heartbeats_id_seq to service_role;

create index if not exists gold_broker_sandbox_bridge_heartbeats_recent_idx
  on public.gold_broker_sandbox_bridge_heartbeats(bridge_id,observed_at desc,id desc);

drop trigger if exists prevent_v185_sandbox_bridge_heartbeat_mutation
  on public.gold_broker_sandbox_bridge_heartbeats;
create trigger prevent_v185_sandbox_bridge_heartbeat_mutation
before update or delete on public.gold_broker_sandbox_bridge_heartbeats
for each row execute function public.prevent_v125_gold_learning_mutation();

create or replace function private.evaluate_v185_gold_sandbox_bridge_heartbeat(
  p_heartbeat jsonb,p_as_of timestamptz
) returns jsonb
language plpgsql
stable
security invoker
set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  v_errors text[]:='{}'::text[];
  v_observed timestamptz;
  v_age numeric;
begin
  if jsonb_typeof(p_heartbeat) is distinct from 'object'
     or p_as_of is null or not isfinite(p_as_of) then
    v_errors:=array_append(v_errors,'INVALID_ENVELOPE');
  else
    if exists(
      select 1 from jsonb_object_keys(p_heartbeat) k(key)
      where not (key=any(array[
        'observed_at','heartbeat_sequence','relay_version','mt5_package_version',
        'python_version','os_family','terminal_build','terminal_connected',
        'trade_mode','symbol_resolved','history_access','process_uptime_seconds'
      ]::text[]))
    ) then v_errors:=array_append(v_errors,'UNEXPECTED_FIELDS'); end if;

    begin
      if jsonb_typeof(p_heartbeat->'observed_at') is distinct from 'string'
         or coalesce(p_heartbeat->>'observed_at','') !~
            '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+-][0-9]{2}:[0-9]{2})$' then
        v_errors:=array_append(v_errors,'INVALID_TIMESTAMP');
      else
        v_observed:=(p_heartbeat->>'observed_at')::timestamptz;
        if v_observed is null or not isfinite(v_observed) then
          v_errors:=array_append(v_errors,'INVALID_TIMESTAMP');
        else
          v_age:=extract(epoch from p_as_of-v_observed);
          if v_age < -5 then v_errors:=array_append(v_errors,'FUTURE_HEARTBEAT');
          elsif v_age >= 60 then v_errors:=array_append(v_errors,'STALE_HEARTBEAT'); end if;
        end if;
      end if;
    exception when invalid_datetime_format or datetime_field_overflow then
      v_errors:=array_append(v_errors,'INVALID_TIMESTAMP');
    end;

    if jsonb_typeof(p_heartbeat->'heartbeat_sequence') is distinct from 'number'
       or coalesce(p_heartbeat->>'heartbeat_sequence','') !~ '^[1-9][0-9]{0,15}$'
       or (p_heartbeat->>'heartbeat_sequence')::numeric>9007199254740991 then
      v_errors:=array_append(v_errors,'INVALID_HEARTBEAT_SEQUENCE');
    end if;

    if jsonb_typeof(p_heartbeat->'relay_version') is distinct from 'string'
       or coalesce(p_heartbeat->>'relay_version','') !~ '^v[0-9]+\.[0-9]+$'
       or jsonb_typeof(p_heartbeat->'mt5_package_version') is distinct from 'string'
       or coalesce(p_heartbeat->>'mt5_package_version','') !~ '^[0-9]+\.[0-9]+\.[0-9]+$'
       or jsonb_typeof(p_heartbeat->'python_version') is distinct from 'string'
       or coalesce(p_heartbeat->>'python_version','') !~ '^[0-9]+\.[0-9]+\.[0-9]+$' then
      v_errors:=array_append(v_errors,'INVALID_VERSION_ATTESTATION');
    end if;

    if jsonb_typeof(p_heartbeat->'os_family') is distinct from 'string'
       or char_length(coalesce(p_heartbeat->>'os_family','')) not between 1 and 32
       or jsonb_typeof(p_heartbeat->'terminal_build') is distinct from 'number'
       or coalesce(p_heartbeat->>'terminal_build','') !~ '^[1-9][0-9]{0,8}$' then
      v_errors:=array_append(v_errors,'INVALID_TERMINAL_ATTESTATION');
    end if;

    if jsonb_typeof(p_heartbeat->'terminal_connected') is distinct from 'boolean'
       or p_heartbeat->>'trade_mode' is distinct from 'DEMO'
       or jsonb_typeof(p_heartbeat->'symbol_resolved') is distinct from 'boolean'
       or jsonb_typeof(p_heartbeat->'history_access') is distinct from 'boolean' then
      v_errors:=array_append(v_errors,'INVALID_DEMO_HEALTH_ATTESTATION');
    end if;

    if jsonb_typeof(p_heartbeat->'process_uptime_seconds') is distinct from 'number'
       or coalesce(p_heartbeat->>'process_uptime_seconds','') !~ '^[0-9]{1,12}$' then
      v_errors:=array_append(v_errors,'INVALID_PROCESS_UPTIME');
    end if;
  end if;

  return jsonb_build_object(
    'ok',cardinality(v_errors)=0,
    'violations',to_jsonb(v_errors),
    'heartbeat_age_seconds',v_age,
    'expected_relay_version','v185.0',
    'expected_mt5_package_version','5.0.6231',
    'production_capable',false,
    'production_broker_verified',false,
    'live_order_submission_enabled',false,
    'capital_permission','0R'
  );
end;
$function$;

revoke all on function private.evaluate_v185_gold_sandbox_bridge_heartbeat(jsonb,timestamptz)
  from public,anon,authenticated;
grant execute on function private.evaluate_v185_gold_sandbox_bridge_heartbeat(jsonb,timestamptz)
  to service_role;

create or replace function public.ingest_v185_gold_sandbox_bridge_heartbeat(
  p_bridge_id bigint,p_heartbeat jsonb
) returns jsonb
language plpgsql
security invoker
set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  v_check jsonb;
  v_bridge public.gold_broker_sandbox_bridges%rowtype;
  v_existing public.gold_broker_sandbox_bridge_heartbeats%rowtype;
  v_last public.gold_broker_sandbox_bridge_heartbeats%rowtype;
  v_payload jsonb;
  v_sha text;
  v_id bigint;
begin
  select * into v_bridge
  from public.gold_broker_sandbox_bridges
  where id=p_bridge_id and revoked_at is null;
  if not found then
    return jsonb_build_object('ok',false,'error','bridge_not_active','capital_permission','0R');
  end if;

  v_check:=private.evaluate_v185_gold_sandbox_bridge_heartbeat(p_heartbeat,now());
  if v_check->'ok' is distinct from 'true'::jsonb then
    return v_check||jsonb_build_object('error','heartbeat_rejected');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('v185|'||p_bridge_id::text,185));

  v_payload:=jsonb_build_object(
    'bridge_id',p_bridge_id,
    'observed_at',(p_heartbeat->>'observed_at')::timestamptz,
    'heartbeat_sequence',(p_heartbeat->>'heartbeat_sequence')::bigint,
    'relay_version',p_heartbeat->>'relay_version',
    'mt5_package_version',p_heartbeat->>'mt5_package_version',
    'python_version',p_heartbeat->>'python_version',
    'os_family',p_heartbeat->>'os_family',
    'terminal_build',(p_heartbeat->>'terminal_build')::integer,
    'terminal_connected',(p_heartbeat->>'terminal_connected')::boolean,
    'trade_mode','DEMO',
    'symbol_resolved',(p_heartbeat->>'symbol_resolved')::boolean,
    'history_access',(p_heartbeat->>'history_access')::boolean,
    'process_uptime_seconds',(p_heartbeat->>'process_uptime_seconds')::bigint
  );
  v_sha:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');

  select * into v_existing
  from public.gold_broker_sandbox_bridge_heartbeats
  where bridge_id=p_bridge_id
    and heartbeat_sequence=(p_heartbeat->>'heartbeat_sequence')::bigint;

  if found then
    if v_existing.payload_sha256<>v_sha then
      return v_check||jsonb_build_object('ok',false,'error','conflicting_heartbeat_replay');
    end if;
    return v_check||jsonb_build_object(
      'state','DUPLICATE_HEARTBEAT_ALREADY_RECORDED',
      'heartbeat_id',v_existing.id,'inserted',false
    );
  end if;

  select * into v_last
  from public.gold_broker_sandbox_bridge_heartbeats
  where bridge_id=p_bridge_id
  order by heartbeat_sequence desc
  limit 1;

  if found and (
    (p_heartbeat->>'heartbeat_sequence')::bigint<=v_last.heartbeat_sequence
    or (p_heartbeat->>'observed_at')::timestamptz<v_last.observed_at
  ) then
    return v_check||jsonb_build_object('ok',false,'error','out_of_order_heartbeat');
  end if;

  insert into public.gold_broker_sandbox_bridge_heartbeats(
    bridge_id,observed_at,heartbeat_sequence,relay_version,mt5_package_version,
    python_version,os_family,terminal_build,terminal_connected,trade_mode,
    symbol_resolved,history_access,process_uptime_seconds,payload_sha256
  ) values (
    p_bridge_id,(p_heartbeat->>'observed_at')::timestamptz,
    (p_heartbeat->>'heartbeat_sequence')::bigint,p_heartbeat->>'relay_version',
    p_heartbeat->>'mt5_package_version',p_heartbeat->>'python_version',
    p_heartbeat->>'os_family',(p_heartbeat->>'terminal_build')::integer,
    (p_heartbeat->>'terminal_connected')::boolean,'DEMO',
    (p_heartbeat->>'symbol_resolved')::boolean,
    (p_heartbeat->>'history_access')::boolean,
    (p_heartbeat->>'process_uptime_seconds')::bigint,v_sha
  ) returning id into v_id;

  return v_check||jsonb_build_object(
    'state','DEMO_BRIDGE_HEARTBEAT_RECORDED',
    'heartbeat_id',v_id,'inserted',true,
    'bridge_id',p_bridge_id,
    'source_code',v_bridge.source_code,
    'provider_symbol',v_bridge.provider_symbol
  );
end;
$function$;

revoke all on function public.ingest_v185_gold_sandbox_bridge_heartbeat(bigint,jsonb)
  from public,anon,authenticated;
grant execute on function public.ingest_v185_gold_sandbox_bridge_heartbeat(bigint,jsonb)
  to service_role;

create or replace function public.get_v185_gold_sandbox_bridge_health_status()
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  v_active integer:=0;
  v_with_heartbeat integer:=0;
  v_healthy integer:=0;
  v_stale integer:=0;
  v_degraded integer:=0;
  v_last timestamptz;
  v_state text:='NO_ACTIVE_SANDBOX_BRIDGE';
  v_clients jsonb:='[]'::jsonb;
begin
  with latest as (
    select b.id,b.bridge_label,b.source_code,b.provider_symbol,b.created_at,
           h.observed_at,h.received_at,h.relay_version,h.mt5_package_version,
           h.python_version,h.os_family,h.terminal_build,h.terminal_connected,
           h.trade_mode,h.symbol_resolved,h.history_access,h.process_uptime_seconds,
           case when h.id is null then null else extract(epoch from now()-h.observed_at) end as age_seconds
    from public.gold_broker_sandbox_bridges b
    left join lateral (
      select *
      from public.gold_broker_sandbox_bridge_heartbeats h
      where h.bridge_id=b.id
      order by h.observed_at desc,h.id desc
      limit 1
    ) h on true
    where b.revoked_at is null
  ), scored as (
    select *,
      observed_at is not null as has_heartbeat,
      observed_at is not null and age_seconds<90 as fresh,
      observed_at is not null and age_seconds>=90 as stale,
      observed_at is not null and age_seconds<90
        and terminal_connected=true
        and trade_mode='DEMO'
        and symbol_resolved=true
        and history_access=true
        and relay_version='v185.0'
        and mt5_package_version='5.0.6231'
        and os_family='Windows' as healthy
    from latest
  )
  select
    count(*)::int,
    count(*) filter(where has_heartbeat)::int,
    count(*) filter(where healthy)::int,
    count(*) filter(where stale)::int,
    count(*) filter(where has_heartbeat and fresh and not healthy)::int,
    max(observed_at),
    coalesce(jsonb_agg(jsonb_build_object(
      'bridge_id',id,'bridge_label',bridge_label,'source_code',source_code,
      'provider_symbol',provider_symbol,'heartbeat_observed_at',observed_at,
      'heartbeat_age_seconds',case when age_seconds is null then null else round(age_seconds::numeric,1) end,
      'healthy',healthy,'fresh',fresh,'terminal_connected',terminal_connected,
      'trade_mode',trade_mode,'symbol_resolved',symbol_resolved,'history_access',history_access,
      'relay_version',relay_version,'mt5_package_version',mt5_package_version,
      'python_version',python_version,'os_family',os_family,'terminal_build',terminal_build,
      'process_uptime_seconds',process_uptime_seconds
    ) order by created_at desc),'[]'::jsonb)
  into v_active,v_with_heartbeat,v_healthy,v_stale,v_degraded,v_last,v_clients
  from scored;

  v_state:=case
    when v_active=0 then 'NO_ACTIVE_SANDBOX_BRIDGE'
    when v_with_heartbeat=0 then 'ACTIVE_SANDBOX_BRIDGE_WAITING_FOR_HEARTBEAT'
    when v_stale>0 then 'SANDBOX_BRIDGE_HEARTBEAT_STALE'
    when v_degraded>0 then 'SANDBOX_BRIDGE_HEALTH_DEGRADED'
    when v_healthy=v_active then 'SANDBOX_BRIDGE_HEALTHY'
    else 'SANDBOX_BRIDGE_HEALTH_INCOMPLETE'
  end;

  return jsonb_build_object(
    'ok',true,'version','v185-demo-bridge-health-v1',
    'state',v_state,'checked_at',now(),
    'expected',jsonb_build_object(
      'relay_version','v185.0','mt5_package_version','5.0.6231',
      'os_family','Windows','heartbeat_freshness_seconds',90,'trade_mode','DEMO'
    ),
    'counts',jsonb_build_object(
      'active_bridges',v_active,'bridges_with_heartbeat',v_with_heartbeat,
      'healthy_bridges',v_healthy,'stale_bridges',v_stale,'degraded_bridges',v_degraded
    ),
    'last_heartbeat_at',v_last,
    'clients',v_clients,
    'production_boundary',jsonb_build_object(
      'health_is_trading_evidence',false,
      'production_capable',false,'production_broker_verified',false,
      'live_order_submission_enabled',false,'real_order_sent',false
    ),
    'governance',jsonb_build_object(
      'action_permitted','WAIT','capital_permission','0R',
      'automatic_real_capital',false,'health_can_unlock_capital',false
    ),
    'truth_label','DEMO_CLIENT_HEALTH_ATTESTATION_NOT_TRADING_PERMISSION'
  );
end;
$function$;

revoke all on function public.get_v185_gold_sandbox_bridge_health_status()
  from public,anon,authenticated;
grant execute on function public.get_v185_gold_sandbox_bridge_health_status()
  to service_role;

create or replace function private.selftest_v185_gold_sandbox_bridge_heartbeat()
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  v_now timestamptz:=now();
  v_passed integer:=0;
  v_total constant integer:=4;
  v_case jsonb;
begin
  v_case:=private.evaluate_v185_gold_sandbox_bridge_heartbeat(jsonb_build_object(
    'observed_at',v_now,'heartbeat_sequence',1,'relay_version','v185.0',
    'mt5_package_version','5.0.6231','python_version','3.12.14',
    'os_family','Windows','terminal_build',5000,'terminal_connected',true,
    'trade_mode','DEMO','symbol_resolved',true,'history_access',true,
    'process_uptime_seconds',10
  ),v_now);
  if v_case->'ok'='true'::jsonb then v_passed:=v_passed+1; end if;

  v_case:=private.evaluate_v185_gold_sandbox_bridge_heartbeat(jsonb_build_object(
    'observed_at',v_now,'heartbeat_sequence',2,'relay_version','v185.0',
    'mt5_package_version','5.0.6231','python_version','3.12.14',
    'os_family','Windows','terminal_build',5000,'terminal_connected',false,
    'trade_mode','DEMO','symbol_resolved',false,'history_access',false,
    'process_uptime_seconds',11
  ),v_now);
  if v_case->'ok'='true'::jsonb then v_passed:=v_passed+1; end if;

  v_case:=private.evaluate_v185_gold_sandbox_bridge_heartbeat(jsonb_build_object(
    'observed_at',v_now,'heartbeat_sequence',3,'relay_version','v185.0',
    'mt5_package_version','5.0.6231','python_version','3.12.14',
    'os_family','Windows','terminal_build',5000,'terminal_connected',true,
    'trade_mode','REAL','symbol_resolved',true,'history_access',true,
    'process_uptime_seconds',12
  ),v_now);
  if v_case->'ok'='false'::jsonb then v_passed:=v_passed+1; end if;

  v_case:=private.evaluate_v185_gold_sandbox_bridge_heartbeat(jsonb_build_object(
    'observed_at',v_now,'heartbeat_sequence',4,'relay_version','v185.0',
    'mt5_package_version','5.0.6231','python_version','3.12.14',
    'os_family','Windows','terminal_build',5000,'terminal_connected',true,
    'trade_mode','DEMO','symbol_resolved',true,'history_access',true,
    'process_uptime_seconds',13,'password','forbidden'
  ),v_now);
  if v_case->'ok'='false'::jsonb then v_passed:=v_passed+1; end if;

  return jsonb_build_object(
    'ok',v_passed=v_total,'version','v185-heartbeat-selftest-v1',
    'passed',v_passed,'total',v_total,
    'capital_permission','0R','live_order_submission_enabled',false
  );
end;
$function$;

revoke all on function private.selftest_v185_gold_sandbox_bridge_heartbeat()
  from public,anon,authenticated;
grant execute on function private.selftest_v185_gold_sandbox_bridge_heartbeat()
  to service_role;
