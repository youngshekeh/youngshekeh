-- V157 Controlled Member-Alert Sync Shift
-- Scope: exactly one non-payment member-communications cron job.
-- Current: 50 * * * * -> Governed: 49 * * * *
-- Requires V153 admission, prior rollback rehearsal, fresh quota recovery integrity,
-- and first-party business receipt evidence. Exact rollback is provided separately.

create table if not exists private.v157_controlled_shift_ledger (
  plan_id text primary key,
  jobid bigint not null,
  jobname text not null,
  previous_schedule text not null,
  governed_schedule text not null,
  applied_at timestamptz not null,
  rolled_back_at timestamptz,
  pre_v153_state text not null,
  pre_v153_gates_passed integer not null,
  pre_v154_state text not null,
  pre_v156_state text not null,
  pre_v147_pressure_score numeric not null,
  pre_failures_60m integer not null,
  receipt_evidence jsonb not null,
  admission_evidence jsonb not null,
  recovery_evidence jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on private.v157_controlled_shift_ledger from public, anon, authenticated;

do $$
declare
  v_admission jsonb;
  v_v150 jsonb;
  v_v154 jsonb;
  v_v156 jsonb;
  v_candidate jsonb;
  v_receipt jsonb;
  v_jobid bigint;
  v_live_schedule text;
  v_target_failures integer := 0;
  v_failures_60m integer := 0;
  v_pressure numeric := 0;
  v_guard_paused boolean := false;
begin
  v_admission := public.get_v153_scheduler_mutation_admission();
  v_v150 := public.get_v150_network_sla_evidence_shadow();
  v_v154 := public.get_v154_rollback_rehearsal_shadow();
  v_v156 := public.get_v156_quota_guard_recovery_shadow();
  v_candidate := coalesce(v_admission->'next_candidate','{}'::jsonb);

  if coalesce(v_admission->>'state','') <> 'READY_FOR_NEXT_HUMAN_REVIEW'
     or coalesce((v_admission->'admission'->>'admitted')::boolean,false) is not true
     or coalesce((v_admission->'admission'->>'gates_passed')::integer,0)
        <> coalesce((v_admission->'admission'->>'gate_count')::integer,-1) then
    raise exception 'v157_admission_gate_not_ready_%',coalesce(v_admission->>'state','NULL');
  end if;

  if coalesce(v_candidate->>'jobname','') <> 'tfa-member-alert-sync'
     or coalesce(v_candidate->>'current_schedule','') <> '50 * * * *'
     or coalesce(v_candidate->>'recommended_schedule','') <> '49 * * * *'
     or coalesce(v_candidate->>'rollback_schedule','') <> '50 * * * *'
     or coalesce((v_candidate->>'exact_schedule_match')::boolean,false) is not true then
    raise exception 'v157_candidate_contract_mismatch';
  end if;

  if coalesce(v_v154->>'state','') not in ('ROLLBACK_REHEARSAL_READY','ROLLBACK_ALREADY_COMPLETED_AND_CONSISTENT')
     or coalesce((v_v154->'rehearsal'->>'ready')::boolean,false) is not true
     or coalesce((v_v154->'rehearsal'->>'rollback_recommended')::boolean,false) is true then
    raise exception 'v157_prior_rollback_rehearsal_not_clean_%',coalesce(v_v154->>'state','NULL');
  end if;

  if coalesce(v_v156->>'state','') <> 'RECOVERY_CONFIRMED_RESTORED'
     or coalesce((v_v156->'quota'->>'restricted')::boolean,true) is true
     or coalesce((v_v156->'quota'->>'fresh')::boolean,false) is not true
     or coalesce((v_v156->'guard'->>'paused_rows')::integer,999) <> 0
     or coalesce((v_v156->'guard'->>'mismatch_rows')::integer,999) <> 0
     or coalesce((v_v156->'enforcer'->>'healthy')::boolean,false) is not true then
    raise exception 'v157_quota_recovery_integrity_not_clean_%',coalesce(v_v156->>'state','NULL');
  end if;

  select j.jobid,j.schedule
  into v_jobid,v_live_schedule
  from cron.job j
  where j.jobname='tfa-member-alert-sync'
    and j.active;

  if v_jobid is null then
    raise exception 'v157_target_job_missing_or_inactive';
  end if;

  if v_live_schedule <> '50 * * * *' then
    raise exception 'v157_exact_schedule_precondition_failed_%',v_live_schedule;
  end if;

  select coalesce(g.paused_by_guard,false)
  into v_guard_paused
  from public.autonomous_cron_guard_state g
  where g.jobname='tfa-member-alert-sync';

  if coalesce(v_guard_paused,false) then
    raise exception 'v157_target_is_guard_paused';
  end if;

  select count(*)::int
  into v_target_failures
  from cron.job_run_details d
  where d.jobid=v_jobid
    and d.start_time>=now()-interval '24 hours'
    and d.status not in ('succeeded','running');

  if v_target_failures<>0 then
    raise exception 'v157_target_failures_24h_%',v_target_failures;
  end if;

  select x.value
  into v_receipt
  from jsonb_array_elements(coalesce(v_v150->'evidence','[]'::jsonb)) x
  where x.value->>'jobname'='tfa-member-alert-sync'
  limit 1;

  if v_receipt is null
     or coalesce((v_receipt->>'network_sla_cleared')::boolean,false) is not true
     or coalesce((v_receipt->>'protected_business')::boolean,true) is true
     or coalesce((v_receipt->>'receipt_coverage_pct')::numeric,0)<95
     or coalesce((v_receipt->>'receipt_success_pct')::numeric,0)<99
     or coalesce((v_receipt->>'agent_failed_24h')::integer,0)<>0
     or coalesce((v_receipt->>'cron_failures_24h')::integer,0)<>0
     or coalesce((v_receipt->>'p95_business_receipt_ms')::numeric,999999)>10000 then
    raise exception 'v157_network_receipt_gate_failed';
  end if;

  v_pressure := coalesce((v_admission->'infrastructure'->>'v147_pressure_score')::numeric,0);
  v_failures_60m := coalesce((v_admission->'infrastructure'->>'v147_failures_60m')::integer,0);

  if v_pressure>40 or v_failures_60m<>0 then
    raise exception 'v157_infrastructure_pressure_gate_failed_%_%',v_pressure,v_failures_60m;
  end if;

  if exists(
    select 1
    from private.v157_controlled_shift_ledger
    where plan_id='V157_MEMBER_ALERT_SHIFT_001'
      and rolled_back_at is null
  ) then
    raise exception 'v157_active_plan_already_exists';
  end if;

  insert into private.v157_controlled_shift_ledger(
    plan_id,jobid,jobname,previous_schedule,governed_schedule,applied_at,
    pre_v153_state,pre_v153_gates_passed,pre_v154_state,pre_v156_state,
    pre_v147_pressure_score,pre_failures_60m,
    receipt_evidence,admission_evidence,recovery_evidence
  )
  values(
    'V157_MEMBER_ALERT_SHIFT_001',
    v_jobid,
    'tfa-member-alert-sync',
    '50 * * * *',
    '49 * * * *',
    now(),
    v_admission->>'state',
    (v_admission->'admission'->>'gates_passed')::integer,
    v_v154->>'state',
    v_v156->>'state',
    v_pressure,
    v_failures_60m,
    v_receipt,
    v_admission,
    v_v156
  );

  if not exists(
    select 1
    from private.v157_controlled_shift_ledger
    where plan_id='V157_MEMBER_ALERT_SHIFT_001'
      and jobid=v_jobid
      and previous_schedule='50 * * * *'
      and governed_schedule='49 * * * *'
  ) then
    raise exception 'v157_ledger_snapshot_failed';
  end if;

  perform cron.alter_job(
    job_id := v_jobid,
    schedule := '49 * * * *'
  );
end $$;
