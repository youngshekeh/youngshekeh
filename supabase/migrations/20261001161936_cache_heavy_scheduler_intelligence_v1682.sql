create table if not exists private.scheduler_intelligence_cache (
  engine_key text primary key,
  payload jsonb not null,
  refreshed_at timestamptz not null default now(),
  compute_ms numeric,
  refresh_count bigint not null default 1
);

revoke all on private.scheduler_intelligence_cache from public, anon, authenticated;

alter function public.get_v1461_peak_spreader_status() set schema private;
alter function private.get_v1461_peak_spreader_status() rename to compute_v1461_peak_spreader_status;

create or replace function public.get_v1461_peak_spreader_status()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_catalog','pg_temp'
as $$
declare
  v_payload jsonb;
  v_refreshed_at timestamptz;
  v_started timestamptz;
  v_compute_ms numeric;
begin
  select payload,refreshed_at into v_payload,v_refreshed_at
  from private.scheduler_intelligence_cache where engine_key='V1461';

  if v_payload is not null and v_refreshed_at >= now()-interval '10 minutes' then
    return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','FRESH','refreshed_at',v_refreshed_at,'ttl_minutes',10));
  end if;

  if pg_try_advisory_xact_lock(hashtextextended('TFA:V1461:CACHE',0)) then
    begin
      v_started:=clock_timestamp();
      v_payload:=private.compute_v1461_peak_spreader_status();
      v_compute_ms:=round((extract(epoch from (clock_timestamp()-v_started))*1000)::numeric,1);

      insert into private.scheduler_intelligence_cache(engine_key,payload,refreshed_at,compute_ms,refresh_count)
      values('V1461',v_payload,now(),v_compute_ms,1)
      on conflict(engine_key) do update
      set payload=excluded.payload,refreshed_at=excluded.refreshed_at,
          compute_ms=excluded.compute_ms,
          refresh_count=private.scheduler_intelligence_cache.refresh_count+1;

      return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','REFRESHED','refreshed_at',now(),'compute_ms',v_compute_ms,'ttl_minutes',10));
    exception when others then
      if v_payload is not null then
        return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','STALE_SURVIVOR','refreshed_at',v_refreshed_at,'refresh_error',sqlstate,'ttl_minutes',10));
      end if;
      return jsonb_build_object(
        'ok',false,'version','v168.2-v1461-cache-wrapper-v1','state','UNAVAILABLE',
        'error','scheduler_intelligence_refresh_failed',
        'governance',jsonb_build_object('action_permitted','WAIT','capital_permission','0R','live_order_routing',false,'automatic_rescheduling',false,'automatic_policy_promotion',false),
        '_cache',jsonb_build_object('state','EMPTY_FAIL_CLOSED')
      );
    end;
  end if;

  if v_payload is not null then
    return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','CONCURRENT_REFRESH_SURVIVOR','refreshed_at',v_refreshed_at,'ttl_minutes',10));
  end if;

  return jsonb_build_object(
    'ok',false,'version','v168.2-v1461-cache-wrapper-v1','state','UNAVAILABLE',
    'error','scheduler_intelligence_refresh_in_progress_no_snapshot',
    'governance',jsonb_build_object('action_permitted','WAIT','capital_permission','0R','live_order_routing',false,'automatic_rescheduling',false,'automatic_policy_promotion',false),
    '_cache',jsonb_build_object('state','EMPTY_FAIL_CLOSED')
  );
end;
$$;

revoke all on function public.get_v1461_peak_spreader_status() from public,anon,authenticated;
grant execute on function public.get_v1461_peak_spreader_status() to service_role;

alter function public.get_v148_predictive_collision_shadow() set schema private;
alter function private.get_v148_predictive_collision_shadow() rename to compute_v148_predictive_collision_shadow;

create or replace function public.get_v148_predictive_collision_shadow()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_catalog','pg_temp'
as $$
declare
  v_payload jsonb;
  v_refreshed_at timestamptz;
  v_started timestamptz;
  v_compute_ms numeric;
begin
  select payload,refreshed_at into v_payload,v_refreshed_at
  from private.scheduler_intelligence_cache where engine_key='V148';

  if v_payload is not null and v_refreshed_at >= now()-interval '10 minutes' then
    return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','FRESH','refreshed_at',v_refreshed_at,'ttl_minutes',10));
  end if;

  if pg_try_advisory_xact_lock(hashtextextended('TFA:V148:CACHE',0)) then
    begin
      v_started:=clock_timestamp();
      v_payload:=private.compute_v148_predictive_collision_shadow();
      v_compute_ms:=round((extract(epoch from (clock_timestamp()-v_started))*1000)::numeric,1);

      insert into private.scheduler_intelligence_cache(engine_key,payload,refreshed_at,compute_ms,refresh_count)
      values('V148',v_payload,now(),v_compute_ms,1)
      on conflict(engine_key) do update
      set payload=excluded.payload,refreshed_at=excluded.refreshed_at,
          compute_ms=excluded.compute_ms,
          refresh_count=private.scheduler_intelligence_cache.refresh_count+1;

      return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','REFRESHED','refreshed_at',now(),'compute_ms',v_compute_ms,'ttl_minutes',10));
    exception when others then
      if v_payload is not null then
        return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','STALE_SURVIVOR','refreshed_at',v_refreshed_at,'refresh_error',sqlstate,'ttl_minutes',10));
      end if;
      return jsonb_build_object(
        'ok',false,'version','v168.2-v148-cache-wrapper-v1','state','UNAVAILABLE',
        'error','predictive_collision_refresh_failed',
        'governance',jsonb_build_object('action_permitted','WAIT','capital_permission','0R','live_order_routing',false,'automatic_rescheduling',false,'automatic_policy_promotion',false),
        '_cache',jsonb_build_object('state','EMPTY_FAIL_CLOSED')
      );
    end;
  end if;

  if v_payload is not null then
    return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','CONCURRENT_REFRESH_SURVIVOR','refreshed_at',v_refreshed_at,'ttl_minutes',10));
  end if;

  return jsonb_build_object(
    'ok',false,'version','v168.2-v148-cache-wrapper-v1','state','UNAVAILABLE',
    'error','predictive_collision_refresh_in_progress_no_snapshot',
    'governance',jsonb_build_object('action_permitted','WAIT','capital_permission','0R','live_order_routing',false,'automatic_rescheduling',false,'automatic_policy_promotion',false),
    '_cache',jsonb_build_object('state','EMPTY_FAIL_CLOSED')
  );
end;
$$;

revoke all on function public.get_v148_predictive_collision_shadow() from public,anon,authenticated;
grant execute on function public.get_v148_predictive_collision_shadow() to service_role;
