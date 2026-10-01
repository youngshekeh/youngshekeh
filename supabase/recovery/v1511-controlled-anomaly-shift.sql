-- V151.1 Controlled Anomaly-Watch Shift
-- PREPARED PACKAGE. Do not apply unless V151 is READY_FOR_HUMAN_CONTROLLED_APPLY.
-- Scope: exactly one operational-monitoring cron job.
-- Current: 12,42 * * * * -> Governed: 13,43 * * * *
-- Exact rollback is provided separately.

create table if not exists private.v1511_controlled_shift_ledger (
  plan_id text primary key,
  jobid bigint not null,
  jobname text not null,
  previous_schedule text not null,
  governed_schedule text not null,
  applied_at timestamptz not null,
  rolled_back_at timestamptz,
  pre_v1461_state text not null,
  pre_v1461_observation_minutes numeric not null,
  pre_peak_concurrent integer not null,
  pre_peak_starts_per_minute integer not null,
  pre_failures_60m integer not null,
  receipt_evidence jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on private.v1511_controlled_shift_ledger from public, anon, authenticated;

do $$
declare
  v_plan jsonb;
  v_v1461 jsonb;
  v_v150 jsonb;
  v_jobid bigint;
  v_live_schedule text;
  v_target_failures integer;
  v_receipt jsonb;
  v_peak_concurrent integer := 0;
  v_peak_starts integer := 0;
  v_failures_60m integer := 0;
begin
  v_plan := public.get_v151_single_candidate_plan_shadow();
  v_v1461 := public.get_v1461_peak_spreader_status();
  v_v150 := public.get_v150_network_sla_evidence_shadow();

  if coalesce(v_plan->>'state','') <> 'READY_FOR_HUMAN_CONTROLLED_APPLY' then
    raise exception 'v1511_gate_v151_not_ready_%',coalesce(v_plan->>'state','NULL');
  end if;

  if coalesce(v_plan->'plan'->>'jobname','') <> 'tfa-owner-anomaly-watch' then
    raise exception 'v1511_unexpected_candidate_%',coalesce(v_plan->'plan'->>'jobname','NULL');
  end if;

  if coalesce(v_plan->'plan'->>'current_schedule','') <> '12,42 * * * *'
     or coalesce(v_plan->'plan'->>'recommended_schedule','') <> '13,43 * * * *'
     or coalesce(v_plan->'plan'->>'rollback_schedule','') <> '12,42 * * * *' then
    raise exception 'v1511_plan_schedule_contract_mismatch';
  end if;

  if coalesce(v_v1461->>'state','') <> 'PEAK_SPREAD_IMPROVED'
     or coalesce((v_v1461->>'observation_minutes')::numeric,0) < 60
     or coalesce((v_v1461->'since_apply'->>'failures')::integer,0) <> 0
     or coalesce((v_v1461->'plan'->>'schedule_drift_jobs')::integer,0) <> 0 then
    raise exception 'v1511_v1461_maturity_or_health_gate_failed';
  end if;

  select j.jobid,j.schedule
  into v_jobid,v_live_schedule
  from cron.job j
  where j.jobname='tfa-owner-anomaly-watch'
    and j.active;

  if v_jobid is null then
    raise exception 'v1511_target_job_missing';
  end if;

  if v_live_schedule <> '12,42 * * * *' then
    raise exception 'v1511_exact_schedule_precondition_failed_%',v_live_schedule;
  end if;

  select count(*)::int
  into v_target_failures
  from cron.job_run_details d
  where d.jobid=v_jobid
    and d.start_time>=now()-interval '24 hours'
    and d.status not in ('succeeded','running');

  if v_target_failures<>0 then
    raise exception 'v1511_target_failures_24h_%',v_target_failures;
  end if;

  select x.value
  into v_receipt
  from jsonb_array_elements(coalesce(v_v150->'evidence','[]'::jsonb)) x
  where x.value->>'jobname'='tfa-owner-anomaly-watch'
  limit 1;

  if v_receipt is null
     or coalesce((v_receipt->>'network_sla_cleared')::boolean,false) is not true
     or coalesce((v_receipt->>'protected_business')::boolean,true) is true
     or coalesce((v_receipt->>'receipt_coverage_pct')::numeric,0)<95
     or coalesce((v_receipt->>'receipt_success_pct')::numeric,0)<99
     or coalesce((v_receipt->>'agent_failed_24h')::integer,0)<>0 then
    raise exception 'v1511_network_receipt_gate_failed';
  end if;

  with r as (
    select runid,start_time,coalesce(end_time,now()) as end_time,status
    from cron.job_run_details
    where start_time>=now()-interval '60 minutes'
  ),
  events as (
    select start_time as ts,1 as delta from r
    union all
    select end_time as ts,-1 as delta from r
  ),
  sweep as (
    select ts,sum(delta) over(order by ts,delta desc rows unbounded preceding) as concurrent
    from events
  ),
  mins as (
    select date_trunc('minute',start_time) as bucket,count(*)::int as starts
    from r group by 1
  )
  select
    coalesce((select max(concurrent) from sweep),0)::int,
    coalesce((select max(starts) from mins),0)::int,
    count(*) filter(where status not in ('succeeded','running'))::int
  into v_peak_concurrent,v_peak_starts,v_failures_60m
  from r;

  insert into private.v1511_controlled_shift_ledger(
    plan_id,jobid,jobname,previous_schedule,governed_schedule,applied_at,
    pre_v1461_state,pre_v1461_observation_minutes,
    pre_peak_concurrent,pre_peak_starts_per_minute,pre_failures_60m,receipt_evidence
  )
  values(
    'V1511_OWNER_ANOMALY_SHIFT_001',
    v_jobid,
    'tfa-owner-anomaly-watch',
    '12,42 * * * *',
    '13,43 * * * *',
    now(),
    v_v1461->>'state',
    (v_v1461->>'observation_minutes')::numeric,
    v_peak_concurrent,
    v_peak_starts,
    v_failures_60m,
    v_receipt
  )
  on conflict(plan_id) do nothing;

  if not exists(
    select 1 from private.v1511_controlled_shift_ledger
    where plan_id='V1511_OWNER_ANOMALY_SHIFT_001'
      and jobid=v_jobid
      and previous_schedule='12,42 * * * *'
      and governed_schedule='13,43 * * * *'
  ) then
    raise exception 'v1511_ledger_snapshot_failed';
  end if;

  perform cron.alter_job(
    job_id := v_jobid,
    schedule := '13,43 * * * *'
  );
end $$;
