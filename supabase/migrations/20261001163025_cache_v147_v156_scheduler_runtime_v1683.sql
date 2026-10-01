set local statement_timeout = '120s';

alter function public.get_v147_connection_pressure_shadow() set schema private;
alter function private.get_v147_connection_pressure_shadow() rename to compute_v147_connection_pressure_shadow;

create or replace function public.get_v147_connection_pressure_shadow()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_catalog','pg_temp'
as $$
declare
  v_payload jsonb; v_refreshed_at timestamptz; v_started timestamptz; v_compute_ms numeric;
begin
  select payload,refreshed_at into v_payload,v_refreshed_at
  from private.scheduler_intelligence_cache where engine_key='V147';

  if v_payload is not null and v_refreshed_at >= now()-interval '2 minutes' then
    return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','FRESH','refreshed_at',v_refreshed_at,'ttl_minutes',2));
  end if;

  if pg_try_advisory_xact_lock(hashtextextended('TFA:V147:CACHE',0)) then
    begin
      v_started:=clock_timestamp();
      v_payload:=private.compute_v147_connection_pressure_shadow();
      v_compute_ms:=round((extract(epoch from (clock_timestamp()-v_started))*1000)::numeric,1);
      insert into private.scheduler_intelligence_cache(engine_key,payload,refreshed_at,compute_ms,refresh_count)
      values('V147',v_payload,now(),v_compute_ms,1)
      on conflict(engine_key) do update
      set payload=excluded.payload,refreshed_at=excluded.refreshed_at,compute_ms=excluded.compute_ms,
          refresh_count=private.scheduler_intelligence_cache.refresh_count+1;
      return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','REFRESHED','refreshed_at',now(),'compute_ms',v_compute_ms,'ttl_minutes',2));
    exception when others then
      if v_payload is not null then
        return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','STALE_SURVIVOR','refreshed_at',v_refreshed_at,'refresh_error',sqlstate,'ttl_minutes',2));
      end if;
      return jsonb_build_object('ok',false,'version','v168.3-v147-cache-wrapper-v1','state','UNAVAILABLE','error','connection_pressure_refresh_failed',
        'governance',jsonb_build_object('action_permitted','WAIT','capital_permission','0R','live_order_routing',false,'automatic_rescheduling',false),
        '_cache',jsonb_build_object('state','EMPTY_FAIL_CLOSED'));
    end;
  end if;

  if v_payload is not null then
    return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','CONCURRENT_REFRESH_SURVIVOR','refreshed_at',v_refreshed_at,'ttl_minutes',2));
  end if;

  return jsonb_build_object('ok',false,'version','v168.3-v147-cache-wrapper-v1','state','UNAVAILABLE',
    'error','connection_pressure_refresh_in_progress_no_snapshot',
    'governance',jsonb_build_object('action_permitted','WAIT','capital_permission','0R','live_order_routing',false,'automatic_rescheduling',false),
    '_cache',jsonb_build_object('state','EMPTY_FAIL_CLOSED'));
end;
$$;

revoke all on function public.get_v147_connection_pressure_shadow() from public,anon,authenticated;
grant execute on function public.get_v147_connection_pressure_shadow() to service_role;

insert into private.scheduler_intelligence_cache(engine_key,payload,refreshed_at,compute_ms,refresh_count)
values('V147',private.compute_v147_connection_pressure_shadow(),now(),null,1)
on conflict(engine_key) do update
set payload=excluded.payload,refreshed_at=excluded.refreshed_at,compute_ms=excluded.compute_ms,
    refresh_count=private.scheduler_intelligence_cache.refresh_count+1;

alter function public.get_v156_quota_guard_recovery_shadow() set schema private;
alter function private.get_v156_quota_guard_recovery_shadow() rename to compute_v156_quota_guard_recovery_shadow;

create or replace function public.get_v156_quota_guard_recovery_shadow()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_catalog','pg_temp'
as $$
declare
  v_payload jsonb; v_refreshed_at timestamptz; v_started timestamptz; v_compute_ms numeric;
begin
  select payload,refreshed_at into v_payload,v_refreshed_at
  from private.scheduler_intelligence_cache where engine_key='V156';

  if v_payload is not null and v_refreshed_at >= now()-interval '2 minutes' then
    return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','FRESH','refreshed_at',v_refreshed_at,'ttl_minutes',2));
  end if;

  if pg_try_advisory_xact_lock(hashtextextended('TFA:V156:CACHE',0)) then
    begin
      v_started:=clock_timestamp();
      v_payload:=private.compute_v156_quota_guard_recovery_shadow();
      v_compute_ms:=round((extract(epoch from (clock_timestamp()-v_started))*1000)::numeric,1);
      insert into private.scheduler_intelligence_cache(engine_key,payload,refreshed_at,compute_ms,refresh_count)
      values('V156',v_payload,now(),v_compute_ms,1)
      on conflict(engine_key) do update
      set payload=excluded.payload,refreshed_at=excluded.refreshed_at,compute_ms=excluded.compute_ms,
          refresh_count=private.scheduler_intelligence_cache.refresh_count+1;
      return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','REFRESHED','refreshed_at',now(),'compute_ms',v_compute_ms,'ttl_minutes',2));
    exception when others then
      if v_payload is not null then
        return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','STALE_SURVIVOR','refreshed_at',v_refreshed_at,'refresh_error',sqlstate,'ttl_minutes',2));
      end if;
      return jsonb_build_object('ok',false,'version','v168.3-v156-cache-wrapper-v1','state','UNAVAILABLE','error','quota_guard_refresh_failed',
        'governance',jsonb_build_object('action_permitted','WAIT','capital_permission','0R','live_order_routing',false,'automatic_rescheduling',false,'automatic_rollback',false),
        '_cache',jsonb_build_object('state','EMPTY_FAIL_CLOSED'));
    end;
  end if;

  if v_payload is not null then
    return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','CONCURRENT_REFRESH_SURVIVOR','refreshed_at',v_refreshed_at,'ttl_minutes',2));
  end if;

  return jsonb_build_object('ok',false,'version','v168.3-v156-cache-wrapper-v1','state','UNAVAILABLE',
    'error','quota_guard_refresh_in_progress_no_snapshot',
    'governance',jsonb_build_object('action_permitted','WAIT','capital_permission','0R','live_order_routing',false,'automatic_rescheduling',false,'automatic_rollback',false),
    '_cache',jsonb_build_object('state','EMPTY_FAIL_CLOSED'));
end;
$$;

revoke all on function public.get_v156_quota_guard_recovery_shadow() from public,anon,authenticated;
grant execute on function public.get_v156_quota_guard_recovery_shadow() to service_role;

insert into private.scheduler_intelligence_cache(engine_key,payload,refreshed_at,compute_ms,refresh_count)
values('V156',private.compute_v156_quota_guard_recovery_shadow(),now(),null,1)
on conflict(engine_key) do update
set payload=excluded.payload,refreshed_at=excluded.refreshed_at,compute_ms=excluded.compute_ms,
    refresh_count=private.scheduler_intelligence_cache.refresh_count+1;
