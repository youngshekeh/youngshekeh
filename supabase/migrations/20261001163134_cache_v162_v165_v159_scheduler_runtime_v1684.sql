set local statement_timeout = '120s';

alter function public.get_v162_prospective_collision_revalidation() set schema private;
alter function private.get_v162_prospective_collision_revalidation() rename to compute_v162_prospective_collision_revalidation;

create or replace function public.get_v162_prospective_collision_revalidation()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_catalog','pg_temp'
as $$
declare
  v_payload jsonb; v_refreshed_at timestamptz; v_started timestamptz; v_compute_ms numeric;
begin
  select payload,refreshed_at into v_payload,v_refreshed_at
  from private.scheduler_intelligence_cache where engine_key='V162';

  if v_payload is not null and v_refreshed_at >= now()-interval '5 minutes' then
    return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','FRESH','refreshed_at',v_refreshed_at,'ttl_minutes',5));
  end if;

  if pg_try_advisory_xact_lock(hashtextextended('TFA:V162:CACHE',0)) then
    begin
      v_started:=clock_timestamp();
      v_payload:=private.compute_v162_prospective_collision_revalidation();
      v_compute_ms:=round((extract(epoch from (clock_timestamp()-v_started))*1000)::numeric,1);
      insert into private.scheduler_intelligence_cache(engine_key,payload,refreshed_at,compute_ms,refresh_count)
      values('V162',v_payload,now(),v_compute_ms,1)
      on conflict(engine_key) do update
      set payload=excluded.payload,refreshed_at=excluded.refreshed_at,compute_ms=excluded.compute_ms,
          refresh_count=private.scheduler_intelligence_cache.refresh_count+1;
      return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','REFRESHED','refreshed_at',now(),'compute_ms',v_compute_ms,'ttl_minutes',5));
    exception when others then
      if v_payload is not null then
        return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','STALE_SURVIVOR','refreshed_at',v_refreshed_at,'refresh_error',sqlstate,'ttl_minutes',5));
      end if;
      return jsonb_build_object('ok',false,'version','v168.4-v162-cache-wrapper-v1','state','UNAVAILABLE',
        'error','prospective_collision_refresh_failed',
        'governance',jsonb_build_object('action_permitted','WAIT','capital_permission','0R','live_order_routing',false,'automatic_rescheduling',false,'automatic_rollback',false),
        '_cache',jsonb_build_object('state','EMPTY_FAIL_CLOSED'));
    end;
  end if;

  if v_payload is not null then
    return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','CONCURRENT_REFRESH_SURVIVOR','refreshed_at',v_refreshed_at,'ttl_minutes',5));
  end if;

  return jsonb_build_object('ok',false,'version','v168.4-v162-cache-wrapper-v1','state','UNAVAILABLE',
    'error','prospective_collision_refresh_in_progress_no_snapshot',
    'governance',jsonb_build_object('action_permitted','WAIT','capital_permission','0R','live_order_routing',false,'automatic_rescheduling',false,'automatic_rollback',false),
    '_cache',jsonb_build_object('state','EMPTY_FAIL_CLOSED'));
end;
$$;

revoke all on function public.get_v162_prospective_collision_revalidation() from public,anon,authenticated;
grant execute on function public.get_v162_prospective_collision_revalidation() to service_role;

insert into private.scheduler_intelligence_cache(engine_key,payload,refreshed_at,compute_ms,refresh_count)
values('V162',private.compute_v162_prospective_collision_revalidation(),now(),null,1)
on conflict(engine_key) do update
set payload=excluded.payload,refreshed_at=excluded.refreshed_at,compute_ms=excluded.compute_ms,
    refresh_count=private.scheduler_intelligence_cache.refresh_count+1;

alter function public.get_v165_safe_alternative_admission_handoff() set schema private;
alter function private.get_v165_safe_alternative_admission_handoff() rename to compute_v165_safe_alternative_admission_handoff;

create or replace function public.get_v165_safe_alternative_admission_handoff()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_catalog','pg_temp'
as $$
declare
  v_payload jsonb; v_refreshed_at timestamptz; v_started timestamptz; v_compute_ms numeric;
begin
  select payload,refreshed_at into v_payload,v_refreshed_at
  from private.scheduler_intelligence_cache where engine_key='V165';

  if v_payload is not null and v_refreshed_at >= now()-interval '5 minutes' then
    return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','FRESH','refreshed_at',v_refreshed_at,'ttl_minutes',5));
  end if;

  if pg_try_advisory_xact_lock(hashtextextended('TFA:V165:CACHE',0)) then
    begin
      v_started:=clock_timestamp();
      v_payload:=private.compute_v165_safe_alternative_admission_handoff();
      v_compute_ms:=round((extract(epoch from (clock_timestamp()-v_started))*1000)::numeric,1);
      insert into private.scheduler_intelligence_cache(engine_key,payload,refreshed_at,compute_ms,refresh_count)
      values('V165',v_payload,now(),v_compute_ms,1)
      on conflict(engine_key) do update
      set payload=excluded.payload,refreshed_at=excluded.refreshed_at,compute_ms=excluded.compute_ms,
          refresh_count=private.scheduler_intelligence_cache.refresh_count+1;
      return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','REFRESHED','refreshed_at',now(),'compute_ms',v_compute_ms,'ttl_minutes',5));
    exception when others then
      if v_payload is not null then
        return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','STALE_SURVIVOR','refreshed_at',v_refreshed_at,'refresh_error',sqlstate,'ttl_minutes',5));
      end if;
      return jsonb_build_object('ok',false,'version','v168.4-v165-cache-wrapper-v1','state','UNAVAILABLE',
        'error','safe_alternative_handoff_refresh_failed',
        'governance',jsonb_build_object('action_permitted','WAIT','capital_permission','0R','live_order_routing',false,'automatic_rescheduling',false,'automatic_rollback',false),
        '_cache',jsonb_build_object('state','EMPTY_FAIL_CLOSED'));
    end;
  end if;

  if v_payload is not null then
    return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','CONCURRENT_REFRESH_SURVIVOR','refreshed_at',v_refreshed_at,'ttl_minutes',5));
  end if;

  return jsonb_build_object('ok',false,'version','v168.4-v165-cache-wrapper-v1','state','UNAVAILABLE',
    'error','safe_alternative_handoff_refresh_in_progress_no_snapshot',
    'governance',jsonb_build_object('action_permitted','WAIT','capital_permission','0R','live_order_routing',false,'automatic_rescheduling',false,'automatic_rollback',false),
    '_cache',jsonb_build_object('state','EMPTY_FAIL_CLOSED'));
end;
$$;

revoke all on function public.get_v165_safe_alternative_admission_handoff() from public,anon,authenticated;
grant execute on function public.get_v165_safe_alternative_admission_handoff() to service_role;

insert into private.scheduler_intelligence_cache(engine_key,payload,refreshed_at,compute_ms,refresh_count)
values('V165',private.compute_v165_safe_alternative_admission_handoff(),now(),null,1)
on conflict(engine_key) do update
set payload=excluded.payload,refreshed_at=excluded.refreshed_at,compute_ms=excluded.compute_ms,
    refresh_count=private.scheduler_intelligence_cache.refresh_count+1;

alter function public.get_v159_latest_experiment_admission() set schema private;
alter function private.get_v159_latest_experiment_admission() rename to compute_v159_latest_experiment_admission;

create or replace function public.get_v159_latest_experiment_admission()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_catalog','pg_temp'
as $$
declare
  v_payload jsonb; v_refreshed_at timestamptz; v_started timestamptz; v_compute_ms numeric;
begin
  select payload,refreshed_at into v_payload,v_refreshed_at
  from private.scheduler_intelligence_cache where engine_key='V159';

  if v_payload is not null and v_refreshed_at >= now()-interval '3 minutes' then
    return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','FRESH','refreshed_at',v_refreshed_at,'ttl_minutes',3));
  end if;

  if pg_try_advisory_xact_lock(hashtextextended('TFA:V159:CACHE',0)) then
    begin
      v_started:=clock_timestamp();
      v_payload:=private.compute_v159_latest_experiment_admission();
      v_compute_ms:=round((extract(epoch from (clock_timestamp()-v_started))*1000)::numeric,1);
      insert into private.scheduler_intelligence_cache(engine_key,payload,refreshed_at,compute_ms,refresh_count)
      values('V159',v_payload,now(),v_compute_ms,1)
      on conflict(engine_key) do update
      set payload=excluded.payload,refreshed_at=excluded.refreshed_at,compute_ms=excluded.compute_ms,
          refresh_count=private.scheduler_intelligence_cache.refresh_count+1;
      return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','REFRESHED','refreshed_at',now(),'compute_ms',v_compute_ms,'ttl_minutes',3));
    exception when others then
      if v_payload is not null then
        return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','STALE_SURVIVOR','refreshed_at',v_refreshed_at,'refresh_error',sqlstate,'ttl_minutes',3));
      end if;
      return jsonb_build_object('ok',false,'version','v168.4-v159-cache-wrapper-v1','state','UNAVAILABLE',
        'error','latest_experiment_admission_refresh_failed',
        'governance',jsonb_build_object('action_permitted','WAIT','capital_permission','0R','live_order_routing',false,'automatic_rescheduling',false,'automatic_rollback',false),
        '_cache',jsonb_build_object('state','EMPTY_FAIL_CLOSED'));
    end;
  end if;

  if v_payload is not null then
    return v_payload || jsonb_build_object('_cache',jsonb_build_object('state','CONCURRENT_REFRESH_SURVIVOR','refreshed_at',v_refreshed_at,'ttl_minutes',3));
  end if;

  return jsonb_build_object('ok',false,'version','v168.4-v159-cache-wrapper-v1','state','UNAVAILABLE',
    'error','latest_experiment_admission_refresh_in_progress_no_snapshot',
    'governance',jsonb_build_object('action_permitted','WAIT','capital_permission','0R','live_order_routing',false,'automatic_rescheduling',false,'automatic_rollback',false),
    '_cache',jsonb_build_object('state','EMPTY_FAIL_CLOSED'));
end;
$$;

revoke all on function public.get_v159_latest_experiment_admission() from public,anon,authenticated;
grant execute on function public.get_v159_latest_experiment_admission() to service_role;

insert into private.scheduler_intelligence_cache(engine_key,payload,refreshed_at,compute_ms,refresh_count)
values('V159',private.compute_v159_latest_experiment_admission(),now(),null,1)
on conflict(engine_key) do update
set payload=excluded.payload,refreshed_at=excluded.refreshed_at,compute_ms=excluded.compute_ms,
    refresh_count=private.scheduler_intelligence_cache.refresh_count+1;
