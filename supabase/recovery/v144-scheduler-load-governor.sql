-- V144 Scheduler Load Governor
-- Phase-staggers non-execution-critical cron work while preserving frequent capture and capital-firewall checks.
-- Never grants trading permission.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table if not exists private.v144_scheduler_plan(
  jobname text primary key,
  jobid bigint not null unique,
  previous_schedule text not null,
  governed_schedule text not null,
  command text not null,
  stage integer not null,
  lane text not null,
  cadence_class text not null,
  rationale text not null,
  applied_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists private.v144_scheduler_baselines(
  baseline_key text primary key,
  captured_at timestamptz not null default now(),
  peak_concurrent integer,
  peak_starts_per_minute integer,
  avg_starts_per_active_minute numeric,
  failures integer,
  runs integer,
  window_minutes integer not null,
  note text
);

revoke all on all tables in schema private from public;
revoke all on all tables in schema private from anon;
revoke all on all tables in schema private from authenticated;

insert into private.v144_scheduler_baselines(
  baseline_key,peak_concurrent,peak_starts_per_minute,avg_starts_per_active_minute,
  failures,runs,window_minutes,note
)
with runs as (
  select runid,jobid,start_time,coalesce(end_time,now()) as end_time,status
  from cron.job_run_details
  where start_time>=now()-interval '2 hours'
),
events as (
  select start_time as ts,1 as delta from runs
  union all
  select end_time as ts,-1 as delta from runs
),
sweep as (
  select ts,sum(delta) over(order by ts,delta desc rows unbounded preceding) as concurrent
  from events
),
starts as (
  select date_trunc('minute',start_time) as minute,count(*) as starts
  from runs group by 1
)
select
  'PRE_V144',
  (select max(concurrent) from sweep),
  (select max(starts) from starts),
  (select round(avg(starts)::numeric,2) from starts),
  count(*) filter(where status not in ('succeeded','running')),
  count(*),
  120,
  'Captured immediately before V144 phase staggering'
from runs
on conflict(baseline_key) do nothing;

with desired(jobname,governed_schedule,stage,lane,cadence_class,rationale) as (
  values
  ('tfa-v80-gold-state-capture','*/2 * * * *',0,'CAPTURE','2_MIN','Primary state capture remains on the original even-minute cadence.'),
  ('tfa-v119-gold-desk-capture','*/2 * * * *',0,'CAPTURE','2_MIN','Gold desk capture remains on the original even-minute cadence.'),
  ('tfa-v84-research-components','1-59/2 * * * *',0,'CAPTURE','2_MIN','Move asynchronous research probes to odd minutes to split producer load.'),
  ('tfa-v86-capital-permission-firewall','1-59/2 * * * *',0,'SAFETY','2_MIN','Keep the capital firewall frequent while separating it from even-minute capture bursts.'),
  ('tfa-v132-gold-shadow-trader','1-59/2 * * * *',1,'SHADOW','2_MIN','Resolve prospective shadow outcomes one minute after the main capture lane.'),
  ('tfa-v125-gold-signal-reputation','0-59/5 * * * *',2,'LEARNING','5_MIN_PHASE_0','Signal reputation is retrospective learning and can refresh at five-minute cadence.'),
  ('tfa-v127-gold-review-intelligence','0-59/5 * * * *',2,'REVIEW','5_MIN_PHASE_0','Reviewer intelligence is not execution-critical and begins the review phase.'),
  ('tfa-v133-gold-shadow-portfolio','0-59/5 * * * *',2,'SHADOW','5_MIN_PHASE_0','Portfolio decisions follow frequent shadow outcome resolution without duplicating every two-minute run.'),
  ('tfa-v128-gold-disagreement-intelligence','1-59/5 * * * *',3,'REVIEW','5_MIN_PHASE_1','Disagreement intelligence follows review evidence by one minute.'),
  ('tfa-v130-gold-review-priority','1-59/5 * * * *',3,'REVIEW','5_MIN_PHASE_1','Priority assignment refreshes after the review phase.'),
  ('tfa-v133-gold-execution-reality','1-59/5 * * * *',3,'SHADOW','5_MIN_PHASE_1','Execution-reality stress analysis follows shadow outcome resolution and stays research-only.'),
  ('tfa-v129-gold-contextual-disagreement','2-59/5 * * * *',4,'REVIEW','5_MIN_PHASE_2','Contextual disagreement consumes disagreement events from the prior phase.'),
  ('tfa-v131-gold-review-response-latency','2-59/5 * * * *',4,'REVIEW','5_MIN_PHASE_2','Response-latency intelligence follows priority assignment.'),
  ('tfa-v136-gold-paper-portfolio-ledger','2-59/5 * * * *',4,'PAPER_RISK','5_MIN_PHASE_2','Immutable paper-equity ledger follows shadow portfolio outcomes.'),
  ('tfa-v136-gold-execution-firewall','3-59/5 * * * *',5,'SAFETY','5_MIN_PHASE_3','Dry-run execution firewall remains fail-closed and follows portfolio refresh.'),
  ('tfa-v1371-paper-risk-consensus','3-59/5 * * * *',5,'PAPER_RISK','5_MIN_PHASE_3','Paper-risk consensus follows the paper ledger and retains independent model checks.'),
  ('tfa-v136-gold-execution-qualification','4-59/5 * * * *',6,'SAFETY','5_MIN_PHASE_4','Execution qualification remains research-only and is separated from the firewall burst.'),
  ('tfa-v137-adaptive-paper-portfolio','4-59/5 * * * *',6,'PAPER_RISK','5_MIN_PHASE_4','Adaptive paper portfolio follows consensus and never changes real-capital permission.'),
  ('tfa-v138-risk-challenger-evaluation','11,26,41,56 * * * *',7,'EVALUATION','15_MIN_OFFSET','Prospective challenger evaluation is slow-moving and receives a unique quarter-hour offset.')
)
insert into private.v144_scheduler_plan(
  jobname,jobid,previous_schedule,governed_schedule,command,stage,lane,cadence_class,rationale
)
select
  d.jobname,j.jobid,j.schedule,d.governed_schedule,j.command,d.stage,d.lane,d.cadence_class,d.rationale
from desired d
join cron.job j on j.jobname=d.jobname
on conflict(jobname) do update
set jobid=excluded.jobid,
    governed_schedule=excluded.governed_schedule,
    command=excluded.command,
    stage=excluded.stage,
    lane=excluded.lane,
    cadence_class=excluded.cadence_class,
    rationale=excluded.rationale,
    updated_at=now();

do $$
declare
  v_count integer;
  v_bad integer;
  r record;
begin
  select count(*) into v_count from private.v144_scheduler_plan;
  if v_count<>19 then
    raise exception 'v144_expected_19_jobs_found_%',v_count;
  end if;

  select count(*) into v_bad
  from private.v144_scheduler_plan p
  join cron.job j on j.jobid=p.jobid
  where j.active is not true
     or j.schedule not in (p.previous_schedule,p.governed_schedule);

  if v_bad>0 then
    raise exception 'v144_schedule_precondition_failed_for_%_jobs',v_bad;
  end if;

  for r in
    select p.jobid,p.governed_schedule
    from private.v144_scheduler_plan p
    order by p.stage,p.jobid
  loop
    perform cron.alter_job(r.jobid, schedule := r.governed_schedule);
  end loop;

  update private.v144_scheduler_plan
  set applied_at=coalesce(applied_at,now()),
      updated_at=now();
end $$;

CREATE OR REPLACE FUNCTION public.get_v144_scheduler_load_governor()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'cron', 'pg_temp'
AS $function$
declare
  v_now timestamptz := now();
  v_applied_at timestamptz;
  v_observation_minutes numeric := 0;

  v_plan_count integer := 0;
  v_compliant_count integer := 0;
  v_drift_count integer := 0;
  v_active_jobs integer := 0;
  v_running_jobs integer := 0;

  v_baseline_peak_concurrent integer := 0;
  v_baseline_peak_starts integer := 0;
  v_baseline_avg_starts numeric := 0;
  v_baseline_failures integer := 0;
  v_baseline_runs integer := 0;

  v_since_peak_concurrent integer := 0;
  v_since_peak_starts integer := 0;
  v_since_avg_starts numeric := 0;
  v_since_failures integer := 0;
  v_since_runs integer := 0;

  v_15_peak_concurrent integer := 0;
  v_15_peak_starts integer := 0;
  v_15_failures integer := 0;
  v_15_runs integer := 0;
  v_60_peak_concurrent integer := 0;
  v_60_peak_starts integer := 0;
  v_60_failures integer := 0;
  v_60_runs integer := 0;
  v_15_failure_burst integer := 0;

  v_peak_concurrency_reduction_pct numeric := null;
  v_peak_start_reduction_pct numeric := null;
  v_state text := 'OBSERVING';
  v_score integer := 0;
  v_plan jsonb := '[]'::jsonb;
  v_lanes jsonb := '{}'::jsonb;
  v_actions jsonb := '[]'::jsonb;
begin
  select min(applied_at),count(*)::int
  into v_applied_at,v_plan_count
  from private.v144_scheduler_plan;

  if v_applied_at is null then
    return jsonb_build_object(
      'ok',false,
      'version','v144-scheduler-load-governor-db-v1',
      'state','PLAN_NOT_APPLIED',
      'governance',jsonb_build_object(
        'action_permitted','WAIT',
        'capital_permission','0R',
        'live_order_routing',false,
        'automatic_policy_promotion',false,
        'automatic_rescheduling',false
      )
    );
  end if;

  v_observation_minutes := round((extract(epoch from (v_now-v_applied_at))/60.0)::numeric,2);

  select
    count(*) filter(where j.schedule=p.governed_schedule and j.active)::int,
    count(*) filter(where j.schedule<>p.governed_schedule or not j.active)::int
  into v_compliant_count,v_drift_count
  from private.v144_scheduler_plan p
  join cron.job j on j.jobid=p.jobid;

  select count(*)::int into v_active_jobs from cron.job where active=true;

  select count(*)::int
  into v_running_jobs
  from cron.job_run_details
  where status='running'
    and start_time>=v_now-interval '30 minutes';

  select
    coalesce(peak_concurrent,0),
    coalesce(peak_starts_per_minute,0),
    coalesce(avg_starts_per_active_minute,0),
    coalesce(failures,0),
    coalesce(runs,0)
  into
    v_baseline_peak_concurrent,
    v_baseline_peak_starts,
    v_baseline_avg_starts,
    v_baseline_failures,
    v_baseline_runs
  from private.v144_scheduler_baselines
  where baseline_key='PRE_V144';

  with runs as (
    select runid,jobid,start_time,coalesce(end_time,v_now) as end_time,status
    from cron.job_run_details
    where start_time>=v_applied_at
  ),
  events as (
    select start_time as ts,1 as delta from runs
    union all
    select end_time as ts,-1 as delta from runs
  ),
  sweep as (
    select ts,sum(delta) over(order by ts,delta desc rows unbounded preceding) as concurrent
    from events
  ),
  starts as (
    select date_trunc('minute',start_time) as minute,count(*) as starts
    from runs group by 1
  )
  select
    coalesce((select max(concurrent) from sweep),0)::int,
    coalesce((select max(starts) from starts),0)::int,
    coalesce((select round(avg(starts)::numeric,2) from starts),0),
    count(*) filter(where status not in ('succeeded','running'))::int,
    count(*)::int
  into
    v_since_peak_concurrent,
    v_since_peak_starts,
    v_since_avg_starts,
    v_since_failures,
    v_since_runs
  from runs;

  with runs as (
    select runid,jobid,start_time,coalesce(end_time,v_now) as end_time,status
    from cron.job_run_details
    where start_time>=v_now-interval '15 minutes'
  ),
  events as (
    select start_time as ts,1 as delta from runs
    union all
    select end_time as ts,-1 as delta from runs
  ),
  sweep as (
    select ts,sum(delta) over(order by ts,delta desc rows unbounded preceding) as concurrent
    from events
  ),
  starts as (
    select date_trunc('minute',start_time) as minute,count(*) as starts
    from runs group by 1
  ),
  fail_bursts as (
    select date_trunc('minute',start_time) as minute,
           count(*) filter(where status not in ('succeeded','running'))::int as failures
    from runs group by 1
  )
  select
    coalesce((select max(concurrent) from sweep),0)::int,
    coalesce((select max(starts) from starts),0)::int,
    count(*) filter(where status not in ('succeeded','running'))::int,
    count(*)::int,
    coalesce((select max(failures) from fail_bursts),0)::int
  into
    v_15_peak_concurrent,
    v_15_peak_starts,
    v_15_failures,
    v_15_runs,
    v_15_failure_burst
  from runs;

  with runs as (
    select runid,jobid,start_time,coalesce(end_time,v_now) as end_time,status
    from cron.job_run_details
    where start_time>=v_now-interval '60 minutes'
  ),
  events as (
    select start_time as ts,1 as delta from runs
    union all
    select end_time as ts,-1 as delta from runs
  ),
  sweep as (
    select ts,sum(delta) over(order by ts,delta desc rows unbounded preceding) as concurrent
    from events
  ),
  starts as (
    select date_trunc('minute',start_time) as minute,count(*) as starts
    from runs group by 1
  )
  select
    coalesce((select max(concurrent) from sweep),0)::int,
    coalesce((select max(starts) from starts),0)::int,
    count(*) filter(where status not in ('succeeded','running'))::int,
    count(*)::int
  into
    v_60_peak_concurrent,
    v_60_peak_starts,
    v_60_failures,
    v_60_runs
  from runs;

  if v_baseline_peak_concurrent>0 and v_since_runs>0 then
    v_peak_concurrency_reduction_pct :=
      round((100.0*(v_baseline_peak_concurrent-v_since_peak_concurrent)/v_baseline_peak_concurrent)::numeric,2);
  end if;

  if v_baseline_peak_starts>0 and v_since_runs>0 then
    v_peak_start_reduction_pct :=
      round((100.0*(v_baseline_peak_starts-v_since_peak_starts)/v_baseline_peak_starts)::numeric,2);
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'stage',p.stage,
      'lane',p.lane,
      'jobname',p.jobname,
      'previous_schedule',p.previous_schedule,
      'governed_schedule',p.governed_schedule,
      'current_schedule',j.schedule,
      'compliant',j.active and j.schedule=p.governed_schedule,
      'cadence_class',p.cadence_class,
      'rationale',p.rationale
    )
    order by p.stage,p.jobname
  ),'[]'::jsonb)
  into v_plan
  from private.v144_scheduler_plan p
  join cron.job j on j.jobid=p.jobid;

  select coalesce(jsonb_object_agg(lane,cnt),'{}'::jsonb)
  into v_lanes
  from (
    select lane,count(*)::int as cnt
    from private.v144_scheduler_plan
    group by lane
    order by lane
  ) x;

  if v_drift_count>0 then
    v_state := 'SCHEDULE_DRIFT_BLOCKED';
    v_actions := v_actions || jsonb_build_array('RESTORE_V144_GOVERNED_SCHEDULES');
  elsif v_15_failure_burst>=3 then
    v_state := 'LOAD_DEGRADED_FAILURE_BURST';
    v_actions := v_actions || jsonb_build_array('INSPECT_RECENT_CRON_FAILURE_BURST');
  elsif v_observation_minutes<10 then
    v_state := 'OBSERVING';
    v_actions := v_actions || jsonb_build_array('ACCUMULATE_10_MINUTES_POST_STAGGER_TELEMETRY');
  elsif v_since_peak_concurrent<=8 then
    v_state := 'LOAD_HEALTHY';
  elsif v_since_peak_concurrent<=16 then
    v_state := 'LOAD_REDUCED_ABOVE_TARGET';
    v_actions := v_actions || jsonb_build_array('CONTINUE_LOAD_REDUCTION_TOWARD_8_CONCURRENT');
  else
    v_state := 'LOAD_HIGH';
    v_actions := v_actions || jsonb_build_array('REVIEW_NON_V144_CRON_HOTSPOTS');
  end if;

  v_score := 0;
  if v_plan_count=19 and v_drift_count=0 then v_score:=v_score+25; end if;
  if v_15_failures=0 then v_score:=v_score+20;
  elsif v_15_failures<=1 then v_score:=v_score+10; end if;
  if v_since_peak_concurrent<=8 then v_score:=v_score+30;
  elsif v_since_peak_concurrent<=16 then v_score:=v_score+20;
  elsif v_since_peak_concurrent<v_baseline_peak_concurrent then v_score:=v_score+10; end if;
  if v_since_peak_starts<v_baseline_peak_starts then v_score:=v_score+15; end if;
  if v_observation_minutes>=10 then v_score:=v_score+10; end if;
  v_score:=greatest(0,least(100,v_score));

  return jsonb_build_object(
    'ok',true,
    'version','v144-scheduler-load-governor-db-v1',
    'generated_at',v_now,
    'state',v_state,
    'score',v_score,
    'applied_at',v_applied_at,
    'observation_minutes',v_observation_minutes,
    'plan',jsonb_build_object(
      'target_jobs',v_plan_count,
      'compliant_jobs',v_compliant_count,
      'schedule_drift_jobs',v_drift_count,
      'lanes',v_lanes,
      'jobs',v_plan
    ),
    'baseline',jsonb_build_object(
      'window_minutes',120,
      'peak_concurrent',v_baseline_peak_concurrent,
      'peak_starts_per_minute',v_baseline_peak_starts,
      'avg_starts_per_active_minute',v_baseline_avg_starts,
      'failures',v_baseline_failures,
      'runs',v_baseline_runs
    ),
    'since_apply',jsonb_build_object(
      'peak_concurrent',v_since_peak_concurrent,
      'peak_starts_per_minute',v_since_peak_starts,
      'avg_starts_per_active_minute',v_since_avg_starts,
      'failures',v_since_failures,
      'runs',v_since_runs,
      'peak_concurrency_reduction_pct',v_peak_concurrency_reduction_pct,
      'peak_start_reduction_pct',v_peak_start_reduction_pct
    ),
    'rolling',jsonb_build_object(
      'last_15m',jsonb_build_object(
        'peak_concurrent',v_15_peak_concurrent,
        'peak_starts_per_minute',v_15_peak_starts,
        'failures',v_15_failures,
        'failure_burst_max',v_15_failure_burst,
        'runs',v_15_runs
      ),
      'last_60m',jsonb_build_object(
        'peak_concurrent',v_60_peak_concurrent,
        'peak_starts_per_minute',v_60_peak_starts,
        'failures',v_60_failures,
        'runs',v_60_runs
      )
    ),
    'runtime',jsonb_build_object(
      'active_jobs',v_active_jobs,
      'currently_running_jobs',v_running_jobs,
      'recommended_concurrent_ceiling',8,
      'pg_cron_version',(select extversion from pg_extension where extname='pg_cron')
    ),
    'actions',v_actions,
    'governance',jsonb_build_object(
      'action_permitted','WAIT',
      'capital_permission','0R',
      'live_order_routing',false,
      'automatic_policy_promotion',false,
      'automatic_rescheduling',false,
      'rollback_snapshot_preserved',true,
      'scheduler_health_can_unlock_capital',false
    ),
    'truth_label','SCHEDULER_LOAD_GOVERNANCE_NOT_TRADING_PERMISSION'
  );
end;
$function$


revoke all on function public.get_v144_scheduler_load_governor() from public;
revoke all on function public.get_v144_scheduler_load_governor() from anon;
revoke all on function public.get_v144_scheduler_load_governor() from authenticated;
grant execute on function public.get_v144_scheduler_load_governor() to service_role;
