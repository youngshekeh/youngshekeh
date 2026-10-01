-- V161.1 Scheduler Experiment Registry Performance Hotfix
-- Canonical read-only registry for controlled scheduler experiments.
-- Deliberately avoids recursive calls into V159/V160 to keep the private runtime bounded.

create or replace function public.get_v161_scheduler_experiment_registry()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','cron','pg_catalog','pg_temp'
as $function$
declare
  v_now timestamptz := now();
  v_v152 jsonb := '{}'::jsonb;
  v_v158 jsonb := '{}'::jsonb;
  v_registry jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_accepted integer := 0;
  v_observing integer := 0;
  v_rollback_recommended integer := 0;
  v_violations integer := 0;
  v_latest_id text;
  v_latest_state text;
  v_chain_state text := 'EMPTY';
  v_alter_job_available boolean := false;
begin
  begin
    v_v152 := public.get_v152_post_shift_observer();
  exception when others then
    v_v152 := jsonb_build_object('ok',false,'state','UNAVAILABLE');
  end;

  begin
    v_v158 := public.get_v158_member_alert_post_shift_observer();
  exception when others then
    v_v158 := jsonb_build_object('ok',false,'state','UNAVAILABLE');
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

  with experiments as (
    select
      1::int as sequence_no,
      'V1511_OWNER_ANOMALY_SHIFT_001'::text as experiment_id,
      l.plan_id,
      l.jobid,
      l.jobname,
      l.previous_schedule,
      l.governed_schedule,
      l.applied_at,
      l.rolled_back_at,
      l.receipt_evidence,
      'BOOTSTRAP_CONTROLLED_APPLY'::text as admission_basis,
      jsonb_build_object(
        'state',v_v152->>'state',
        'accepted',coalesce((v_v152->'success_gate'->>'next_plan_review_eligible')::boolean,false),
        'rollback_recommended',coalesce((v_v152->'success_gate'->>'rollback_recommended')::boolean,false),
        'cron_succeeded',coalesce((v_v152->'post_change'->>'cron_succeeded')::integer,0),
        'business_succeeded',coalesce((v_v152->'post_change'->>'business_succeeded')::integer,0)
      ) as observer,
      null::jsonb as admission_snapshot,
      'supabase/recovery/v1511-controlled-anomaly-shift-rollback.sql'::text as rollback_file
    from private.v1511_controlled_shift_ledger l
    where l.plan_id='V1511_OWNER_ANOMALY_SHIFT_001'

    union all

    select
      2,
      'V157_MEMBER_ALERT_SHIFT_001',
      l.plan_id,
      l.jobid,
      l.jobname,
      l.previous_schedule,
      l.governed_schedule,
      l.applied_at,
      l.rolled_back_at,
      l.receipt_evidence,
      'V153_6_OF_6_HUMAN_REVIEW_ADMISSION',
      jsonb_build_object(
        'state',v_v158->>'state',
        'accepted',coalesce((v_v158->'success_gate'->>'next_plan_review_eligible')::boolean,false),
        'rollback_recommended',coalesce((v_v158->'success_gate'->>'rollback_recommended')::boolean,false),
        'cron_succeeded',coalesce((v_v158->'post_change'->>'cron_succeeded')::integer,0),
        'business_succeeded',coalesce((v_v158->'post_change'->>'business_succeeded')::integer,0)
      ),
      l.admission_evidence,
      'supabase/recovery/v157-controlled-member-alert-shift-rollback.sql'
    from private.v157_controlled_shift_ledger l
    where l.plan_id='V157_MEMBER_ALERT_SHIFT_001'
  ),
  enriched as (
    select
      e.*,
      j.schedule as live_schedule,
      j.active as live_active,
      case
        when e.rolled_back_at is null
          then coalesce(j.active,false) and j.schedule=e.governed_schedule
        else j.schedule=e.previous_schedule
      end as schedule_consistent,
      coalesce((e.observer->>'accepted')::boolean,false) as accepted_now,
      coalesce((e.observer->>'rollback_recommended')::boolean,false) as rollback_recommended_now,
      case
        when e.rolled_back_at is not null then 'ROLLED_BACK'
        when coalesce((e.observer->>'rollback_recommended')::boolean,false) then 'ROLLBACK_REVIEW'
        when coalesce((e.observer->>'accepted')::boolean,false) then 'ACCEPTED'
        else 'OBSERVING'
      end as lifecycle_state,
      case
        when e.sequence_no=1 then true
        when e.sequence_no=2 then
          coalesce((e.admission_snapshot->'admission'->>'admitted')::boolean,false)
          and coalesce(e.admission_snapshot->>'state','')='READY_FOR_NEXT_HUMAN_REVIEW'
          and coalesce(e.admission_snapshot->'previous_shift'->>'state','')='POST_SHIFT_HEALTHY'
        else false
      end as prior_acceptance_verified,
      coalesce((e.receipt_evidence->>'protected_business')::boolean,true) as protected_business,
      (
        e.rollback_file is not null
        and e.previous_schedule is not null
        and e.governed_schedule is not null
        and e.previous_schedule<>e.governed_schedule
        and v_alter_job_available
        and (
          (e.rolled_back_at is null and coalesce(j.active,false) and j.schedule=e.governed_schedule)
          or
          (e.rolled_back_at is not null and j.schedule=e.previous_schedule)
        )
      ) as rollback_rehearsal_ready
    from experiments e
    left join cron.job j on j.jobid=e.jobid
  ),
  final as (
    select
      *,
      (
        schedule_consistent
        and prior_acceptance_verified
        and not protected_business
        and rollback_rehearsal_ready
      ) as chain_compliant
    from enriched
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'sequence',sequence_no,
      'experiment_id',experiment_id,
      'plan_id',plan_id,
      'jobid',jobid,
      'jobname',jobname,
      'previous_schedule',previous_schedule,
      'governed_schedule',governed_schedule,
      'live_schedule',live_schedule,
      'live_active',live_active,
      'applied_at',applied_at,
      'rolled_back_at',rolled_back_at,
      'lifecycle_state',lifecycle_state,
      'accepted_now',accepted_now,
      'rollback_recommended',rollback_recommended_now,
      'schedule_consistent',schedule_consistent,
      'prior_acceptance_verified',prior_acceptance_verified,
      'protected_business',protected_business,
      'chain_compliant',chain_compliant,
      'admission_basis',admission_basis,
      'observer',observer,
      'rollback_rehearsal',jsonb_build_object(
        'ready',rollback_rehearsal_ready,
        'rollback_file',rollback_file,
        'primitive_available',v_alter_job_available,
        'mode','DIRECT_LEDGER_REHEARSAL'
      )
    ) order by sequence_no),'[]'::jsonb),
    count(*)::int,
    count(*) filter(where lifecycle_state='ACCEPTED')::int,
    count(*) filter(where lifecycle_state='OBSERVING')::int,
    count(*) filter(where rollback_recommended_now)::int,
    count(*) filter(where not chain_compliant)::int,
    (array_agg(experiment_id order by sequence_no desc))[1],
    (array_agg(lifecycle_state order by sequence_no desc))[1]
  into
    v_registry,v_total,v_accepted,v_observing,v_rollback_recommended,
    v_violations,v_latest_id,v_latest_state
  from final;

  if v_total=0 then
    v_chain_state := 'EMPTY';
  elsif v_violations>0 then
    v_chain_state := 'CHAIN_INTEGRITY_VIOLATION';
  elsif v_rollback_recommended>0 then
    v_chain_state := 'CHAIN_HEALTHY_ROLLBACK_REVIEW_ACTIVE';
  elsif v_latest_state='ACCEPTED' then
    v_chain_state := 'CHAIN_HEALTHY_LATEST_ACCEPTED';
  else
    v_chain_state := 'CHAIN_HEALTHY_LATEST_OBSERVING';
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','v161.1-scheduler-experiment-registry-db-v2-bounded',
    'generated_at',v_now,
    'state',v_chain_state,
    'summary',jsonb_build_object(
      'experiments_total',v_total,
      'accepted',v_accepted,
      'observing',v_observing,
      'rollback_recommended',v_rollback_recommended,
      'chain_integrity_violations',v_violations,
      'latest_experiment',v_latest_id,
      'latest_lifecycle_state',v_latest_state
    ),
    'experiments',v_registry,
    'authoritative_admission',jsonb_build_object(
      'engine','V159',
      'source','/api/latest-experiment-admission',
      'state','SEPARATE_AUTHORITATIVE_SURFACE',
      'registry_does_not_evaluate_admission',true
    ),
    'runtime_budget',jsonb_build_object(
      'recursive_v159_calls',0,
      'recursive_v160_calls',0,
      'observer_calls',2,
      'bounded_registry',true
    ),
    'chain_rules',jsonb_build_object(
      'previous_experiment_must_be_accepted_before_next_apply',true,
      'protected_business_excluded',true,
      'live_schedule_must_match_ledger_state',true,
      'rollback_path_must_remain_rehearsable',true,
      'one_unaccepted_experiment_max',true
    ),
    'governance',jsonb_build_object(
      'action_permitted','WAIT',
      'capital_permission','0R',
      'live_order_routing',false,
      'automatic_rescheduling',false,
      'automatic_rollback',false,
      'automatic_policy_promotion',false,
      'registry_can_unlock_capital',false
    ),
    'truth_label','BOUNDED_SCHEDULER_EXPERIMENT_REGISTRY_NOT_TRADING_PERMISSION'
  );
end;
$function$;

revoke all on function public.get_v161_scheduler_experiment_registry() from public;
revoke all on function public.get_v161_scheduler_experiment_registry() from anon;
revoke all on function public.get_v161_scheduler_experiment_registry() from authenticated;
grant execute on function public.get_v161_scheduler_experiment_registry() to service_role;
