-- V160 Latest-Mutation Rollback Rehearsal
-- Tracks the newest controlled scheduler experiment and continuously proves its exact rollback contract.
-- Read-only. It never executes cron.alter_job.

create or replace function public.get_v160_latest_rollback_rehearsal()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','cron','pg_catalog','pg_temp'
as $function$
declare
  v_now timestamptz := now();

  v_experiment text;
  v_plan_id text;
  v_jobid bigint;
  v_jobname text;
  v_previous_schedule text;
  v_governed_schedule text;
  v_applied_at timestamptz;
  v_rolled_back_at timestamptz;
  v_latest_event text;
  v_latest_event_at timestamptz;
  v_rollback_file text;

  v_live_jobid bigint;
  v_live_jobname text;
  v_live_schedule text;
  v_live_active boolean := false;

  v_observer jsonb := '{}'::jsonb;
  v_v159 jsonb := '{}'::jsonb;
  v_observer_state text;
  v_rollback_recommended boolean := false;

  v_alter_job_available boolean := false;
  v_identity_match boolean := false;
  v_schedule_consistent boolean := false;
  v_rehearsal_ready boolean := false;
  v_state text := 'NO_CONTROLLED_EXPERIMENT';
  v_blockers jsonb := '[]'::jsonb;
begin
  with ledgers as (
    select
      'V1511_OWNER_ANOMALY_SHIFT_001'::text as experiment,
      plan_id,jobid,jobname,previous_schedule,governed_schedule,
      applied_at,rolled_back_at,
      'supabase/recovery/v1511-controlled-anomaly-shift-rollback.sql'::text as rollback_file
    from private.v1511_controlled_shift_ledger
    where plan_id='V1511_OWNER_ANOMALY_SHIFT_001'

    union all

    select
      'V157_MEMBER_ALERT_SHIFT_001',
      plan_id,jobid,jobname,previous_schedule,governed_schedule,
      applied_at,rolled_back_at,
      'supabase/recovery/v157-controlled-member-alert-shift-rollback.sql'
    from private.v157_controlled_shift_ledger
    where plan_id='V157_MEMBER_ALERT_SHIFT_001'
  )
  select
    experiment,plan_id,jobid,jobname,previous_schedule,governed_schedule,
    applied_at,rolled_back_at,
    case when rolled_back_at is not null and rolled_back_at>=applied_at then 'ROLLBACK' else 'APPLY' end,
    greatest(applied_at,coalesce(rolled_back_at,applied_at)),
    rollback_file
  into
    v_experiment,v_plan_id,v_jobid,v_jobname,v_previous_schedule,v_governed_schedule,
    v_applied_at,v_rolled_back_at,v_latest_event,v_latest_event_at,v_rollback_file
  from ledgers
  order by greatest(applied_at,coalesce(rolled_back_at,applied_at)) desc
  limit 1;

  if v_plan_id is null then
    return jsonb_build_object(
      'ok',true,
      'version','v160-latest-rollback-rehearsal-db-v1',
      'generated_at',v_now,
      'state','NO_CONTROLLED_EXPERIMENT',
      'rehearsal',jsonb_build_object('ready',false,'rollback_recommended',false,'blockers',jsonb_build_array('NO_CONTROLLED_EXPERIMENT')),
      'governance',jsonb_build_object(
        'action_permitted','WAIT',
        'capital_permission','0R',
        'live_order_routing',false,
        'automatic_rollback',false,
        'automatic_rescheduling',false
      ),
      'truth_label','LATEST_ROLLBACK_REHEARSAL_NOT_ROLLBACK_PERMISSION'
    );
  end if;

  if v_experiment='V157_MEMBER_ALERT_SHIFT_001' then
    begin v_observer := public.get_v158_member_alert_post_shift_observer();
    exception when others then v_observer := jsonb_build_object('ok',false,'state','UNAVAILABLE'); end;
  else
    begin v_observer := public.get_v152_post_shift_observer();
    exception when others then v_observer := jsonb_build_object('ok',false,'state','UNAVAILABLE'); end;
  end if;

  begin v_v159 := public.get_v159_latest_experiment_admission();
  exception when others then v_v159 := jsonb_build_object('ok',false,'state','UNAVAILABLE'); end;

  v_observer_state := coalesce(v_observer->>'state','UNAVAILABLE');
  v_rollback_recommended := coalesce((v_observer->'success_gate'->>'rollback_recommended')::boolean,false);

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

  select j.jobid,j.jobname,j.schedule,j.active
  into v_live_jobid,v_live_jobname,v_live_schedule,v_live_active
  from cron.job j
  where j.jobid=v_jobid;

  v_identity_match :=
    v_live_jobid=v_jobid
    and v_live_jobname=v_jobname;

  v_schedule_consistent :=
    case
      when v_rolled_back_at is null
        then v_identity_match and coalesce(v_live_active,false) and v_live_schedule=v_governed_schedule
      else
        v_identity_match and v_live_schedule=v_previous_schedule
    end;

  v_rehearsal_ready :=
    v_identity_match
    and v_schedule_consistent
    and v_previous_schedule is not null
    and v_governed_schedule is not null
    and v_previous_schedule<>v_governed_schedule
    and v_alter_job_available
    and v_rollback_file is not null;

  if not v_identity_match then
    v_blockers := v_blockers || jsonb_build_array('TARGET_IDENTITY_MISMATCH');
  end if;
  if not v_schedule_consistent then
    v_blockers := v_blockers || jsonb_build_array('LIVE_SCHEDULE_DOES_NOT_MATCH_LEDGER_STATE');
  end if;
  if v_previous_schedule is null or v_governed_schedule is null or v_previous_schedule=v_governed_schedule then
    v_blockers := v_blockers || jsonb_build_array('ROLLBACK_SCHEDULE_NOT_DISTINCT');
  end if;
  if not v_alter_job_available then
    v_blockers := v_blockers || jsonb_build_array('CRON_ALTER_JOB_PRIMITIVE_UNAVAILABLE');
  end if;
  if v_rollback_file is null then
    v_blockers := v_blockers || jsonb_build_array('ROLLBACK_FILE_MISSING');
  end if;

  if v_rehearsal_ready and v_latest_event='ROLLBACK' then
    v_state := 'LATEST_ROLLBACK_ALREADY_COMPLETED_AND_CONSISTENT';
  elsif v_rehearsal_ready and v_rollback_recommended then
    v_state := 'LATEST_ROLLBACK_RECOMMENDED_AND_REHEARSED';
  elsif v_rehearsal_ready then
    v_state := 'LATEST_ROLLBACK_REHEARSAL_READY';
  else
    v_state := 'LATEST_ROLLBACK_REHEARSAL_BLOCKED';
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','v160-latest-rollback-rehearsal-db-v1',
    'generated_at',v_now,
    'state',v_state,
    'latest_experiment',jsonb_build_object(
      'experiment',v_experiment,
      'plan_id',v_plan_id,
      'event',v_latest_event,
      'event_at',v_latest_event_at,
      'applied_at',v_applied_at,
      'rolled_back_at',v_rolled_back_at,
      'observer_state',v_observer_state
    ),
    'target',jsonb_build_object(
      'jobid',v_jobid,
      'jobname',v_jobname,
      'active',v_live_active,
      'live_schedule',v_live_schedule,
      'governed_schedule',v_governed_schedule,
      'previous_schedule',v_previous_schedule,
      'identity_match',v_identity_match,
      'ledger_state_consistent',v_schedule_consistent
    ),
    'rehearsal',jsonb_build_object(
      'ready',v_rehearsal_ready,
      'rollback_recommended',v_rollback_recommended,
      'blockers',v_blockers,
      'rollback_file',v_rollback_file,
      'rollback_primitive','cron.alter_job(bigint,text,text,text,text,boolean)',
      'rollback_primitive_available',v_alter_job_available
    ),
    'simulated_rollback',jsonb_build_object(
      'would_change_schedule',v_latest_event='APPLY' and v_schedule_consistent,
      'from_schedule',v_live_schedule,
      'to_schedule',case when v_latest_event='APPLY' then v_previous_schedule else v_live_schedule end,
      'expected_after_schedule',v_previous_schedule,
      'unknown_drift_refused',true,
      'idempotence_rule','ONLY_GOVERNED_OR_ALREADY_ROLLED_BACK_SCHEDULES_ACCEPTED'
    ),
    'admission_context',jsonb_build_object(
      'v159_state',v_v159->>'state',
      'v159_admitted',v_v159->'admission'->'admitted',
      'v159_latest_experiment',v_v159->'latest_mutation'->'experiment'
    ),
    'governance',jsonb_build_object(
      'action_permitted','WAIT',
      'capital_permission','0R',
      'live_order_routing',false,
      'automatic_rollback',false,
      'automatic_rescheduling',false,
      'automatic_policy_promotion',false,
      'human_review_required_for_rollback',true,
      'rollback_rehearsal_can_unlock_capital',false
    ),
    'truth_label','LATEST_ROLLBACK_REHEARSAL_NOT_ROLLBACK_PERMISSION'
  );
end;
$function$;

revoke all on function public.get_v160_latest_rollback_rehearsal() from public;
revoke all on function public.get_v160_latest_rollback_rehearsal() from anon;
revoke all on function public.get_v160_latest_rollback_rehearsal() from authenticated;
grant execute on function public.get_v160_latest_rollback_rehearsal() to service_role;
