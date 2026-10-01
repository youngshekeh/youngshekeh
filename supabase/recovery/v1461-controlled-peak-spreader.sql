-- V146.1 Controlled Peak-Minute Spreader
-- Approved scope: three non-execution observability/shadow-observation cron jobs only.
-- Preserves original schedules for rollback. Does not alter GOLD capture, capital firewall,
-- execution firewall, paper-risk, or live-order routing controls.

create table if not exists private.v1461_peak_spreader_plan (
  jobname text primary key,
  jobid bigint not null unique,
  previous_schedule text not null,
  governed_schedule text not null,
  command text not null,
  lane text not null,
  rationale text not null,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  rolled_back_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists private.v1461_peak_spreader_baselines (
  baseline_key text primary key,
  captured_at timestamptz not null default now(),
  peak_concurrent integer not null,
  peak_starts_per_minute integer not null,
  quarter_hour_peak_starts integer not null,
  failures integer not null,
  runs integer not null,
  window_minutes integer not null,
  note text
);

revoke all on private.v1461_peak_spreader_plan from public, anon, authenticated;
revoke all on private.v1461_peak_spreader_baselines from public, anon, authenticated;

insert into private.v1461_peak_spreader_baselines(
  baseline_key,peak_concurrent,peak_starts_per_minute,quarter_hour_peak_starts,
  failures,runs,window_minutes,note
)
with runs as (
  select runid,jobid,start_time,coalesce(end_time,now()) as end_time,status
  from cron.job_run_details
  where start_time>=now()-interval '60 minutes'
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
  select date_trunc('minute',start_time) as bucket,count(*)::int as starts
  from runs group by 1
),
quarter_starts as (
  select date_trunc('minute',start_time) as bucket,count(*)::int as starts
  from runs
  where extract(minute from start_time)::int in (0,15,30,45)
  group by 1
)
select
  'PRE_V146_1',
  coalesce((select max(concurrent) from sweep),0)::int,
  coalesce((select max(starts) from starts),0)::int,
  coalesce((select max(starts) from quarter_starts),0)::int,
  count(*) filter(where status not in ('succeeded','running'))::int,
  count(*)::int,
  60,
  'Captured immediately before V146.1 controlled quarter-hour observability spreading'
from runs
on conflict(baseline_key) do nothing;

with desired(jobname,governed_schedule,lane,rationale) as (
  values
  ('tfa-production-smoke-sweep','6,21,36,51 * * * *','OBSERVABILITY',
   'Preserve 15-minute smoke cadence while moving launches away from :00/:15/:30/:45 market and command walls.'),
  ('tfa-enterprise-monitor-evaluator','8,23,38,53 * * * *','OBSERVABILITY',
   'Preserve 15-minute enterprise monitoring while separating network I/O from quarter-hour launch walls.'),
  ('tfa-v71-shadow-observation','9,24,39,54 * * * *','SHADOW_OBSERVATION',
   'Preserve 15-minute shadow observation while moving it away from quarter-hour market and command walls.')
)
insert into private.v1461_peak_spreader_plan(
  jobname,jobid,previous_schedule,governed_schedule,command,lane,rationale
)
select d.jobname,j.jobid,j.schedule,d.governed_schedule,j.command,d.lane,d.rationale
from desired d
join cron.job j on j.jobname=d.jobname
on conflict(jobname) do update
set jobid=excluded.jobid,
    governed_schedule=excluded.governed_schedule,
    command=excluded.command,
    lane=excluded.lane,
    rationale=excluded.rationale,
    updated_at=now();

do $$
declare
  v_count integer;
  v_bad integer;
  v_target_failures integer;
  r record;
begin
  select count(*) into v_count from private.v1461_peak_spreader_plan;
  if v_count<>3 then
    raise exception 'v1461_expected_3_targets_found_%',v_count;
  end if;

  select count(*) into v_bad
  from private.v1461_peak_spreader_plan p
  join cron.job j on j.jobid=p.jobid
  where j.active is not true
     or j.schedule<>p.previous_schedule
     or p.previous_schedule<>'*/15 * * * *';

  if v_bad>0 then
    raise exception 'v1461_precondition_schedule_or_activity_mismatch_%',v_bad;
  end if;

  select count(*) into v_target_failures
  from cron.job_run_details d
  join private.v1461_peak_spreader_plan p on p.jobid=d.jobid
  where d.start_time>=now()-interval '24 hours'
    and d.status not in ('succeeded','running');

  if v_target_failures>0 then
    raise exception 'v1461_target_failures_24h_%',v_target_failures;
  end if;

  for r in
    select jobid,governed_schedule
    from private.v1461_peak_spreader_plan
    order by jobid
  loop
    perform cron.alter_job(job_id := r.jobid, schedule := r.governed_schedule);
  end loop;

  update private.v1461_peak_spreader_plan
  set applied_at=coalesce(applied_at,now()),
      rolled_back_at=null,
      updated_at=now();
end $$;

create or replace function public.get_v1461_peak_spreader_status()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','cron','pg_temp'
as $function$
declare
  v_now timestamptz := now();
  v_applied_at timestamptz;
  v_rolled_back_at timestamptz;
  v_observation_minutes numeric := 0;
  v_target_count integer := 0;
  v_compliant integer := 0;
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
      'version','v146.1-controlled-peak-spreader-db-v1',
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

  select
    count(*) filter(where j.active and j.schedule=p.governed_schedule)::int,
    count(*) filter(where not j.active or j.schedule<>p.governed_schedule)::int
  into v_compliant,v_drift
  from private.v1461_peak_spreader_plan p
  join cron.job j on j.jobid=p.jobid;

  select
    peak_concurrent,peak_starts_per_minute,quarter_hour_peak_starts,
    failures,runs
  into
    v_base_peak_concurrent,v_base_peak_starts,v_base_quarter_peak,
    v_base_failures,v_base_runs
  from private.v1461_peak_spreader_baselines
  where baseline_key='PRE_V146_1';

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
    select date_trunc('minute',start_time) as bucket,count(*)::int as starts
    from runs group by 1
  ),
  qstarts as (
    select date_trunc('minute',start_time) as bucket,count(*)::int as starts
    from runs
    where extract(minute from start_time)::int in (0,15,30,45)
    group by 1
  )
  select
    coalesce((select max(concurrent) from sweep),0)::int,
    coalesce((select max(starts) from starts),0)::int,
    coalesce((select max(starts) from qstarts),0)::int,
    count(*) filter(where status not in ('succeeded','running'))::int,
    count(*)::int
  into
    v_since_peak_concurrent,v_since_peak_starts,v_since_quarter_peak,
    v_since_failures,v_since_runs
  from runs;

  with r15 as (
    select * from cron.job_run_details
    where start_time>=v_now-interval '15 minutes'
  ), m15 as (
    select date_trunc('minute',start_time) as bucket,count(*)::int as starts
    from r15 group by 1
  ), r60 as (
    select * from cron.job_run_details
    where start_time>=v_now-interval '60 minutes'
  ), m60 as (
    select date_trunc('minute',start_time) as bucket,count(*)::int as starts
    from r60 group by 1
  )
  select
    coalesce((select max(starts) from m15),0)::int,
    (select count(*) from r15 where status not in ('succeeded','running'))::int,
    (select count(*) from r15)::int,
    coalesce((select max(starts) from m60),0)::int,
    (select count(*) from r60 where status not in ('succeeded','running'))::int,
    (select count(*) from r60)::int
  into
    v_15_peak,v_15_failures,v_15_runs,
    v_60_peak,v_60_failures,v_60_runs;

  select coalesce(jsonb_agg(x),'[]'::jsonb)
  into v_hot_minutes
  from (
    select
      date_trunc('minute',d.start_time) as minute,
      count(*)::int as starts,
      count(*) filter(where d.status not in ('succeeded','running'))::int as failures,
      round(max(extract(epoch from (d.end_time-d.start_time))*1000)
        filter(where d.end_time is not null)::numeric,1) as max_runtime_ms
    from cron.job_run_details d
    where d.start_time>=v_applied_at
    group by 1
    order by starts desc,minute desc
    limit 12
  ) x;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'jobname',p.jobname,
      'jobid',p.jobid,
      'lane',p.lane,
      'previous_schedule',p.previous_schedule,
      'governed_schedule',p.governed_schedule,
      'current_schedule',j.schedule,
      'active',j.active,
      'compliant',j.active and j.schedule=p.governed_schedule,
      'applied_at',p.applied_at,
      'rolled_back_at',p.rolled_back_at,
      'rationale',p.rationale
    ) order by p.jobname
  ),'[]'::jsonb)
  into v_plan
  from private.v1461_peak_spreader_plan p
  join cron.job j on j.jobid=p.jobid;

  if v_rolled_back_at is not null and v_rolled_back_at>=v_applied_at then
    v_state := 'ROLLBACK_APPLIED';
  elsif v_drift>0 then
    v_state := 'SCHEDULE_DRIFT_BLOCKED';
  elsif v_since_failures>v_base_failures then
    v_state := 'ROLLBACK_REVIEW_FAILURES';
  elsif v_observation_minutes<60 then
    v_state := 'OBSERVING';
  elsif v_since_quarter_peak<v_base_quarter_peak then
    v_state := 'PEAK_SPREAD_IMPROVED';
  else
    v_state := 'NO_MEASURED_QUARTER_HOUR_IMPROVEMENT';
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','v146.1-controlled-peak-spreader-db-v1',
    'generated_at',v_now,
    'state',v_state,
    'applied_at',v_applied_at,
    'observation_minutes',v_observation_minutes,
    'plan',jsonb_build_object(
      'target_jobs',v_target_count,
      'compliant_jobs',v_compliant,
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
      'all_targets_compliant',v_drift=0
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
    'truth_label','CONTROLLED_SCHEDULER_EXPERIMENT_NOT_TRADING_PERMISSION'
  );
end;
$function$;

revoke all on function public.get_v1461_peak_spreader_status() from public;
revoke all on function public.get_v1461_peak_spreader_status() from anon;
revoke all on function public.get_v1461_peak_spreader_status() from authenticated;
grant execute on function public.get_v1461_peak_spreader_status() to service_role;
