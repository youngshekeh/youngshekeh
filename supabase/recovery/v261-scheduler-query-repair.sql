-- V261: targeted scheduler diagnostic query repair. No cron, ACL, data, or persistent timeout changes.
set local lock_timeout='2s';
set local statement_timeout='30s';
do $v261_guard$
begin
  if md5(pg_get_functiondef('private.compute_v1461_peak_spreader_status()'::regprocedure))<>'125ccfd6260220b25493cd3614a54860' then raise exception 'V261 source guard failed: compute_v1461_peak_spreader_status'; end if;
  if md5(pg_get_functiondef('private.compute_v147_connection_pressure_shadow()'::regprocedure))<>'b47e1cfcea7e5201d390f188e3cbf51a' then raise exception 'V261 source guard failed: compute_v147_connection_pressure_shadow'; end if;
end
$v261_guard$;

CREATE OR REPLACE FUNCTION private.compute_v1461_peak_spreader_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'cron', 'pg_temp'
AS $function$
declare
  v_now timestamptz := now();
  v_applied_at timestamptz;
  v_rolled_back_at timestamptz;
  v_observation_minutes numeric := 0;
  v_target_count integer := 0;
  v_compliant integer := 0;
  v_guard_paused integer := 0;
  v_drift integer := 0;

  v_base_peak_concurrent integer := 0;
  v_base_peak_starts integer := 0;
  v_base_quarter_peak integer := 0;
  v_base_failures integer := 0;
  v_base_runs integer := 0;

  v_since_peak_concurrent integer := 0;
  v_since_peak_starts integer := 0;
  v_since_quarter_peak integer := 0;
  v_since_failures integer := 0;
  v_since_runs integer := 0;

  v_15_peak integer := 0;
  v_15_failures integer := 0;
  v_15_runs integer := 0;
  v_60_peak integer := 0;
  v_60_failures integer := 0;
  v_60_runs integer := 0;

  v_state text := 'OBSERVING';
  v_plan jsonb := '[]'::jsonb;
  v_hot_minutes jsonb := '[]'::jsonb;
begin
  select min(applied_at),max(rolled_back_at),count(*)::int
  into v_applied_at,v_rolled_back_at,v_target_count
  from private.v1461_peak_spreader_plan;

  if v_target_count<>3 or v_applied_at is null then
    return jsonb_build_object(
      'ok',false,
      'version','v146.1-controlled-peak-spreader-db-v2-guard-aware',
      'state','PLAN_NOT_APPLIED',
      'governance',jsonb_build_object(
        'action_permitted','WAIT',
        'capital_permission','0R',
        'live_order_routing',false,
        'automatic_rescheduling',false,
        'automatic_policy_promotion',false
      )
    );
  end if;

  v_observation_minutes :=
    round((extract(epoch from (v_now-v_applied_at))/60.0)::numeric,2);

  with target_state as (
    select
      p.jobid,
      p.jobname,
      p.governed_schedule,
      j.schedule as current_schedule,
      coalesce(j.active,false) as active,
      (
        j.jobid is not null
        and not coalesce(j.active,false)
        and j.schedule=p.governed_schedule
        and coalesce(g.paused_by_guard,false)
        and coalesce(g.was_active_before_pause,false)
      ) as guard_paused
    from private.v1461_peak_spreader_plan p
    left join cron.job j on j.jobid=p.jobid
    left join public.autonomous_cron_guard_state g on g.jobname=p.jobname
  )
  select
    count(*) filter(where active and current_schedule=governed_schedule)::int,
    count(*) filter(where guard_paused)::int,
    count(*) filter(
      where current_schedule is null
         or current_schedule<>governed_schedule
         or (not active and not guard_paused)
    )::int
  into v_compliant,v_guard_paused,v_drift
  from target_state;

  select
    peak_concurrent,peak_starts_per_minute,quarter_hour_peak_starts,
    failures,runs
  into
    v_base_peak_concurrent,v_base_peak_starts,v_base_quarter_peak,
    v_base_failures,v_base_runs
  from private.v1461_peak_spreader_baselines
  where baseline_key='PRE_V146_1';

  -- V261: preserve complete since-apply history and both rolling windows.
  -- Materialize only metric columns once; never truncate run IDs or history.
  with history as materialized (
    select runid,jobid,start_time,end_time as finished_at,
      coalesce(end_time,v_now) as end_time,status
    from cron.job_run_details
    where start_time>=least(v_applied_at,v_now-interval '60 minutes')
  ), runs as materialized (
    select * from history where start_time>=v_applied_at
  ), events as (
    select start_time as ts,1 as delta from runs
    union all select end_time as ts,-1 as delta from runs
  ), sweep as (
    select ts,sum(delta) over(order by ts,delta desc rows unbounded preceding) as concurrent
    from events
  ), starts as materialized (
    select date_trunc('minute',start_time) as bucket,count(*)::int as starts,
      count(*) filter(where status not in ('succeeded','running'))::int as failures,
      round(max(extract(epoch from (finished_at-start_time))*1000)
        filter(where finished_at is not null)::numeric,1) as max_runtime_ms
    from runs group by 1
  ), r60 as materialized (
    select start_time,status from history where start_time>=v_now-interval '60 minutes'
  ), r15 as materialized (
    select * from r60 where start_time>=v_now-interval '15 minutes'
  ), m15 as (
    select date_trunc('minute',start_time) as bucket,count(*)::int as starts from r15 group by 1
  ), m60 as (
    select date_trunc('minute',start_time) as bucket,count(*)::int as starts from r60 group by 1
  ), hot as (
    select bucket as minute,starts,failures,max_runtime_ms
    from starts order by starts desc,bucket desc limit 12
  )
  select
    coalesce((select max(concurrent) from sweep),0)::int,
    coalesce((select max(starts) from starts),0)::int,
    coalesce((select max(starts) from starts where extract(minute from bucket)::int in (0,15,30,45)),0)::int,
    (select count(*) from runs where status not in ('succeeded','running'))::int,
    (select count(*) from runs)::int,
    coalesce((select max(starts) from m15),0)::int,
    (select count(*) from r15 where status not in ('succeeded','running'))::int,
    (select count(*) from r15)::int,
    coalesce((select max(starts) from m60),0)::int,
    (select count(*) from r60 where status not in ('succeeded','running'))::int,
    (select count(*) from r60)::int,
    coalesce((select jsonb_agg(hot) from hot),'[]'::jsonb)
  into
    v_since_peak_concurrent,v_since_peak_starts,v_since_quarter_peak,
    v_since_failures,v_since_runs,
    v_15_peak,v_15_failures,v_15_runs,
    v_60_peak,v_60_failures,v_60_runs,v_hot_minutes;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'jobname',p.jobname,
      'jobid',p.jobid,
      'lane',p.lane,
      'previous_schedule',p.previous_schedule,
      'governed_schedule',p.governed_schedule,
      'current_schedule',j.schedule,
      'active',coalesce(j.active,false),
      'compliant',coalesce(j.active,false) and j.schedule=p.governed_schedule,
      'guard_paused',(
        j.jobid is not null
        and not coalesce(j.active,false)
        and j.schedule=p.governed_schedule
        and coalesce(g.paused_by_guard,false)
        and coalesce(g.was_active_before_pause,false)
      ),
      'compliance_state',case
        when coalesce(j.active,false) and j.schedule=p.governed_schedule then 'COMPLIANT'
        when j.jobid is not null
          and not coalesce(j.active,false)
          and j.schedule=p.governed_schedule
          and coalesce(g.paused_by_guard,false)
          and coalesce(g.was_active_before_pause,false) then 'GUARD_PAUSED'
        else 'UNEXPECTED_DRIFT'
      end,
      'guard_reason',case when coalesce(g.paused_by_guard,false) then g.reason else null end,
      'guard_changed_at',case when coalesce(g.paused_by_guard,false) then g.last_changed_at else null end,
      'applied_at',p.applied_at,
      'rolled_back_at',p.rolled_back_at,
      'rationale',p.rationale
    ) order by p.jobname
  ),'[]'::jsonb)
  into v_plan
  from private.v1461_peak_spreader_plan p
  left join cron.job j on j.jobid=p.jobid
  left join public.autonomous_cron_guard_state g on g.jobname=p.jobname;

  if v_rolled_back_at is not null and v_rolled_back_at>=v_applied_at then
    v_state := 'ROLLBACK_APPLIED';
  elsif v_drift>0 then
    v_state := 'SCHEDULE_DRIFT_BLOCKED';
  elsif v_since_failures>v_base_failures then
    v_state := 'ROLLBACK_REVIEW_FAILURES';
  elsif v_guard_paused>0 then
    v_state := 'GUARD_PAUSED_OBSERVATION_DEGRADED';
  elsif v_observation_minutes<60 then
    v_state := 'OBSERVING';
  elsif v_since_quarter_peak<v_base_quarter_peak then
    v_state := 'PEAK_SPREAD_IMPROVED';
  else
    v_state := 'NO_MEASURED_QUARTER_HOUR_IMPROVEMENT';
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','v146.1-controlled-peak-spreader-db-v2-guard-aware',
    'generated_at',v_now,
    'state',v_state,
    'applied_at',v_applied_at,
    'observation_minutes',v_observation_minutes,
    'plan',jsonb_build_object(
      'target_jobs',v_target_count,
      'compliant_jobs',v_compliant,
      'guard_paused_jobs',v_guard_paused,
      'schedule_drift_jobs',v_drift,
      'jobs',v_plan
    ),
    'baseline',jsonb_build_object(
      'window_minutes',60,
      'peak_concurrent',v_base_peak_concurrent,
      'peak_starts_per_minute',v_base_peak_starts,
      'quarter_hour_peak_starts',v_base_quarter_peak,
      'failures',v_base_failures,
      'runs',v_base_runs
    ),
    'since_apply',jsonb_build_object(
      'peak_concurrent',v_since_peak_concurrent,
      'peak_starts_per_minute',v_since_peak_starts,
      'quarter_hour_peak_starts',v_since_quarter_peak,
      'failures',v_since_failures,
      'runs',v_since_runs
    ),
    'rolling',jsonb_build_object(
      'last_15m',jsonb_build_object(
        'peak_starts_per_minute',v_15_peak,
        'failures',v_15_failures,
        'runs',v_15_runs
      ),
      'last_60m',jsonb_build_object(
        'peak_starts_per_minute',v_60_peak,
        'failures',v_60_failures,
        'runs',v_60_runs
      )
    ),
    'post_change_hot_minutes',v_hot_minutes,
    'success_gate',jsonb_build_object(
      'minimum_observation_minutes',60,
      'baseline_quarter_hour_peak',v_base_quarter_peak,
      'measured_quarter_hour_peak',v_since_quarter_peak,
      'quarter_hour_peak_reduced',v_since_runs>0 and v_since_quarter_peak<v_base_quarter_peak,
      'no_new_failures',v_since_failures<=v_base_failures,
      'guard_pause_absent',v_guard_paused=0,
      'unexpected_drift_absent',v_drift=0,
      'all_targets_compliant',v_drift=0 and v_guard_paused=0,
      'experiment_result_eligible',v_drift=0 and v_guard_paused=0 and v_since_failures<=v_base_failures
    ),
    'guard_context',jsonb_build_object(
      'guard_paused_jobs',v_guard_paused,
      'unexpected_drift_jobs',v_drift,
      'external_guard_can_degrade_observation',true,
      'guard_pause_counts_as_experiment_success',false
    ),
    'rollback',jsonb_build_object(
      'available',true,
      'rollback_file','supabase/recovery/v1461-controlled-peak-spreader-rollback.sql',
      'automatic_rollback',false
    ),
    'governance',jsonb_build_object(
      'action_permitted','WAIT',
      'capital_permission','0R',
      'live_order_routing',false,
      'automatic_rescheduling',false,
      'automatic_policy_promotion',false,
      'scheduler_health_can_unlock_capital',false
    ),
    'truth_label','CONTROLLED_SCHEDULER_EXPERIMENT_GUARD_AWARE_NOT_TRADING_PERMISSION'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.compute_v147_connection_pressure_shadow()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_now timestamptz := now();
  v_max_connections integer := current_setting('max_connections')::int;
  v_reserved integer := current_setting('superuser_reserved_connections')::int;
  v_effective_capacity integer := greatest(v_max_connections-v_reserved,1);

  v_client integer := 0;
  v_active_client integer := 0;
  v_idle_client integer := 0;
  v_idle_tx integer := 0;
  v_active_pressure_waits integer := 0;
  v_lock_waits integer := 0;
  v_long_tx integer := 0;
  v_long_queries integer := 0;
  v_headroom integer := 0;
  v_util numeric := 0;

  v_cron_running integer := 0;
  v_cron_peak_15 integer := 0;
  v_cron_peak_60 integer := 0;
  v_cron_failures_15 integer := 0;
  v_cron_failures_60 integer := 0;

  v_score integer := 0;
  v_state text := 'NORMAL';
  v_actions jsonb := '[]'::jsonb;
  v_waits jsonb := '[]'::jsonb;
  v_v1461 jsonb := '{}'::jsonb;
begin
  select
    count(*) filter(where backend_type='client backend')::int,
    count(*) filter(where backend_type='client backend' and state='active')::int,
    count(*) filter(where backend_type='client backend' and state='idle')::int,
    count(*) filter(where backend_type='client backend' and state='idle in transaction')::int,
    count(*) filter(
      where backend_type='client backend'
        and state='active'
        and wait_event_type in ('Lock','IO','LWLock','BufferPin')
    )::int,
    count(*) filter(
      where backend_type='client backend'
        and xact_start is not null
        and v_now-xact_start>interval '30 seconds'
    )::int,
    count(*) filter(
      where backend_type='client backend'
        and state='active'
        and query_start is not null
        and v_now-query_start>interval '10 seconds'
    )::int
  into
    v_client,v_active_client,v_idle_client,v_idle_tx,
    v_active_pressure_waits,v_long_tx,v_long_queries
  from pg_stat_activity
  where pid<>pg_backend_pid();

  select count(*)::int
  into v_lock_waits
  from pg_locks
  where not granted;

  v_headroom := greatest(v_effective_capacity-v_client,0);
  v_util := round((100.0*v_client/v_effective_capacity)::numeric,2);

  -- V261: one complete history scan serves all three rolling windows.
  with r60 as materialized (
    select runid,jobid,start_time,coalesce(end_time,v_now) as end_time,status
    from cron.job_run_details
    where start_time>=v_now-interval '60 minutes'
  ), r15 as materialized (
    select * from r60 where start_time>=v_now-interval '15 minutes'
  ), e15 as (
    select start_time as ts,1 as delta from r15
    union all select end_time as ts,-1 as delta from r15
  ), s15 as (
    select ts,sum(delta) over(order by ts,delta desc rows unbounded preceding) as concurrent
    from e15
  ), e60 as (
    select start_time as ts,1 as delta from r60
    union all select end_time as ts,-1 as delta from r60
  ), s60 as (
    select ts,sum(delta) over(order by ts,delta desc rows unbounded preceding) as concurrent
    from e60
  )
  select
    (select count(*) from r60 where status='running' and start_time>=v_now-interval '30 minutes')::int,
    coalesce((select max(concurrent) from s15),0)::int,
    coalesce((select max(concurrent) from s60),0)::int,
    (select count(*) from r15 where status not in ('succeeded','running'))::int,
    (select count(*) from r60 where status not in ('succeeded','running'))::int
  into v_cron_running,v_cron_peak_15,v_cron_peak_60,v_cron_failures_15,v_cron_failures_60;

  select coalesce(jsonb_agg(x),'[]'::jsonb)
  into v_waits
  from (
    select
      coalesce(wait_event_type,'NONE') as wait_event_type,
      coalesce(wait_event,'NONE') as wait_event,
      coalesce(state,'NONE') as state,
      count(*)::int as count
    from pg_stat_activity
    where pid<>pg_backend_pid()
    group by 1,2,3
    order by count desc
    limit 12
  ) x;

  begin
    -- This nested summary is advisory context, not an input to pressure_score.
    -- Read the existing fresh cache; the V1461 endpoint owns its own refresh.
    -- A pressure observation must not recursively rebuild all experiment history.
    select payload into v_v1461
    from private.scheduler_intelligence_cache
    where engine_key='V1461' and refreshed_at>=v_now-interval '10 minutes';
    if v_v1461 is null then
      v_v1461 := jsonb_build_object('ok',false,'state','UNAVAILABLE');
    end if;
  exception when others then
    v_v1461 := jsonb_build_object('ok',false,'state','UNAVAILABLE');
  end;

  if v_util>=80 then v_score:=v_score+40;
  elsif v_util>=65 then v_score:=v_score+30;
  elsif v_util>=50 then v_score:=v_score+20;
  elsif v_util>=35 then v_score:=v_score+10;
  end if;

  if v_active_client>=15 then v_score:=v_score+15;
  elsif v_active_client>=8 then v_score:=v_score+10;
  elsif v_active_client>=4 then v_score:=v_score+5;
  end if;

  if v_lock_waits>0 then v_score:=v_score+20; end if;
  if v_idle_tx>0 then v_score:=v_score+10; end if;
  if v_long_tx>0 then v_score:=v_score+15; end if;
  if v_active_pressure_waits>0 then v_score:=v_score+10; end if;

  if v_cron_peak_15>16 then v_score:=v_score+20;
  elsif v_cron_peak_15>8 then v_score:=v_score+10;
  end if;

  if v_cron_failures_15>0 then v_score:=v_score+10; end if;

  v_score:=greatest(0,least(100,v_score));

  if v_score>=70 then v_state:='CRITICAL';
  elsif v_score>=50 then v_state:='HIGH';
  elsif v_score>=30 then v_state:='ELEVATED';
  else v_state:='NORMAL';
  end if;

  if v_util>=65 then
    v_actions:=v_actions || jsonb_build_array('REVIEW_CONNECTION_POOLING_AND_BACKEND_UTILIZATION');
  end if;
  if v_cron_peak_15>8 then
    v_actions:=v_actions || jsonb_build_array('CONTINUE_CRON_PHASE_REDUCTION_TOWARD_8_CONCURRENT');
  end if;
  if v_lock_waits>0 then
    v_actions:=v_actions || jsonb_build_array('INSPECT_DATABASE_LOCK_WAITERS');
  end if;
  if v_idle_tx>0 then
    v_actions:=v_actions || jsonb_build_array('INSPECT_IDLE_IN_TRANSACTION_SESSIONS');
  end if;
  if v_long_tx>0 then
    v_actions:=v_actions || jsonb_build_array('INSPECT_LONG_TRANSACTIONS');
  end if;
  if v_cron_failures_15>0 then
    v_actions:=v_actions || jsonb_build_array('INSPECT_RECENT_CRON_FAILURES');
  end if;
  if jsonb_array_length(v_actions)=0 then
    v_actions:=jsonb_build_array('MAINTAIN_CURRENT_GOVERNED_LOAD_AND_OBSERVE');
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','v147-connection-pressure-shadow-db-v1',
    'generated_at',v_now,
    'state',v_state,
    'pressure_score',v_score,
    'pressure_model',jsonb_build_object(
      'truth_label','DATABASE_BACKEND_PRESSURE_PROXY',
      'note','Client-backend utilization and database wait/cron telemetry are a pressure proxy; Supavisor pool occupancy is not directly measured here.'
    ),
    'connections',jsonb_build_object(
      'max_connections',v_max_connections,
      'reserved_connections',v_reserved,
      'effective_client_capacity',v_effective_capacity,
      'client_backends',v_client,
      'active_client_backends',v_active_client,
      'idle_client_backends',v_idle_client,
      'idle_in_transaction',v_idle_tx,
      'headroom',v_headroom,
      'utilization_pct',v_util,
      'active_pressure_waits',v_active_pressure_waits,
      'lock_waits',v_lock_waits,
      'long_transactions_over_30s',v_long_tx,
      'long_active_queries_over_10s',v_long_queries
    ),
    'cron_pressure',jsonb_build_object(
      'running_now',v_cron_running,
      'peak_concurrent_15m',v_cron_peak_15,
      'peak_concurrent_60m',v_cron_peak_60,
      'failures_15m',v_cron_failures_15,
      'failures_60m',v_cron_failures_60,
      'recommended_concurrent_ceiling',8
    ),
    'wait_distribution',v_waits,
    'v1461',jsonb_build_object(
      'state',v_v1461->>'state',
      'observation_minutes',v_v1461->'observation_minutes',
      'schedule_drift_jobs',v_v1461->'plan'->'schedule_drift_jobs',
      'failures_since_apply',v_v1461->'since_apply'->'failures'
    ),
    'actions',v_actions,
    'governance',jsonb_build_object(
      'action_permitted','WAIT',
      'capital_permission','0R',
      'live_order_routing',false,
      'automatic_connection_throttling',false,
      'automatic_pool_reconfiguration',false,
      'automatic_rescheduling',false,
      'automatic_policy_promotion',false,
      'connection_pressure_can_unlock_capital',false
    ),
    'truth_label','CONNECTION_PRESSURE_SHADOW_NOT_TRADING_PERMISSION'
  );
end;
$function$;
