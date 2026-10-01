-- V159.1 Bounded Latest-Experiment Scheduler Mutation Admission
-- Keeps the seven-gate admission policy while removing duplicate direct V146.1/V147
-- and dual-observer fan-out from the runtime path. Read-only.

create or replace function public.get_v159_latest_experiment_admission()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','cron','pg_catalog','pg_temp'
as $function$
declare
  v_now timestamptz := now();
  v_v151 jsonb := '{}'::jsonb;
  v_v156 jsonb := '{}'::jsonb;
  v_observer jsonb := '{}'::jsonb;

  v_latest_experiment text;
  v_latest_event text;
  v_latest_mutation_at timestamptz;
  v_minutes_since_latest numeric;

  v_latest_experiment_accepted boolean := false;
  v_cooldown_mature boolean := false;
  v_qa_pass boolean := false;
  v_platform_pass boolean := false;
  v_infra_pass boolean := false;
  v_baseline_pass boolean := false;
  v_candidate_present boolean := false;
  v_candidate_match boolean := false;

  v_qa_state text;
  v_qa_failed integer := 0;
  v_qa_total integer := 0;
  v_qa_checked_at timestamptz;
  v_qa_age_minutes numeric;

  v_gate_count integer := 7;
  v_gate_passed integer := 0;
  v_state text := 'LOCKED';
  v_reasons jsonb := '[]'::jsonb;
begin
  begin
    v_v156 := public.get_v156_quota_guard_recovery_shadow();
  exception when others then
    v_v156 := jsonb_build_object('ok',false,'state','UNAVAILABLE');
  end;

  begin
    v_v151 := public.get_v151_single_candidate_plan_shadow();
  exception when others then
    v_v151 := jsonb_build_object('ok',false,'state','UNAVAILABLE');
  end;

  with mutation_events as (
    select 'V1511_OWNER_ANOMALY_SHIFT_001'::text as experiment,'APPLY'::text as event,applied_at as ts
    from private.v1511_controlled_shift_ledger
    where plan_id='V1511_OWNER_ANOMALY_SHIFT_001'
    union all
    select 'V1511_OWNER_ANOMALY_SHIFT_001','ROLLBACK',rolled_back_at
    from private.v1511_controlled_shift_ledger
    where plan_id='V1511_OWNER_ANOMALY_SHIFT_001' and rolled_back_at is not null
    union all
    select 'V157_MEMBER_ALERT_SHIFT_001','APPLY',applied_at
    from private.v157_controlled_shift_ledger
    where plan_id='V157_MEMBER_ALERT_SHIFT_001'
    union all
    select 'V157_MEMBER_ALERT_SHIFT_001','ROLLBACK',rolled_back_at
    from private.v157_controlled_shift_ledger
    where plan_id='V157_MEMBER_ALERT_SHIFT_001' and rolled_back_at is not null
  )
  select experiment,event,ts
  into v_latest_experiment,v_latest_event,v_latest_mutation_at
  from mutation_events
  where ts is not null
  order by ts desc
  limit 1;

  if v_latest_mutation_at is not null then
    v_minutes_since_latest :=
      round((extract(epoch from (v_now-v_latest_mutation_at))/60.0)::numeric,2);
  end if;

  if v_latest_experiment='V157_MEMBER_ALERT_SHIFT_001' then
    begin
      v_observer := public.get_v158_member_alert_post_shift_observer();
    exception when others then
      v_observer := jsonb_build_object('ok',false,'state','UNAVAILABLE');
    end;
  elsif v_latest_experiment='V1511_OWNER_ANOMALY_SHIFT_001' then
    begin
      v_observer := public.get_v152_post_shift_observer();
    exception when others then
      v_observer := jsonb_build_object('ok',false,'state','UNAVAILABLE');
    end;
  else
    v_observer := jsonb_build_object('ok',false,'state','NO_CONTROLLED_EXPERIMENT');
  end if;

  v_latest_experiment_accepted :=
    v_latest_event='APPLY'
    and coalesce(v_observer->>'state','')='POST_SHIFT_HEALTHY'
    and coalesce((v_observer->'success_gate'->>'next_plan_review_eligible')::boolean,false)
    and not coalesce((v_observer->'success_gate'->>'rollback_recommended')::boolean,true)
    and coalesce((v_observer->'post_change'->>'cron_failed')::integer,999)=0
    and coalesce((v_observer->'post_change'->>'business_failed')::integer,999)=0
    and coalesce((v_observer->'post_change'->>'business_receipt_gap')::integer,999)=0;

  v_cooldown_mature :=
    v_latest_mutation_at is not null
    and coalesce(v_minutes_since_latest,0)>=75;

  select state,failed,total,checked_at
  into v_qa_state,v_qa_failed,v_qa_total,v_qa_checked_at
  from public.autonomous_qa_runs
  order by checked_at desc
  limit 1;

  if v_qa_checked_at is not null then
    v_qa_age_minutes :=
      round((extract(epoch from (v_now-v_qa_checked_at))/60.0)::numeric,2);
  end if;

  v_qa_pass :=
    coalesce(v_qa_state,'')='PASS'
    and coalesce(v_qa_failed,999)=0
    and coalesce(v_qa_total,0)>=64
    and v_qa_checked_at>=v_now-interval '45 minutes';

  v_platform_pass :=
    coalesce(v_v156->>'state','')='RECOVERY_CONFIRMED_RESTORED'
    and coalesce((v_v156->'quota'->>'restricted')::boolean,true) is false
    and coalesce((v_v156->'quota'->>'fresh')::boolean,false)
    and coalesce((v_v156->'guard'->>'paused_rows')::integer,999)=0
    and coalesce((v_v156->'guard'->>'mismatch_rows')::integer,999)=0
    and coalesce((v_v156->'enforcer'->>'healthy')::boolean,false);

  v_infra_pass :=
    coalesce(v_v156->'downstream'->>'v147_state','')='NORMAL'
    and coalesce((v_v156->'downstream'->>'v147_pressure_score')::numeric,999)<=40;

  v_baseline_pass :=
    coalesce(v_v156->'downstream'->>'v1461_state','')='PEAK_SPREAD_IMPROVED'
    and coalesce((v_v156->'downstream'->>'v1461_result_eligible')::boolean,false)
    and coalesce((v_v156->'downstream'->>'v1461_guard_paused_jobs')::integer,999)=0
    and coalesce((v_v156->'downstream'->>'v1461_unexpected_drift_jobs')::integer,999)=0;

  v_candidate_present := coalesce(v_v151->'plan'->>'jobname','')<>'';

  if v_candidate_present then
    select exists(
      select 1
      from cron.job j
      where j.jobname=v_v151->'plan'->>'jobname'
        and j.active
        and j.schedule=v_v151->'plan'->>'current_schedule'
    )
    into v_candidate_match;
  end if;

  v_gate_passed :=
    (case when v_latest_experiment_accepted then 1 else 0 end)
    +(case when v_cooldown_mature then 1 else 0 end)
    +(case when v_qa_pass then 1 else 0 end)
    +(case when v_platform_pass then 1 else 0 end)
    +(case when v_infra_pass then 1 else 0 end)
    +(case when v_baseline_pass then 1 else 0 end)
    +(case when v_candidate_present and v_candidate_match then 1 else 0 end);

  if not v_latest_experiment_accepted then
    if v_latest_event='ROLLBACK' then
      v_reasons := v_reasons || jsonb_build_array('LATEST_MUTATION_IS_ROLLBACK_REQUIRING_NEW_STABILITY_WINDOW');
    else
      v_reasons := v_reasons || jsonb_build_array('LATEST_SHIFT_NOT_YET_POST_SHIFT_HEALTHY');
    end if;
  end if;
  if not v_cooldown_mature then
    v_reasons := v_reasons || jsonb_build_array('LATEST_MUTATION_COOLDOWN_NOT_MATURE');
  end if;
  if not v_qa_pass then
    v_reasons := v_reasons || jsonb_build_array('LATEST_AUTONOMOUS_QA_NOT_FRESH_PASS');
  end if;
  if not v_platform_pass then
    v_reasons := v_reasons || jsonb_build_array('PLATFORM_GUARD_OR_QUOTA_NOT_CLEAR');
  end if;
  if not v_infra_pass then
    v_reasons := v_reasons || jsonb_build_array('INFRASTRUCTURE_PRESSURE_NOT_NORMAL');
  end if;
  if not v_baseline_pass then
    v_reasons := v_reasons || jsonb_build_array('V1461_BASELINE_NOT_ELIGIBLE');
  end if;
  if not v_candidate_present then
    v_reasons := v_reasons || jsonb_build_array('NO_NEXT_SINGLE_CANDIDATE');
  elsif not v_candidate_match then
    v_reasons := v_reasons || jsonb_build_array('NEXT_CANDIDATE_SCHEDULE_DRIFT');
  end if;

  if v_gate_passed=v_gate_count then
    v_state := 'READY_FOR_NEXT_HUMAN_REVIEW';
  elsif not v_latest_experiment_accepted then
    v_state := 'LOCKED_LATEST_SHIFT_OBSERVATION';
  elsif not v_cooldown_mature then
    v_state := 'LOCKED_LATEST_MUTATION_COOLDOWN';
  elsif not v_qa_pass then
    v_state := 'LOCKED_QA_FRESHNESS';
  elsif not v_platform_pass then
    v_state := 'LOCKED_PLATFORM_GUARD';
  elsif not v_infra_pass then
    v_state := 'LOCKED_INFRASTRUCTURE_PRESSURE';
  elsif not v_baseline_pass then
    v_state := 'LOCKED_BASELINE_REGRESSION';
  elsif not v_candidate_present then
    v_state := 'LOCKED_NO_NEXT_CANDIDATE';
  else
    v_state := 'LOCKED_CANDIDATE_DRIFT';
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','v159.1-latest-experiment-admission-db-v2-bounded',
    'generated_at',v_now,
    'state',v_state,
    'admission',jsonb_build_object(
      'admitted',v_gate_passed=v_gate_count,
      'gate_count',v_gate_count,
      'gates_passed',v_gate_passed,
      'block_reasons',v_reasons,
      'minimum_minutes_between_mutations',75,
      'one_unaccepted_scheduler_experiment_max',true
    ),
    'gates',jsonb_build_object(
      'latest_experiment_accepted',v_latest_experiment_accepted,
      'cooldown_mature',v_cooldown_mature,
      'qa_fresh_pass',v_qa_pass,
      'platform_clear',v_platform_pass,
      'infrastructure_normal',v_infra_pass,
      'baseline_eligible',v_baseline_pass,
      'candidate_exact_schedule_match',v_candidate_present and v_candidate_match
    ),
    'latest_mutation',jsonb_build_object(
      'experiment',v_latest_experiment,
      'event',v_latest_event,
      'at',v_latest_mutation_at,
      'minutes_since',v_minutes_since_latest,
      'observer_state',v_observer->>'state'
    ),
    'qa',jsonb_build_object(
      'state',v_qa_state,
      'failed',v_qa_failed,
      'total',v_qa_total,
      'checked_at',v_qa_checked_at,
      'age_minutes',v_qa_age_minutes,
      'freshness_limit_minutes',45
    ),
    'platform',jsonb_build_object(
      'v156_state',v_v156->>'state',
      'quota_restricted',v_v156->'quota'->'restricted',
      'quota_fresh',v_v156->'quota'->'fresh',
      'guard_paused_rows',v_v156->'guard'->'paused_rows',
      'guard_mismatch_rows',v_v156->'guard'->'mismatch_rows'
    ),
    'infrastructure',jsonb_build_object(
      'v147_state',v_v156->'downstream'->'v147_state',
      'v147_pressure_score',v_v156->'downstream'->'v147_pressure_score',
      'v1461_state',v_v156->'downstream'->'v1461_state',
      'v1461_result_eligible',v_v156->'downstream'->'v1461_result_eligible'
    ),
    'next_candidate',jsonb_build_object(
      'present',v_candidate_present,
      'jobname',v_v151->'plan'->>'jobname',
      'current_schedule',v_v151->'plan'->>'current_schedule',
      'recommended_schedule',v_v151->'plan'->>'recommended_schedule',
      'rollback_schedule',v_v151->'plan'->>'rollback_schedule',
      'estimated_relief_index',v_v151->'plan'->'estimated_relief_index',
      'exact_schedule_match',v_candidate_match,
      'planner_state',v_v151->>'state'
    ),
    'runtime_budget',jsonb_build_object(
      'v156_calls',1,
      'v151_calls',1,
      'latest_observer_calls',1,
      'direct_v147_calls',0,
      'direct_v1461_calls',0,
      'dual_observer_calls',false,
      'bounded_admission',true
    ),
    'governance',jsonb_build_object(
      'action_permitted','WAIT',
      'capital_permission','0R',
      'live_order_routing',false,
      'automatic_rescheduling',false,
      'automatic_rollback',false,
      'automatic_policy_promotion',false,
      'human_review_required',true,
      'latest_experiment_admission_can_unlock_capital',false
    ),
    'truth_label','BOUNDED_LATEST_EXPERIMENT_SCHEDULER_ADMISSION_NOT_TRADING_PERMISSION'
  );
end;
$function$;

revoke all on function public.get_v159_latest_experiment_admission() from public;
revoke all on function public.get_v159_latest_experiment_admission() from anon;
revoke all on function public.get_v159_latest_experiment_admission() from authenticated;
grant execute on function public.get_v159_latest_experiment_admission() to service_role;
