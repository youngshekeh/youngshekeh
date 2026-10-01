-- V151 Single-Candidate Controlled Plan Shadow
-- Selects at most one future scheduler move from V148/V149/V150 evidence.
-- Produces a rollback-aware plan only. It never mutates cron.

create or replace function public.get_v151_single_candidate_plan_shadow()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','cron','pg_catalog','pg_temp'
as $function$
declare
  v_now timestamptz := now();
  v_v1461 jsonb := '{}'::jsonb;
  v_v148 jsonb := '{}'::jsonb;
  v_v149 jsonb := '{}'::jsonb;
  v_v150 jsonb := '{}'::jsonb;
  v_plan jsonb := null;
  v_obs numeric := 0;
  v_failures integer := 0;
  v_drift integer := 0;
  v_v1461_state text := 'UNAVAILABLE';
  v_state text := 'NO_SINGLE_CANDIDATE_PLAN';
begin
  begin v_v1461 := public.get_v1461_peak_spreader_status();
  exception when others then v_v1461 := jsonb_build_object('ok',false,'state','UNAVAILABLE'); end;
  begin v_v148 := public.get_v148_predictive_collision_shadow();
  exception when others then v_v148 := jsonb_build_object('ok',false,'state','UNAVAILABLE'); end;
  begin v_v149 := public.get_v149_dependency_isolation_shadow();
  exception when others then v_v149 := jsonb_build_object('ok',false,'state','UNAVAILABLE'); end;
  begin v_v150 := public.get_v150_network_sla_evidence_shadow();
  exception when others then v_v150 := jsonb_build_object('ok',false,'state','UNAVAILABLE'); end;

  v_obs := coalesce((v_v1461->>'observation_minutes')::numeric,0);
  v_failures := coalesce((v_v1461->'since_apply'->>'failures')::integer,0);
  v_drift := coalesce((v_v1461->'plan'->>'schedule_drift_jobs')::integer,0);
  v_v1461_state := coalesce(v_v1461->>'state','UNAVAILABLE');

  with policy(jobname,lane,max_abs_shift_minutes,priority_rank) as (
    values
      ('tfa-owner-anomaly-watch','OPERATIONAL_MONITORING',2,1),
      ('tfa-member-alert-sync','MEMBER_COMMUNICATIONS',2,2),
      ('member-alert-generation-hourly','MEMBER_COMMUNICATIONS',4,3),
      ('tfa-autonomous-ops-watch','OPERATIONS_SENTINEL',1,4)
  ),
  v148_rows as (
    select
      x.value as candidate,
      x.value->>'jobname' as jobname,
      x.value->>'schedule' as modeled_current_schedule,
      coalesce((x.value->>'recommended_delta_minutes')::integer,0) as delta_minutes,
      coalesce((x.value->>'estimated_relief_index')::numeric,0) as relief_index,
      x.value->'recommended_trigger_minutes' as recommended_trigger_minutes
    from jsonb_array_elements(coalesce(v_v148->'candidates','[]'::jsonb)) x
  ),
  v149_rows as (
    select
      x.value->>'jobname' as jobname,
      x.value->>'dependency_verdict' as dependency_verdict,
      coalesce((x.value->>'direct_network_io')::boolean,false) as direct_network_io
    from jsonb_array_elements(coalesce(v_v149->'audits','[]'::jsonb)) x
  ),
  v150_rows as (
    select
      x.value->>'jobname' as jobname,
      coalesce((x.value->>'network_sla_cleared')::boolean,false) as network_sla_cleared,
      coalesce((x.value->>'protected_business')::boolean,false) as protected_business,
      x.value->>'evidence_verdict' as evidence_verdict,
      coalesce((x.value->>'receipt_coverage_pct')::numeric,0) as receipt_coverage_pct,
      coalesce((x.value->>'receipt_success_pct')::numeric,0) as receipt_success_pct,
      coalesce((x.value->>'p95_business_receipt_ms')::numeric,0) as p95_business_receipt_ms
    from jsonb_array_elements(coalesce(v_v150->'evidence','[]'::jsonb)) x
  ),
  eligible as (
    select
      p.*,
      c.relief_index,
      c.delta_minutes,
      c.modeled_current_schedule,
      j.jobid,
      j.schedule as live_current_schedule,
      (
        select string_agg(e.value,',' order by e.ordinality)
        from jsonb_array_elements_text(c.recommended_trigger_minutes)
          with ordinality as e(value,ordinality)
      ) || ' * * * *' as recommended_schedule,
      a.dependency_verdict,
      s.evidence_verdict,
      s.receipt_coverage_pct,
      s.receipt_success_pct,
      s.p95_business_receipt_ms
    from policy p
    join v148_rows c using(jobname)
    join v149_rows a using(jobname)
    join v150_rows s using(jobname)
    join cron.job j on j.jobname=p.jobname and j.active
    where s.network_sla_cleared
      and not s.protected_business
      and a.direct_network_io
      and a.dependency_verdict='REVIEW_NETWORK_SLA_AND_FAILURE_ISOLATION'
      and abs(c.delta_minutes)<=p.max_abs_shift_minutes
      and j.schedule=c.modeled_current_schedule
      and not exists(
        select 1 from private.v1461_peak_spreader_plan q where q.jobid=j.jobid
      )
  ),
  ranked as (
    select *,
      row_number() over(
        order by relief_index desc,priority_rank asc,abs(delta_minutes) asc,jobname
      ) as rn
    from eligible
  )
  select jsonb_build_object(
    'jobid',jobid,
    'jobname',jobname,
    'lane',lane,
    'priority_rank',priority_rank,
    'current_schedule',live_current_schedule,
    'recommended_schedule',recommended_schedule,
    'rollback_schedule',live_current_schedule,
    'delta_minutes',delta_minutes,
    'max_abs_shift_minutes',max_abs_shift_minutes,
    'estimated_relief_index',round(relief_index,2),
    'dependency_verdict',dependency_verdict,
    'network_evidence_verdict',evidence_verdict,
    'receipt_coverage_pct',receipt_coverage_pct,
    'receipt_success_pct',receipt_success_pct,
    'p95_business_receipt_ms',p95_business_receipt_ms,
    'apply',false,
    'rollback_ready',true,
    'requires_human_review',true
  )
  into v_plan
  from ranked
  where rn=1;

  if v_plan is null then
    v_state := 'NO_SINGLE_CANDIDATE_PLAN';
  elsif v_failures>0 or v_drift>0 then
    v_state := 'BLOCKED_V1461_REGRESSION';
  elsif v_obs<60 then
    v_state := 'PLAN_READY_WAIT_V1461_MATURITY';
  elsif v_v1461_state<>'PEAK_SPREAD_IMPROVED' then
    v_state := 'BLOCKED_V1461_NOT_IMPROVED';
  else
    v_state := 'READY_FOR_HUMAN_CONTROLLED_APPLY';
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','v151-single-candidate-plan-shadow-db-v1',
    'generated_at',v_now,
    'state',v_state,
    'plan',v_plan,
    'selection_policy',jsonb_build_object(
      'one_job_max',true,
      'rank_by','RELIEF_DESC_THEN_POLICY_PRIORITY_THEN_SMALLEST_SHIFT',
      'requires_live_schedule_match',true,
      'protected_business_excluded',true,
      'v1461_managed_jobs_excluded',true
    ),
    'dependencies',jsonb_build_object(
      'v1461_state',v_v1461_state,
      'v1461_observation_minutes',v_obs,
      'v1461_failures_since_apply',v_failures,
      'v1461_schedule_drift_jobs',v_drift,
      'v148_state',v_v148->>'state',
      'v149_state',v_v149->>'state',
      'v150_state',v_v150->>'state',
      'v150_network_sla_cleared_candidates',v_v150->'summary'->'network_sla_cleared_candidates'
    ),
    'promotion_gate',jsonb_build_object(
      'automatic_apply',false,
      'minimum_v1461_observation_minutes',60,
      'requires_v1461_state','PEAK_SPREAD_IMPROVED',
      'requires_zero_post_change_failures',true,
      'requires_zero_schedule_drift',true,
      'requires_exact_current_schedule_match',true,
      'requires_human_review',true,
      'requires_rollback_snapshot',true,
      'single_candidate_only',true
    ),
    'governance',jsonb_build_object(
      'action_permitted','WAIT',
      'capital_permission','0R',
      'live_order_routing',false,
      'automatic_rescheduling',false,
      'automatic_policy_promotion',false,
      'single_candidate_plan_can_unlock_capital',false
    ),
    'truth_label','SINGLE_CANDIDATE_CONTROLLED_PLAN_SHADOW_NOT_SCHEDULER_PERMISSION'
  );
end;
$function$;

revoke all on function public.get_v151_single_candidate_plan_shadow() from public;
revoke all on function public.get_v151_single_candidate_plan_shadow() from anon;
revoke all on function public.get_v151_single_candidate_plan_shadow() from authenticated;
grant execute on function public.get_v151_single_candidate_plan_shadow() to service_role;
