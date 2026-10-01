-- V154 Rollback Rehearsal Shadow
-- Continuously proves that the V151.1 scheduler change has an exact, auditable rollback path.
-- Read-only. It never executes the rollback.

create or replace function public.get_v154_rollback_rehearsal_shadow()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','cron','pg_catalog','pg_temp'
as $function$
declare
  v_now timestamptz := now();
  v_plan private.v1511_controlled_shift_ledger%rowtype;
  v_jobid bigint;
  v_jobname text;
  v_live_schedule text;
  v_active boolean := false;
  v_alter_job_available boolean := false;
  v_v152 jsonb := '{}'::jsonb;
  v_v153 jsonb := '{}'::jsonb;

  v_ledger_exists boolean := false;
  v_identity_match boolean := false;
  v_active_match boolean := false;
  v_governed_match boolean := false;
  v_previous_distinct boolean := false;
  v_rollback_record_consistent boolean := false;
  v_rehearsal_ready boolean := false;
  v_rollback_recommended boolean := false;
  v_state text := 'ROLLBACK_REHEARSAL_BLOCKED';
  v_blockers jsonb := '[]'::jsonb;
begin
  select *
  into v_plan
  from private.v1511_controlled_shift_ledger
  where plan_id='V1511_OWNER_ANOMALY_SHIFT_001';

  v_ledger_exists := v_plan.plan_id is not null;

  begin
    v_v152 := public.get_v152_post_shift_observer();
  exception when others then
    v_v152 := jsonb_build_object('ok',false,'state','UNAVAILABLE');
  end;

  begin
    v_v153 := public.get_v153_scheduler_mutation_admission();
  exception when others then
    v_v153 := jsonb_build_object('ok',false,'state','UNAVAILABLE');
  end;

  select exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='cron'
      and p.proname='alter_job'
      and pg_get_function_identity_arguments(p.oid)
        ='job_id bigint, schedule text, command text, database text, username text, active boolean'
  )
  into v_alter_job_available;

  if v_ledger_exists then
    select j.jobid,j.jobname,j.schedule,j.active
    into v_jobid,v_jobname,v_live_schedule,v_active
    from cron.job j
    where j.jobid=v_plan.jobid;
  end if;

  v_identity_match :=
    v_ledger_exists
    and v_jobid=v_plan.jobid
    and v_jobname=v_plan.jobname;

  v_active_match :=
    v_identity_match
    and coalesce(v_active,false);

  v_previous_distinct :=
    v_ledger_exists
    and v_plan.previous_schedule is not null
    and v_plan.governed_schedule is not null
    and v_plan.previous_schedule<>v_plan.governed_schedule;

  v_governed_match :=
    v_active_match
    and v_plan.rolled_back_at is null
    and v_live_schedule=v_plan.governed_schedule;

  v_rollback_record_consistent :=
    case
      when not v_ledger_exists then false
      when v_plan.rolled_back_at is null then v_live_schedule=v_plan.governed_schedule
      else v_live_schedule=v_plan.previous_schedule
    end;

  v_rollback_recommended :=
    coalesce((v_v152->'success_gate'->>'rollback_recommended')::boolean,false);

  v_rehearsal_ready :=
    v_ledger_exists
    and v_identity_match
    and v_active_match
    and v_previous_distinct
    and v_alter_job_available
    and v_rollback_record_consistent
    and (
      (v_plan.rolled_back_at is null and v_governed_match)
      or
      (v_plan.rolled_back_at is not null and v_live_schedule=v_plan.previous_schedule)
    );

  if not v_ledger_exists then
    v_blockers := v_blockers || jsonb_build_array('ROLLBACK_LEDGER_MISSING');
  end if;
  if v_ledger_exists and not v_identity_match then
    v_blockers := v_blockers || jsonb_build_array('TARGET_IDENTITY_MISMATCH');
  end if;
  if v_ledger_exists and not v_active_match then
    v_blockers := v_blockers || jsonb_build_array('TARGET_INACTIVE_OR_MISSING');
  end if;
  if v_ledger_exists and not v_previous_distinct then
    v_blockers := v_blockers || jsonb_build_array('ROLLBACK_SCHEDULE_NOT_DISTINCT');
  end if;
  if not v_alter_job_available then
    v_blockers := v_blockers || jsonb_build_array('CRON_ALTER_JOB_PRIMITIVE_UNAVAILABLE');
  end if;
  if v_ledger_exists and not v_rollback_record_consistent then
    v_blockers := v_blockers || jsonb_build_array('LIVE_SCHEDULE_DOES_NOT_MATCH_LEDGER_STATE');
  end if;

  if v_rehearsal_ready and v_plan.rolled_back_at is not null then
    v_state := 'ROLLBACK_ALREADY_COMPLETED_AND_CONSISTENT';
  elsif v_rehearsal_ready and v_rollback_recommended then
    v_state := 'ROLLBACK_RECOMMENDED_AND_REHEARSED';
  elsif v_rehearsal_ready then
    v_state := 'ROLLBACK_REHEARSAL_READY';
  elsif jsonb_array_length(v_blockers)>0 then
    v_state := 'ROLLBACK_REHEARSAL_BLOCKED';
  else
    v_state := 'ROLLBACK_REHEARSAL_WITHHELD';
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','v154-rollback-rehearsal-shadow-db-v1',
    'generated_at',v_now,
    'state',v_state,
    'rehearsal',jsonb_build_object(
      'ready',v_rehearsal_ready,
      'rollback_recommended',v_rollback_recommended,
      'blockers',v_blockers,
      'rollback_file','supabase/recovery/v1511-controlled-anomaly-shift-rollback.sql',
      'rollback_primitive','cron.alter_job(bigint,text,text,text,text,boolean)',
      'rollback_primitive_available',v_alter_job_available
    ),
    'target',jsonb_build_object(
      'plan_id',v_plan.plan_id,
      'jobid',v_plan.jobid,
      'jobname',v_plan.jobname,
      'active',v_active,
      'live_schedule',v_live_schedule,
      'governed_schedule',v_plan.governed_schedule,
      'previous_schedule',v_plan.previous_schedule,
      'applied_at',v_plan.applied_at,
      'rolled_back_at',v_plan.rolled_back_at,
      'identity_match',v_identity_match,
      'ledger_state_consistent',v_rollback_record_consistent
    ),
    'simulated_rollback',jsonb_build_object(
      'would_change_schedule',v_plan.rolled_back_at is null and v_live_schedule=v_plan.governed_schedule,
      'from_schedule',v_live_schedule,
      'to_schedule',case
        when v_plan.rolled_back_at is null then v_plan.previous_schedule
        else v_live_schedule
      end,
      'expected_after_schedule',v_plan.previous_schedule,
      'idempotence_rule','ONLY_GOVERNED_OR_ALREADY_ROLLED_BACK_SCHEDULES_ACCEPTED',
      'unknown_drift_refused',true
    ),
    'dependencies',jsonb_build_object(
      'v152_state',v_v152->>'state',
      'v152_rollback_recommended',v_v152->'success_gate'->'rollback_recommended',
      'v153_state',v_v153->>'state',
      'v153_admitted',v_v153->'admission'->'admitted'
    ),
    'governance',jsonb_build_object(
      'action_permitted','WAIT',
      'capital_permission','0R',
      'live_order_routing',false,
      'automatic_rollback',false,
      'automatic_rescheduling',false,
      'automatic_policy_promotion',false,
      'human_review_required_for_rollback',true,
      'rehearsal_can_unlock_capital',false
    ),
    'truth_label','ROLLBACK_REHEARSAL_SHADOW_NOT_ROLLBACK_PERMISSION'
  );
end;
$function$;

revoke all on function public.get_v154_rollback_rehearsal_shadow() from public;
revoke all on function public.get_v154_rollback_rehearsal_shadow() from anon;
revoke all on function public.get_v154_rollback_rehearsal_shadow() from authenticated;
grant execute on function public.get_v154_rollback_rehearsal_shadow() to service_role;
