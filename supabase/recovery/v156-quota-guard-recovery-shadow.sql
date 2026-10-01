-- V156 Quota Guard Recovery Integrity Shadow
-- Verifies the V70 quota signal -> V72 load-shed -> V72 restoration handoff.
-- Read-only. It never pauses/restores cron jobs and never changes trading permission.

create or replace function public.get_v156_quota_guard_recovery_shadow()
returns jsonb
language plpgsql
security definer
set search_path to 'public','cron','pg_catalog','pg_temp'
as $function$
declare
  v_now timestamptz := now();

  v_quota_state text;
  v_quota_updated_at timestamptz;
  v_quota_cleared_at timestamptz;
  v_quota_details jsonb := '{}'::jsonb;
  v_quota_restricted boolean := false;
  v_quota_age_minutes numeric;
  v_quota_signal_fresh boolean := false;

  v_shed_state text;
  v_shed_updated_at timestamptz;
  v_shed_cleared_at timestamptz;
  v_shed_details jsonb := '{}'::jsonb;

  v_guard_rows integer := 0;
  v_expected_guard_targets integer := 0;
  v_paused_rows integer := 0;
  v_paused_should_restore integer := 0;
  v_restored_rows integer := 0;
  v_mismatch_rows integer := 0;
  v_missing_job_rows integer := 0;
  v_guard_rows_json jsonb := '[]'::jsonb;

  v_enforcer_jobid bigint;
  v_enforcer_active boolean := false;
  v_enforcer_schedule text;
  v_enforcer_last_start timestamptz;
  v_enforcer_last_end timestamptz;
  v_enforcer_last_status text;
  v_enforcer_last_return text;
  v_enforcer_age_minutes numeric;
  v_enforcer_fresh boolean := false;
  v_enforcer_healthy boolean := false;

  v_recovery_age_minutes numeric;
  v_recovery_grace_minutes integer := 8;
  v_signal_freshness_minutes integer := 15;
  v_enforcer_freshness_minutes integer := 8;

  v_state text := 'QUOTA_RECOVERY_SIGNAL_UNAVAILABLE';
  v_blockers jsonb := '[]'::jsonb;
  v_v1461 jsonb := '{}'::jsonb;
  v_v147 jsonb := '{}'::jsonb;
begin
  select e.state,e.updated_at,e.cleared_at,coalesce(e.details,'{}'::jsonb)
  into v_quota_state,v_quota_updated_at,v_quota_cleared_at,v_quota_details
  from public.autonomous_ops_events e
  where e.event_key='ops:edge_quota_restricted';

  if v_quota_updated_at is not null then
    v_quota_age_minutes := round((extract(epoch from (v_now-v_quota_updated_at))/60.0)::numeric,2);
    v_quota_signal_fresh := v_quota_updated_at >= v_now-make_interval(mins=>v_signal_freshness_minutes);
  end if;

  v_quota_restricted :=
    coalesce(v_quota_state,'')='open'
    or lower(coalesce(v_quota_details->>'restricted','false'))='true'
    or lower(coalesce(v_quota_details->>'canonical_upstream_ok','true'))='false';

  select e.state,e.updated_at,e.cleared_at,coalesce(e.details,'{}'::jsonb)
  into v_shed_state,v_shed_updated_at,v_shed_cleared_at,v_shed_details
  from public.autonomous_ops_events e
  where e.event_key='ops:v72_load_shedding';

  select
    count(*)::int,
    count(*) filter(where g.was_active_before_pause)::int,
    count(*) filter(where g.paused_by_guard)::int,
    count(*) filter(where g.paused_by_guard and g.was_active_before_pause)::int,
    count(*) filter(
      where not g.paused_by_guard
        and g.was_active_before_pause
        and coalesce(j.active,false)
    )::int,
    count(*) filter(
      where j.jobid is null
        or (g.paused_by_guard and coalesce(j.active,false))
        or (not g.paused_by_guard and g.was_active_before_pause and not coalesce(j.active,false))
    )::int,
    count(*) filter(where j.jobid is null)::int,
    coalesce(jsonb_agg(jsonb_build_object(
      'jobname',g.jobname,
      'jobid',j.jobid,
      'paused_by_guard',g.paused_by_guard,
      'was_active_before_pause',g.was_active_before_pause,
      'live_active',j.active,
      'schedule',j.schedule,
      'guard_reason',g.reason,
      'guard_changed_at',g.last_changed_at,
      'consistent',case
        when j.jobid is null then false
        when g.paused_by_guard then not coalesce(j.active,false)
        when g.was_active_before_pause then coalesce(j.active,false)
        else true
      end
    ) order by g.jobname),'[]'::jsonb)
  into
    v_guard_rows,v_expected_guard_targets,v_paused_rows,v_paused_should_restore,
    v_restored_rows,v_mismatch_rows,v_missing_job_rows,v_guard_rows_json
  from public.autonomous_cron_guard_state g
  left join cron.job j on j.jobname=g.jobname;

  select j.jobid,j.active,j.schedule
  into v_enforcer_jobid,v_enforcer_active,v_enforcer_schedule
  from cron.job j
  where j.jobname='tfa-v72-edge-load-shed-enforcer';

  if v_enforcer_jobid is not null then
    select d.start_time,d.end_time,d.status,d.return_message
    into v_enforcer_last_start,v_enforcer_last_end,v_enforcer_last_status,v_enforcer_last_return
    from cron.job_run_details d
    where d.jobid=v_enforcer_jobid
    order by d.start_time desc
    limit 1;
  end if;

  if v_enforcer_last_start is not null then
    v_enforcer_age_minutes := round((extract(epoch from (v_now-v_enforcer_last_start))/60.0)::numeric,2);
    v_enforcer_fresh := v_enforcer_last_start >= v_now-make_interval(mins=>v_enforcer_freshness_minutes);
  end if;

  v_enforcer_healthy :=
    v_enforcer_jobid is not null
    and coalesce(v_enforcer_active,false)
    and coalesce(v_enforcer_last_status,'')='succeeded'
    and v_enforcer_fresh;

  if not v_quota_restricted and v_quota_cleared_at is not null then
    v_recovery_age_minutes := round((extract(epoch from (v_now-v_quota_cleared_at))/60.0)::numeric,2);
  end if;

  begin v_v1461 := public.get_v1461_peak_spreader_status();
  exception when others then v_v1461 := jsonb_build_object('ok',false,'state','UNAVAILABLE'); end;

  begin v_v147 := public.get_v147_connection_pressure_shadow();
  exception when others then v_v147 := jsonb_build_object('ok',false,'state','UNAVAILABLE'); end;

  if v_quota_updated_at is null then
    v_state := 'QUOTA_RECOVERY_SIGNAL_UNAVAILABLE';
    v_blockers := v_blockers || jsonb_build_array('QUOTA_EVENT_MISSING');
  elsif not v_quota_signal_fresh then
    v_state := 'QUOTA_SIGNAL_STALE';
    v_blockers := v_blockers || jsonb_build_array('QUOTA_SIGNAL_OLDER_THAN_15_MINUTES');
  elsif not v_enforcer_healthy then
    v_state := 'ENFORCER_UNHEALTHY';
    if v_enforcer_jobid is null then
      v_blockers := v_blockers || jsonb_build_array('V72_ENFORCER_JOB_MISSING');
    elsif not coalesce(v_enforcer_active,false) then
      v_blockers := v_blockers || jsonb_build_array('V72_ENFORCER_INACTIVE');
    elsif coalesce(v_enforcer_last_status,'')<>'succeeded' then
      v_blockers := v_blockers || jsonb_build_array('V72_ENFORCER_LAST_RUN_NOT_SUCCEEDED');
    elsif not v_enforcer_fresh then
      v_blockers := v_blockers || jsonb_build_array('V72_ENFORCER_LAST_RUN_STALE');
    end if;
  elsif v_quota_restricted then
    if v_missing_job_rows=0
       and v_mismatch_rows=0
       and v_paused_should_restore=v_expected_guard_targets
       and coalesce(v_shed_state,'')='open' then
      v_state := 'QUOTA_RESTRICTED_LOAD_SHEDDING_CONSISTENT';
    else
      v_state := 'GUARD_STATE_DIVERGENCE';
      if v_missing_job_rows>0 then v_blockers:=v_blockers||jsonb_build_array('GUARD_TARGET_JOB_MISSING'); end if;
      if v_mismatch_rows>0 then v_blockers:=v_blockers||jsonb_build_array('GUARD_TO_LIVE_CRON_MISMATCH'); end if;
      if v_paused_should_restore<>v_expected_guard_targets then v_blockers:=v_blockers||jsonb_build_array('EXPECTED_GUARD_TARGETS_NOT_ALL_PAUSED'); end if;
      if coalesce(v_shed_state,'')<>'open' then v_blockers:=v_blockers||jsonb_build_array('LOAD_SHED_EVENT_NOT_OPEN_WHILE_QUOTA_RESTRICTED'); end if;
    end if;
  else
    if v_missing_job_rows=0
       and v_mismatch_rows=0
       and v_paused_rows=0
       and v_restored_rows=v_expected_guard_targets
       and coalesce(v_shed_state,'')='cleared' then
      v_state := 'RECOVERY_CONFIRMED_RESTORED';
    elsif coalesce(v_recovery_age_minutes,999)<=v_recovery_grace_minutes
       and v_paused_should_restore>0 then
      v_state := 'RECOVERY_PENDING_GUARD_RELEASE';
    else
      v_state := 'GUARD_STATE_DIVERGENCE';
      if v_missing_job_rows>0 then v_blockers:=v_blockers||jsonb_build_array('GUARD_TARGET_JOB_MISSING'); end if;
      if v_mismatch_rows>0 then v_blockers:=v_blockers||jsonb_build_array('GUARD_TO_LIVE_CRON_MISMATCH'); end if;
      if v_paused_should_restore>0 then v_blockers:=v_blockers||jsonb_build_array('RECOVERED_QUOTA_BUT_GUARD_TARGETS_STILL_PAUSED'); end if;
      if coalesce(v_shed_state,'')<>'cleared' then v_blockers:=v_blockers||jsonb_build_array('LOAD_SHED_EVENT_NOT_CLEARED_AFTER_QUOTA_RECOVERY'); end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','v156-quota-guard-recovery-shadow-db-v1',
    'generated_at',v_now,
    'state',v_state,
    'quota',jsonb_build_object(
      'state',v_quota_state,
      'restricted',v_quota_restricted,
      'updated_at',v_quota_updated_at,
      'cleared_at',v_quota_cleared_at,
      'age_minutes',v_quota_age_minutes,
      'fresh',v_quota_signal_fresh,
      'freshness_limit_minutes',v_signal_freshness_minutes,
      'http_status',v_quota_details->'http_status',
      'canonical_upstream_ok',v_quota_details->'canonical_upstream_ok',
      'probe_version',v_quota_details->>'probe_version',
      'probe_request_id',v_quota_details->'probe_request_id'
    ),
    'load_shedding',jsonb_build_object(
      'state',v_shed_state,
      'updated_at',v_shed_updated_at,
      'cleared_at',v_shed_cleared_at,
      'details',v_shed_details
    ),
    'guard',jsonb_build_object(
      'rows',v_guard_rows,
      'expected_restore_targets',v_expected_guard_targets,
      'paused_rows',v_paused_rows,
      'paused_should_restore',v_paused_should_restore,
      'restored_active_rows',v_restored_rows,
      'mismatch_rows',v_mismatch_rows,
      'missing_job_rows',v_missing_job_rows,
      'rows_detail',v_guard_rows_json
    ),
    'enforcer',jsonb_build_object(
      'jobid',v_enforcer_jobid,
      'active',v_enforcer_active,
      'schedule',v_enforcer_schedule,
      'last_start',v_enforcer_last_start,
      'last_end',v_enforcer_last_end,
      'last_status',v_enforcer_last_status,
      'last_return_message',v_enforcer_last_return,
      'age_minutes',v_enforcer_age_minutes,
      'freshness_limit_minutes',v_enforcer_freshness_minutes,
      'fresh',v_enforcer_fresh,
      'healthy',v_enforcer_healthy
    ),
    'recovery',jsonb_build_object(
      'age_minutes',v_recovery_age_minutes,
      'grace_minutes',v_recovery_grace_minutes,
      'within_grace',coalesce(v_recovery_age_minutes,999)<=v_recovery_grace_minutes,
      'blockers',v_blockers
    ),
    'downstream',jsonb_build_object(
      'v1461_state',v_v1461->>'state',
      'v1461_guard_paused_jobs',v_v1461->'plan'->'guard_paused_jobs',
      'v1461_unexpected_drift_jobs',v_v1461->'plan'->'schedule_drift_jobs',
      'v1461_result_eligible',v_v1461->'success_gate'->'experiment_result_eligible',
      'v147_state',v_v147->>'state',
      'v147_pressure_score',v_v147->'pressure_score'
    ),
    'governance',jsonb_build_object(
      'action_permitted','WAIT',
      'capital_permission','0R',
      'live_order_routing',false,
      'automatic_guard_release',false,
      'automatic_rescheduling',false,
      'automatic_policy_promotion',false,
      'quota_recovery_can_unlock_capital',false
    ),
    'truth_label','QUOTA_GUARD_RECOVERY_INTEGRITY_SHADOW_NOT_TRADING_PERMISSION'
  );
end;
$function$;

revoke all on function public.get_v156_quota_guard_recovery_shadow() from public;
revoke all on function public.get_v156_quota_guard_recovery_shadow() from anon;
revoke all on function public.get_v156_quota_guard_recovery_shadow() from authenticated;
grant execute on function public.get_v156_quota_guard_recovery_shadow() to service_role;
