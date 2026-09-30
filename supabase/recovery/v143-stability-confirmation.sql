-- V143.1 Stability Confirmation Engine
-- Rolling infrastructure reliability only. Never grants trading permission.
-- A scheduler burst is recovered only after every failed job has a later successful run.

CREATE OR REPLACE FUNCTION public.get_v143_stability_confirmation()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'pg_temp'
AS $function$
declare
  v_now timestamptz := now();
  v_mode text := null;
  v_system_score integer := null;
  v_final_action text := 'WAIT';
  v_final_permission text := '0R';
  v_edge_runtime text := null;
  v_evidence text := null;
  v_smoke_state text := null;
  v_smoke_age numeric := null;
  v_connectors_healthy integer := 0;
  v_connectors_required integer := 0;
  v_open_incidents integer := 0;
  v_quota_total_60 integer := 0;
  v_quota_pass_60 integer := 0;
  v_quota_fail_60 integer := 0;
  v_quota_streak integer := 0;
  v_quota_latest_at timestamptz := null;
  v_smoke_total_24 integer := 0;
  v_smoke_pass_24 integer := 0;
  v_smoke_fail_24 integer := 0;
  v_smoke_streak integer := 0;
  v_smoke_latest_status text := null;
  v_smoke_latest_completed timestamptz := null;
  v_smoke_last_failure timestamptz := null;
  v_recovery_anchor timestamptz := null;
  v_stable_minutes numeric := 0;
  v_cron_success_15 integer := 0;
  v_cron_fail_15 integer := 0;
  v_cron_success_60 integer := 0;
  v_cron_fail_60 integer := 0;
  v_cron_reliability_15 numeric := 100;
  v_cron_reliability_60 numeric := 100;
  v_last_cron_failure_job text := null;
  v_last_cron_failure_at timestamptz := null;
  v_last_cron_failure_recovered boolean := false;
  v_unrecovered_failed_jobs_15 integer := 0;
  v_failure_class text := 'NONE_60M';
  v_state text := 'STABILITY_BUILDING';
  v_score integer := 0;
  v_confirmed boolean := false;
  v_actions jsonb := '[]'::jsonb;
begin
  select mode,system_score,final_action,final_permission,edge_runtime_state,evidence_state,
         smoke_state,smoke_age_minutes,connector_healthy,connector_required
  into v_mode,v_system_score,v_final_action,v_final_permission,v_edge_runtime,v_evidence,
       v_smoke_state,v_smoke_age,v_connectors_healthy,v_connectors_required
  from public.autonomous_machine_state where id=1;

  select count(*)::int into v_open_incidents
  from public.status_incidents
  where status <> 'resolved' and severity in ('major','critical');

  with q as (
    select requested_at,coalesce(ok,false) as ok,
      sum(case when coalesce(ok,false)=false then 1 else 0 end)
        over(order by requested_at desc rows between unbounded preceding and current row) as failures_seen
    from public.autonomous_external_probes
    where probe_kind='supabase_public_quota' and resolved_at is not null
    order by requested_at desc limit 50
  )
  select
    count(*) filter(where requested_at >= v_now-interval '60 minutes')::int,
    count(*) filter(where requested_at >= v_now-interval '60 minutes' and ok)::int,
    count(*) filter(where requested_at >= v_now-interval '60 minutes' and not ok)::int,
    count(*) filter(where ok and failures_seen=0)::int,
    max(requested_at)
  into v_quota_total_60,v_quota_pass_60,v_quota_fail_60,v_quota_streak,v_quota_latest_at
  from q;

  with s as (
    select completed_at,status,
      sum(case when status <> 'succeeded' then 1 else 0 end)
        over(order by completed_at desc rows between unbounded preceding and current row) as failures_seen
    from public.agent_runs
    where agent_type='production_smoke_sweep' and completed_at is not null
    order by completed_at desc limit 30
  )
  select
    count(*) filter(where completed_at >= v_now-interval '24 hours')::int,
    count(*) filter(where completed_at >= v_now-interval '24 hours' and status='succeeded')::int,
    count(*) filter(where completed_at >= v_now-interval '24 hours' and status<>'succeeded')::int,
    count(*) filter(where status='succeeded' and failures_seen=0)::int,
    (array_agg(status order by completed_at desc))[1],
    max(completed_at)
  into v_smoke_total_24,v_smoke_pass_24,v_smoke_fail_24,v_smoke_streak,v_smoke_latest_status,v_smoke_latest_completed
  from s;

  select max(completed_at) into v_smoke_last_failure
  from public.agent_runs
  where agent_type='production_smoke_sweep' and completed_at is not null and status <> 'succeeded';

  if v_smoke_last_failure is not null then
    select min(completed_at) into v_recovery_anchor
    from public.agent_runs
    where agent_type='production_smoke_sweep' and status='succeeded' and completed_at > v_smoke_last_failure;
  else
    select min(completed_at) into v_recovery_anchor
    from public.agent_runs
    where agent_type='production_smoke_sweep' and status='succeeded' and completed_at >= v_now-interval '24 hours';
  end if;

  if v_recovery_anchor is not null then
    v_stable_minutes := round((extract(epoch from (v_now-v_recovery_anchor))/60.0)::numeric,2);
  end if;

  select count(*) filter(where status='succeeded')::int,
         count(*) filter(where status not in ('succeeded','running'))::int
  into v_cron_success_15,v_cron_fail_15
  from cron.job_run_details where start_time >= v_now-interval '15 minutes';

  select count(*) filter(where status='succeeded')::int,
         count(*) filter(where status not in ('succeeded','running'))::int
  into v_cron_success_60,v_cron_fail_60
  from cron.job_run_details where start_time >= v_now-interval '60 minutes';

  if v_cron_success_15+v_cron_fail_15 > 0 then
    v_cron_reliability_15 := round((100.0*v_cron_success_15/(v_cron_success_15+v_cron_fail_15))::numeric,3);
  end if;
  if v_cron_success_60+v_cron_fail_60 > 0 then
    v_cron_reliability_60 := round((100.0*v_cron_success_60/(v_cron_success_60+v_cron_fail_60))::numeric,3);
  end if;

  select j.jobname,d.start_time
  into v_last_cron_failure_job,v_last_cron_failure_at
  from cron.job_run_details d join cron.job j on j.jobid=d.jobid
  where d.start_time >= v_now-interval '60 minutes' and d.status not in ('succeeded','running')
  order by d.start_time desc limit 1;

  if v_last_cron_failure_job is not null then
    select exists(
      select 1 from cron.job_run_details d join cron.job j on j.jobid=d.jobid
      where j.jobname=v_last_cron_failure_job
        and d.start_time > v_last_cron_failure_at
        and d.status='succeeded'
    ) into v_last_cron_failure_recovered;
  end if;

  with failures as (
    select j.jobname,max(d.start_time) as failure_at
    from cron.job_run_details d
    join cron.job j on j.jobid=d.jobid
    where d.start_time >= v_now-interval '15 minutes'
      and d.status not in ('succeeded','running')
    group by j.jobname
  )
  select count(*)::int
  into v_unrecovered_failed_jobs_15
  from failures f
  where not exists(
    select 1
    from cron.job_run_details d2
    join cron.job j2 on j2.jobid=d2.jobid
    where j2.jobname=f.jobname
      and d2.status='succeeded'
      and d2.start_time>f.failure_at
  );

  if v_open_incidents > 0
     or coalesce(v_mode,'UNKNOWN') <> 'AUTONOMOUS_READY'
     or coalesce(v_smoke_latest_status,'UNKNOWN') <> 'succeeded'
     or coalesce(v_smoke_state,'UNKNOWN') <> 'FRESH'
     or v_quota_streak = 0 then
    v_failure_class := 'PERSISTENT_ACTIVE';
  elsif v_unrecovered_failed_jobs_15 > 0 then
    v_failure_class := 'RECENT_FAILURE_UNCONFIRMED';
  elsif v_cron_fail_15 >= 3 then
    v_failure_class := 'TRANSIENT_BURST_RECOVERED';
  elsif v_cron_fail_60 > 0 or v_smoke_fail_24 > 0 or v_quota_fail_60 > 0 then
    v_failure_class := 'TRANSIENT_RECOVERED';
  else
    v_failure_class := 'NONE_60M';
  end if;

  v_score := 0;
  if coalesce(v_mode,'')='AUTONOMOUS_READY' then v_score:=v_score+20; end if;
  if coalesce(v_smoke_state,'')='FRESH' and coalesce(v_smoke_latest_status,'')='succeeded' then v_score:=v_score+20; end if;
  if v_quota_streak >= 3 then v_score:=v_score+15; elsif v_quota_streak >= 1 then v_score:=v_score+8; end if;
  if v_cron_reliability_60 >= 99.5 then v_score:=v_score+20;
  elsif v_cron_reliability_60 >= 99 then v_score:=v_score+15;
  elsif v_cron_reliability_60 >= 98 then v_score:=v_score+8; end if;
  if v_connectors_required>0 and v_connectors_healthy>=v_connectors_required then v_score:=v_score+10; end if;
  if v_open_incidents=0 then v_score:=v_score+5; end if;
  if v_stable_minutes>=15 then v_score:=v_score+10; elsif v_stable_minutes>=5 then v_score:=v_score+5; end if;
  v_score:=greatest(0,least(100,v_score));

  v_confirmed :=
    coalesce(v_mode,'')='AUTONOMOUS_READY'
    and coalesce(v_smoke_state,'')='FRESH'
    and coalesce(v_smoke_latest_status,'')='succeeded'
    and coalesce(v_smoke_age,999999)<=60
    and v_quota_streak>=3
    and v_cron_reliability_60>=99.5
    and v_connectors_required>0
    and v_connectors_healthy>=v_connectors_required
    and v_open_incidents=0
    and v_stable_minutes>=15
    and v_unrecovered_failed_jobs_15=0;

  if v_failure_class in ('PERSISTENT_ACTIVE','RECENT_FAILURE_UNCONFIRMED') then v_state:='STABILITY_BLOCKED';
  elsif v_confirmed then v_state:='STABILITY_CONFIRMED';
  else v_state:='STABILITY_BUILDING';
  end if;

  if v_stable_minutes < 15 then v_actions:=v_actions||jsonb_build_array('ACCUMULATE_15_MINUTES_POST_RECOVERY_STABILITY'); end if;
  if v_quota_streak < 3 then v_actions:=v_actions||jsonb_build_array('ACCUMULATE_3_CONSECUTIVE_QUOTA_CLEAR_PROBES'); end if;
  if v_cron_reliability_60 < 99.5 then v_actions:=v_actions||jsonb_build_array('IMPROVE_60_MINUTE_CRON_RELIABILITY'); end if;
  if v_failure_class='PERSISTENT_ACTIVE' then
    v_actions:=v_actions||jsonb_build_array('HOLD_STABILITY_CONFIRMATION_AND_INSPECT_ACTIVE_FAILURE');
  elsif v_failure_class='RECENT_FAILURE_UNCONFIRMED' then
    v_actions:=v_actions||jsonb_build_array('WAIT_FOR_FAILED_JOBS_TO_COMPLETE_A_SUCCESSFUL_RETRY');
  elsif v_failure_class='TRANSIENT_BURST_RECOVERED' then
    v_actions:=v_actions||jsonb_build_array('KEEP_SCHEDULER_BURST_UNDER_OBSERVATION');
  elsif v_failure_class='TRANSIENT_RECOVERED' then
    v_actions:=v_actions||jsonb_build_array('KEEP_TRANSIENT_FAILURE_UNDER_OBSERVATION');
  end if;

  return jsonb_build_object(
    'ok',true,'version','v143.1-stability-confirmation-db-v2','generated_at',v_now,
    'state',v_state,'stability_confirmed',v_confirmed,'stability_score',v_score,
    'stable_minutes',v_stable_minutes,'recovery_anchor',v_recovery_anchor,
    'current',jsonb_build_object(
      'mode',v_mode,'system_score',v_system_score,'edge_runtime',v_edge_runtime,'evidence',v_evidence,
      'production_smoke',jsonb_build_object('state',v_smoke_state,'age_minutes',v_smoke_age),
      'connectors',jsonb_build_object('healthy',v_connectors_healthy,'required',v_connectors_required),
      'open_major_critical_incidents',v_open_incidents
    ),
    'consecutive_health',jsonb_build_object(
      'quota_clear_streak',v_quota_streak,'quota_latest_at',v_quota_latest_at,
      'smoke_success_streak',v_smoke_streak,'smoke_latest_status',v_smoke_latest_status,
      'smoke_latest_completed_at',v_smoke_latest_completed
    ),
    'rolling_reliability',jsonb_build_object(
      'quota_60m',jsonb_build_object('total',v_quota_total_60,'passed',v_quota_pass_60,'failed',v_quota_fail_60),
      'smoke_24h',jsonb_build_object('total',v_smoke_total_24,'passed',v_smoke_pass_24,'failed',v_smoke_fail_24),
      'cron_15m',jsonb_build_object('succeeded',v_cron_success_15,'failed',v_cron_fail_15,'reliability_pct',v_cron_reliability_15),
      'cron_60m',jsonb_build_object('succeeded',v_cron_success_60,'failed',v_cron_fail_60,'reliability_pct',v_cron_reliability_60)
    ),
    'failure_classification',jsonb_build_object(
      'class',v_failure_class,'last_cron_failure_job',v_last_cron_failure_job,
      'last_cron_failure_at',v_last_cron_failure_at,'last_cron_failure_recovered',v_last_cron_failure_recovered,
      'unrecovered_failed_jobs_15m',v_unrecovered_failed_jobs_15,
      'rule','Persistent means a current health gate is failing. Recent failures remain blocked until each failed job has a later successful run. A same-window burst becomes transient only after all failed jobs recover.'
    ),
    'thresholds',jsonb_build_object(
      'post_recovery_stable_minutes',15,'quota_clear_streak',3,
      'cron_60m_reliability_pct',99.5,'smoke_max_age_minutes',60
    ),
    'actions',v_actions,
    'governance',jsonb_build_object(
      'action_permitted','WAIT','capital_permission','0R','live_order_routing',false,
      'automatic_policy_promotion',false,'stability_confirmation_can_unlock_capital',false
    ),
    'truth_label','ROLLING_INFRASTRUCTURE_STABILITY_NOT_TRADING_PERMISSION'
  );
end;
$function$


revoke all on function public.get_v143_stability_confirmation() from public;
revoke all on function public.get_v143_stability_confirmation() from anon;
revoke all on function public.get_v143_stability_confirmation() from authenticated;
grant execute on function public.get_v143_stability_confirmation() to service_role;
