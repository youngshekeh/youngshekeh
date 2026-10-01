-- V152 Post-Shift Observer
-- Observes V151.1 after the single anomaly-watch phase change.
-- Read-only. It may recommend rollback but never changes cron automatically.

create or replace function public.get_v152_post_shift_observer()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','cron','pg_catalog','pg_temp'
as $function$
declare
  v_now timestamptz := now();
  v_plan private.v1511_controlled_shift_ledger%rowtype;
  v_jobid bigint;
  v_live_schedule text;
  v_active boolean := false;
  v_minutes_since_apply numeric := 0;
  v_cron_runs integer := 0;
  v_cron_succeeded integer := 0;
  v_cron_failed integer := 0;
  v_cron_running integer := 0;
  v_latest_cron_start timestamptz;
  v_latest_cron_end timestamptz;
  v_agent_runs integer := 0;
  v_agent_succeeded integer := 0;
  v_agent_failed integer := 0;
  v_agent_running integer := 0;
  v_latest_agent_start timestamptz;
  v_latest_agent_complete timestamptz;
  v_p95_agent_ms numeric;
  v_receipt_gap integer := 0;
  v_latest_success_age numeric;
  v_v147 jsonb := '{}'::jsonb;
  v_v1461 jsonb := '{}'::jsonb;
  v_state text := 'NOT_APPLIED';
  v_rollback_recommended boolean := false;
  v_next_plan_review_eligible boolean := false;
begin
  select *
  into v_plan
  from private.v1511_controlled_shift_ledger
  where plan_id='V1511_OWNER_ANOMALY_SHIFT_001';

  begin
    v_v147 := public.get_v147_connection_pressure_shadow();
  exception when others then
    v_v147 := jsonb_build_object('ok',false,'state','UNAVAILABLE');
  end;

  begin
    v_v1461 := public.get_v1461_peak_spreader_status();
  exception when others then
    v_v1461 := jsonb_build_object('ok',false,'state','UNAVAILABLE');
  end;

  if v_plan.plan_id is null then
    return jsonb_build_object(
      'ok',true,
      'version','v152-post-shift-observer-db-v1',
      'generated_at',v_now,
      'state','NOT_APPLIED',
      'summary',jsonb_build_object(
        'post_cron_runs',0,
        'post_business_receipts',0,
        'rollback_recommended',false,
        'next_plan_review_eligible',false
      ),
      'governance',jsonb_build_object(
        'action_permitted','WAIT',
        'capital_permission','0R',
        'live_order_routing',false,
        'automatic_rollback',false,
        'automatic_rescheduling',false
      ),
      'truth_label','POST_SHIFT_OBSERVER_NOT_TRADING_PERMISSION'
    );
  end if;

  select jobid,schedule,active
  into v_jobid,v_live_schedule,v_active
  from cron.job
  where jobname=v_plan.jobname;

  v_minutes_since_apply := round((extract(epoch from (v_now-v_plan.applied_at))/60.0)::numeric,2);

  select
    count(*)::int,
    count(*) filter(where status='succeeded')::int,
    count(*) filter(where status not in ('succeeded','running'))::int,
    count(*) filter(where status='running')::int,
    max(start_time),
    max(end_time)
  into
    v_cron_runs,v_cron_succeeded,v_cron_failed,v_cron_running,
    v_latest_cron_start,v_latest_cron_end
  from cron.job_run_details
  where jobid=v_plan.jobid
    and start_time>=v_plan.applied_at;

  select
    count(*)::int,
    count(*) filter(where status='succeeded')::int,
    count(*) filter(where status='failed')::int,
    count(*) filter(where status='running')::int,
    max(started_at),
    max(completed_at),
    round(percentile_cont(0.95) within group(
      order by extract(epoch from (completed_at-started_at))*1000
    ) filter(
      where completed_at is not null
        and started_at is not null
        and completed_at>=started_at
    )::numeric,1)
  into
    v_agent_runs,v_agent_succeeded,v_agent_failed,v_agent_running,
    v_latest_agent_start,v_latest_agent_complete,v_p95_agent_ms
  from public.agent_runs
  where agent_type='owner_anomaly_detection'
    and started_at>=v_plan.applied_at;

  v_receipt_gap := greatest(v_cron_succeeded-v_agent_runs,0);

  if v_latest_cron_end is not null then
    v_latest_success_age := round((extract(epoch from (v_now-v_latest_cron_end))/60.0)::numeric,2);
  end if;

  if v_plan.rolled_back_at is not null then
    v_state := 'ROLLED_BACK';
  elsif v_jobid is null or not coalesce(v_active,false) then
    v_state := 'TARGET_INACTIVE_ROLLBACK_RECOMMENDED';
    v_rollback_recommended := true;
  elsif v_live_schedule <> v_plan.governed_schedule then
    v_state := 'SCHEDULE_DRIFT_ROLLBACK_RECOMMENDED';
    v_rollback_recommended := true;
  elsif v_cron_failed>0 or v_agent_failed>0 then
    v_state := 'TARGET_FAILURE_ROLLBACK_RECOMMENDED';
    v_rollback_recommended := true;
  elsif v_cron_succeeded=0 then
    v_state := 'WAITING_FOR_FIRST_GOVERNED_RUN';
  elsif v_receipt_gap>0 and coalesce(v_latest_success_age,0)>5 then
    v_state := 'BUSINESS_RECEIPT_GAP_REVIEW';
  elsif v_cron_succeeded<2 or v_agent_succeeded<2 or v_minutes_since_apply<45 then
    v_state := 'FIRST_RUN_HEALTHY_OBSERVING';
  else
    v_state := 'POST_SHIFT_HEALTHY';
    v_next_plan_review_eligible := true;
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','v152-post-shift-observer-db-v1',
    'generated_at',v_now,
    'state',v_state,
    'plan',jsonb_build_object(
      'plan_id',v_plan.plan_id,
      'jobid',v_plan.jobid,
      'jobname',v_plan.jobname,
      'previous_schedule',v_plan.previous_schedule,
      'governed_schedule',v_plan.governed_schedule,
      'live_schedule',v_live_schedule,
      'active',v_active,
      'applied_at',v_plan.applied_at,
      'rolled_back_at',v_plan.rolled_back_at,
      'minutes_since_apply',v_minutes_since_apply,
      'rollback_file','supabase/recovery/v1511-controlled-anomaly-shift-rollback.sql'
    ),
    'post_change',jsonb_build_object(
      'cron_runs',v_cron_runs,
      'cron_succeeded',v_cron_succeeded,
      'cron_failed',v_cron_failed,
      'cron_running',v_cron_running,
      'latest_cron_start',v_latest_cron_start,
      'latest_cron_end',v_latest_cron_end,
      'business_receipts',v_agent_runs,
      'business_succeeded',v_agent_succeeded,
      'business_failed',v_agent_failed,
      'business_running',v_agent_running,
      'business_receipt_gap',v_receipt_gap,
      'latest_business_started_at',v_latest_agent_start,
      'latest_business_completed_at',v_latest_agent_complete,
      'p95_business_receipt_ms',v_p95_agent_ms
    ),
    'baseline',jsonb_build_object(
      'pre_v1461_state',v_plan.pre_v1461_state,
      'pre_v1461_observation_minutes',v_plan.pre_v1461_observation_minutes,
      'pre_peak_concurrent',v_plan.pre_peak_concurrent,
      'pre_peak_starts_per_minute',v_plan.pre_peak_starts_per_minute,
      'pre_failures_60m',v_plan.pre_failures_60m,
      'receipt_evidence',v_plan.receipt_evidence
    ),
    'system',jsonb_build_object(
      'v1461_state',v_v1461->>'state',
      'v1461_failures_since_apply',v_v1461->'since_apply'->'failures',
      'v147_state',v_v147->>'state',
      'v147_pressure_score',v_v147->'pressure_score',
      'v147_failures_60m',v_v147->'cron_pressure'->'failures_60m',
      'v147_peak_concurrent_60m',v_v147->'cron_pressure'->'peak_concurrent_60m'
    ),
    'success_gate',jsonb_build_object(
      'minimum_observation_minutes',45,
      'minimum_successful_governed_runs',2,
      'minimum_successful_business_receipts',2,
      'zero_target_cron_failures',v_cron_failed=0,
      'zero_business_receipt_failures',v_agent_failed=0,
      'zero_schedule_drift',v_live_schedule=v_plan.governed_schedule,
      'receipt_gap_zero',v_receipt_gap=0,
      'rollback_recommended',v_rollback_recommended,
      'next_plan_review_eligible',v_next_plan_review_eligible
    ),
    'governance',jsonb_build_object(
      'action_permitted','WAIT',
      'capital_permission','0R',
      'live_order_routing',false,
      'automatic_rollback',false,
      'automatic_rescheduling',false,
      'automatic_policy_promotion',false,
      'second_scheduler_mutation_automatic',false
    ),
    'truth_label','POST_SHIFT_OBSERVER_NOT_TRADING_PERMISSION'
  );
end;
$function$;

revoke all on function public.get_v152_post_shift_observer() from public;
revoke all on function public.get_v152_post_shift_observer() from anon;
revoke all on function public.get_v152_post_shift_observer() from authenticated;
grant execute on function public.get_v152_post_shift_observer() to service_role;
