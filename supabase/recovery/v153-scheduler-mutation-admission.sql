-- V153 Scheduler Mutation Admission Governor
-- Central admission gate for any scheduler mutation after V151.1.
-- Read-only. It never alters cron, pools, execution, or capital permission.

create or replace function public.get_v153_scheduler_mutation_admission()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','cron','pg_catalog','pg_temp'
as $function$
declare
  v_now timestamptz := now();
  v_v1461 jsonb := '{}'::jsonb;
  v_v147 jsonb := '{}'::jsonb;
  v_v151 jsonb := '{}'::jsonb;
  v_v152 jsonb := '{}'::jsonb;

  v_qa_state text;
  v_qa_failed integer := 0;
  v_qa_total integer := 0;
  v_qa_checked_at timestamptz;
  v_qa_age_minutes numeric;
  v_qa_fresh boolean := false;
  v_qa_pass boolean := false;

  v_last_apply timestamptz;
  v_minutes_since_last_mutation numeric;
  v_cooldown_pass boolean := false;
  v_previous_shift_healthy boolean := false;
  v_connection_pass boolean := false;
  v_v1461_pass boolean := false;
  v_candidate_present boolean := false;
  v_exact_schedule_match boolean := false;
  v_state text := 'LOCKED';
  v_reasons jsonb := '[]'::jsonb;
  v_gate_count integer := 0;
  v_gate_passed integer := 0;
begin
  begin v_v1461 := public.get_v1461_peak_spreader_status();
  exception when others then v_v1461 := jsonb_build_object('ok',false,'state','UNAVAILABLE'); end;

  begin v_v147 := public.get_v147_connection_pressure_shadow();
  exception when others then v_v147 := jsonb_build_object('ok',false,'state','UNAVAILABLE'); end;

  begin v_v151 := public.get_v151_single_candidate_plan_shadow();
  exception when others then v_v151 := jsonb_build_object('ok',false,'state','UNAVAILABLE'); end;

  begin v_v152 := public.get_v152_post_shift_observer();
  exception when others then v_v152 := jsonb_build_object('ok',false,'state','UNAVAILABLE'); end;

  select state,failed,total,checked_at
  into v_qa_state,v_qa_failed,v_qa_total,v_qa_checked_at
  from public.autonomous_qa_runs
  order by checked_at desc
  limit 1;

  if v_qa_checked_at is not null then
    v_qa_age_minutes := round((extract(epoch from (v_now-v_qa_checked_at))/60.0)::numeric,2);
  end if;

  v_qa_fresh := v_qa_checked_at is not null and v_qa_checked_at >= v_now-interval '45 minutes';
  v_qa_pass := coalesce(v_qa_state,'')='PASS'
    and coalesce(v_qa_failed,999)=0
    and coalesce(v_qa_total,0)>=64
    and v_qa_fresh;

  select applied_at
  into v_last_apply
  from private.v1511_controlled_shift_ledger
  where rolled_back_at is null
  order by applied_at desc
  limit 1;

  if v_last_apply is not null then
    v_minutes_since_last_mutation := round((extract(epoch from (v_now-v_last_apply))/60.0)::numeric,2);
  end if;

  v_cooldown_pass := v_last_apply is null or coalesce(v_minutes_since_last_mutation,0)>=45;

  v_previous_shift_healthy :=
    coalesce(v_v152->>'state','')='POST_SHIFT_HEALTHY'
    and coalesce((v_v152->'success_gate'->>'next_plan_review_eligible')::boolean,false)
    and not coalesce((v_v152->'success_gate'->>'rollback_recommended')::boolean,true)
    and coalesce((v_v152->'post_change'->>'cron_failed')::integer,999)=0
    and coalesce((v_v152->'post_change'->>'business_failed')::integer,999)=0
    and coalesce((v_v152->'post_change'->>'business_receipt_gap')::integer,999)=0;

  v_connection_pass :=
    coalesce(v_v147->>'state','')='NORMAL'
    and coalesce((v_v147->'cron_pressure'->>'failures_60m')::integer,999)=0
    and coalesce((v_v147->'connections'->>'lock_waits')::integer,999)=0
    and coalesce((v_v147->'connections'->>'long_transactions_over_30s')::integer,999)=0;

  v_v1461_pass :=
    coalesce(v_v1461->>'state','')='PEAK_SPREAD_IMPROVED'
    and coalesce((v_v1461->'since_apply'->>'failures')::integer,999)=0
    and coalesce((v_v1461->'plan'->>'schedule_drift_jobs')::integer,999)=0;

  v_candidate_present := coalesce(v_v151->'plan'->>'jobname','')<>'';

  if v_candidate_present then
    select exists(
      select 1
      from cron.job j
      where j.jobname=v_v151->'plan'->>'jobname'
        and j.active
        and j.schedule=v_v151->'plan'->>'current_schedule'
    )
    into v_exact_schedule_match;
  end if;

  v_gate_count := 6;
  v_gate_passed :=
    (case when v_previous_shift_healthy then 1 else 0 end)
    +(case when v_cooldown_pass then 1 else 0 end)
    +(case when v_qa_pass then 1 else 0 end)
    +(case when v_connection_pass then 1 else 0 end)
    +(case when v_v1461_pass then 1 else 0 end)
    +(case when v_candidate_present and v_exact_schedule_match then 1 else 0 end);

  if not v_previous_shift_healthy then
    v_reasons := v_reasons || jsonb_build_array('PREVIOUS_SHIFT_NOT_YET_POST_SHIFT_HEALTHY');
  end if;
  if not v_cooldown_pass then
    v_reasons := v_reasons || jsonb_build_array('MUTATION_COOLDOWN_NOT_MATURE');
  end if;
  if not v_qa_pass then
    if not v_qa_fresh then
      v_reasons := v_reasons || jsonb_build_array('LATEST_AUTONOMOUS_QA_STALE');
    else
      v_reasons := v_reasons || jsonb_build_array('LATEST_AUTONOMOUS_QA_NOT_PASS');
    end if;
  end if;
  if not v_connection_pass then
    v_reasons := v_reasons || jsonb_build_array('CONNECTION_OR_CRON_PRESSURE_NOT_NORMAL');
  end if;
  if not v_v1461_pass then
    v_reasons := v_reasons || jsonb_build_array('V1461_BASELINE_EXPERIMENT_REGRESSION');
  end if;
  if not v_candidate_present then
    v_reasons := v_reasons || jsonb_build_array('NO_NEXT_SINGLE_CANDIDATE');
  elsif not v_exact_schedule_match then
    v_reasons := v_reasons || jsonb_build_array('NEXT_CANDIDATE_SCHEDULE_DRIFT');
  end if;

  if v_gate_passed=v_gate_count then
    v_state := 'READY_FOR_NEXT_HUMAN_REVIEW';
  elsif not v_previous_shift_healthy then
    v_state := 'LOCKED_PREVIOUS_SHIFT_OBSERVATION';
  elsif not v_cooldown_pass then
    v_state := 'LOCKED_MUTATION_COOLDOWN';
  elsif not v_qa_pass then
    v_state := case when v_qa_fresh then 'LOCKED_QA_FAILURE' else 'LOCKED_QA_STALE' end;
  elsif not v_connection_pass then
    v_state := 'LOCKED_INFRASTRUCTURE_PRESSURE';
  elsif not v_v1461_pass then
    v_state := 'LOCKED_BASELINE_REGRESSION';
  elsif not v_candidate_present then
    v_state := 'LOCKED_NO_NEXT_CANDIDATE';
  else
    v_state := 'LOCKED_CANDIDATE_DRIFT';
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','v153-scheduler-mutation-admission-db-v1',
    'generated_at',v_now,
    'state',v_state,
    'admission',jsonb_build_object(
      'gate_count',v_gate_count,
      'gates_passed',v_gate_passed,
      'admitted',v_gate_passed=v_gate_count,
      'block_reasons',v_reasons,
      'minimum_minutes_between_mutations',45,
      'one_active_scheduler_experiment_max',true
    ),
    'gates',jsonb_build_object(
      'previous_shift_healthy',v_previous_shift_healthy,
      'cooldown_mature',v_cooldown_pass,
      'qa_fresh_pass',v_qa_pass,
      'infrastructure_normal',v_connection_pass,
      'v1461_still_improved',v_v1461_pass,
      'candidate_exact_schedule_match',v_candidate_present and v_exact_schedule_match
    ),
    'previous_shift',jsonb_build_object(
      'state',v_v152->>'state',
      'minutes_since_apply',v_v152->'plan'->'minutes_since_apply',
      'cron_succeeded',v_v152->'post_change'->'cron_succeeded',
      'business_succeeded',v_v152->'post_change'->'business_succeeded',
      'cron_failed',v_v152->'post_change'->'cron_failed',
      'business_failed',v_v152->'post_change'->'business_failed',
      'receipt_gap',v_v152->'post_change'->'business_receipt_gap',
      'rollback_recommended',v_v152->'success_gate'->'rollback_recommended',
      'next_plan_review_eligible',v_v152->'success_gate'->'next_plan_review_eligible'
    ),
    'cooldown',jsonb_build_object(
      'last_mutation_at',v_last_apply,
      'minutes_since_last_mutation',v_minutes_since_last_mutation,
      'minimum_minutes',45,
      'mature',v_cooldown_pass
    ),
    'qa',jsonb_build_object(
      'state',v_qa_state,
      'failed',v_qa_failed,
      'total',v_qa_total,
      'checked_at',v_qa_checked_at,
      'age_minutes',v_qa_age_minutes,
      'freshness_limit_minutes',45,
      'fresh_pass',v_qa_pass
    ),
    'infrastructure',jsonb_build_object(
      'v147_state',v_v147->>'state',
      'v147_pressure_score',v_v147->'pressure_score',
      'v147_failures_60m',v_v147->'cron_pressure'->'failures_60m',
      'v147_lock_waits',v_v147->'connections'->'lock_waits',
      'v147_long_transactions',v_v147->'connections'->'long_transactions_over_30s',
      'v1461_state',v_v1461->>'state',
      'v1461_failures_since_apply',v_v1461->'since_apply'->'failures',
      'v1461_schedule_drift_jobs',v_v1461->'plan'->'schedule_drift_jobs'
    ),
    'next_candidate',jsonb_build_object(
      'present',v_candidate_present,
      'jobname',v_v151->'plan'->>'jobname',
      'current_schedule',v_v151->'plan'->>'current_schedule',
      'recommended_schedule',v_v151->'plan'->>'recommended_schedule',
      'rollback_schedule',v_v151->'plan'->>'rollback_schedule',
      'estimated_relief_index',v_v151->'plan'->'estimated_relief_index',
      'exact_schedule_match',v_exact_schedule_match,
      'planner_state',v_v151->>'state'
    ),
    'governance',jsonb_build_object(
      'action_permitted','WAIT',
      'capital_permission','0R',
      'live_order_routing',false,
      'automatic_rescheduling',false,
      'automatic_rollback',false,
      'automatic_policy_promotion',false,
      'human_review_required',true,
      'admission_governor_can_unlock_capital',false
    ),
    'truth_label','SCHEDULER_MUTATION_ADMISSION_NOT_TRADING_PERMISSION'
  );
end;
$function$;

revoke all on function public.get_v153_scheduler_mutation_admission() from public;
revoke all on function public.get_v153_scheduler_mutation_admission() from anon;
revoke all on function public.get_v153_scheduler_mutation_admission() from authenticated;
grant execute on function public.get_v153_scheduler_mutation_admission() to service_role;
