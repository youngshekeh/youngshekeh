-- V150 Network SLA Evidence Shadow
-- Correlates network cron invocations with first-party agent_run completion receipts.
-- No cron changes, no payment action, no pool change, no trading permission changes.

create or replace function public.get_v150_network_sla_evidence_shadow()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','cron','pg_catalog','pg_temp'
as $function$
declare
  v_now timestamptz := now();
  v_v149 jsonb := '{}'::jsonb;
  v_v1461 jsonb := '{}'::jsonb;
  v_evidence jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_cleared integer := 0;
  v_protected integer := 0;
  v_incomplete integer := 0;
  v_failure_review integer := 0;
  v_latency_review integer := 0;
  v_v1461_minutes numeric := 0;
  v_state text := 'NO_NETWORK_CANDIDATES';
begin
  begin
    v_v149 := public.get_v149_dependency_isolation_shadow();
  exception when others then
    v_v149 := jsonb_build_object('ok',false,'state','UNAVAILABLE');
  end;

  begin
    v_v1461 := public.get_v1461_peak_spreader_status();
  exception when others then
    v_v1461 := jsonb_build_object('ok',false,'state','UNAVAILABLE');
  end;

  v_v1461_minutes := coalesce((v_v1461->>'observation_minutes')::numeric,0);

  with mapping(jobname,agent_type,expected_interval_minutes,protected_business) as (
    values
      ('tfa-owner-anomaly-watch','owner_anomaly_detection',30,false),
      ('tfa-member-alert-sync','member_alert_sync',60,false),
      ('tfa-autonomous-ops-watch','autonomous_ops_watch',15,false),
      ('tfa-flutterwave-reconciliation','billing_reconciliation',60,true),
      ('member-alert-generation-hourly','member_alert_generation',60,false)
  ),
  v149_network as (
    select
      a.value->>'jobname' as jobname,
      a.value->>'dependency_verdict' as v149_dependency_verdict,
      coalesce((a.value->>'estimated_relief_index')::numeric,0) as estimated_relief_index,
      coalesce((a.value->>'direct_network_io')::boolean,false) as direct_network_io
    from jsonb_array_elements(coalesce(v_v149->'audits','[]'::jsonb)) a
    where coalesce((a.value->>'direct_network_io')::boolean,false)
  ),
  targets as (
    select
      m.*,n.v149_dependency_verdict,n.estimated_relief_index,j.jobid,j.schedule
    from mapping m
    join v149_network n using(jobname)
    join cron.job j on j.jobname=m.jobname
  ),
  cron_stats as (
    select
      t.jobname,t.agent_type,t.expected_interval_minutes,t.protected_business,
      t.v149_dependency_verdict,t.estimated_relief_index,t.jobid,t.schedule,
      count(d.runid)::int as cron_runs,
      count(d.runid) filter(where d.status not in ('succeeded','running'))::int as cron_failures,
      max(d.start_time) as latest_cron_start
    from targets t
    left join cron.job_run_details d
      on d.jobid=t.jobid
     and d.start_time>=v_now-interval '24 hours'
    group by
      t.jobname,t.agent_type,t.expected_interval_minutes,t.protected_business,
      t.v149_dependency_verdict,t.estimated_relief_index,t.jobid,t.schedule
  ),
  agent_stats as (
    select
      t.agent_type,
      count(a.id)::int as receipts,
      count(a.id) filter(where a.status='succeeded')::int as succeeded,
      count(a.id) filter(where a.status='failed')::int as failed,
      count(a.id) filter(where a.status='running')::int as running,
      round(percentile_cont(0.95) within group(
        order by extract(epoch from (a.completed_at-a.started_at))*1000
      ) filter(
        where a.completed_at is not null
          and a.started_at is not null
          and a.completed_at>=a.started_at
      )::numeric,1) as p95_receipt_ms,
      max(a.started_at) as latest_receipt_started_at,
      max(a.completed_at) as latest_receipt_completed_at
    from targets t
    left join public.agent_runs a
      on a.agent_type=t.agent_type
     and a.started_at>=v_now-interval '24 hours'
    group by t.agent_type
  ),
  measured as (
    select
      c.*,
      coalesce(a.receipts,0) as receipts,
      coalesce(a.succeeded,0) as succeeded,
      coalesce(a.failed,0) as failed,
      coalesce(a.running,0) as running,
      a.p95_receipt_ms,
      a.latest_receipt_started_at,
      a.latest_receipt_completed_at,
      case when c.cron_runs>0
        then round(100.0*coalesce(a.receipts,0)/c.cron_runs,2)
        else null end as receipt_coverage_pct,
      case when coalesce(a.receipts,0)>0
        then round(100.0*coalesce(a.succeeded,0)/a.receipts,2)
        else null end as receipt_success_pct,
      case when a.latest_receipt_started_at is not null
        then round((extract(epoch from (v_now-a.latest_receipt_started_at))/60.0)::numeric,2)
        else null end as latest_receipt_age_minutes,
      greatest(c.expected_interval_minutes*2+5,30) as freshness_limit_minutes
    from cron_stats c
    left join agent_stats a using(agent_type)
  ),
  classified as (
    select
      m.*,
      case
        when protected_business then 'BLOCKED_PROTECTED_BUSINESS_WORKFLOW'
        when v149_dependency_verdict<>'REVIEW_NETWORK_SLA_AND_FAILURE_ISOLATION'
          then 'BLOCKED_UPSTREAM_DEPENDENCY_VERDICT'
        when cron_failures>0 or failed>0
          then 'REVIEW_FAILURE_EVIDENCE'
        when cron_runs=0 or receipts=0
          then 'EVIDENCE_INCOMPLETE_NO_RECEIPTS'
        when coalesce(receipt_coverage_pct,0)<95
          then 'EVIDENCE_INCOMPLETE_RECEIPT_COVERAGE'
        when coalesce(receipt_success_pct,0)<99
          then 'EVIDENCE_INCOMPLETE_SUCCESS_RATE'
        when latest_receipt_age_minutes is null
          or latest_receipt_age_minutes>freshness_limit_minutes
          then 'EVIDENCE_STALE'
        when coalesce(p95_receipt_ms,999999)>10000
          then 'REVIEW_HIGH_RECEIPT_LATENCY'
        else 'NETWORK_SLA_EVIDENCE_CLEARED'
      end as evidence_verdict
    from measured m
  ),
  final as (
    select
      c.*,
      (
        evidence_verdict='NETWORK_SLA_EVIDENCE_CLEARED'
        and protected_business=false
        and cron_failures=0
        and failed=0
        and coalesce(receipt_coverage_pct,0)>=95
        and coalesce(receipt_success_pct,0)>=99
        and coalesce(p95_receipt_ms,999999)<=10000
      ) as network_sla_cleared
    from classified c
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'jobname',jobname,
      'jobid',jobid,
      'schedule',schedule,
      'agent_type',agent_type,
      'expected_interval_minutes',expected_interval_minutes,
      'protected_business',protected_business,
      'v149_dependency_verdict',v149_dependency_verdict,
      'estimated_relief_index',round(estimated_relief_index,2),
      'cron_runs_24h',cron_runs,
      'cron_failures_24h',cron_failures,
      'agent_receipts_24h',receipts,
      'agent_succeeded_24h',succeeded,
      'agent_failed_24h',failed,
      'agent_running_24h',running,
      'receipt_coverage_pct',receipt_coverage_pct,
      'receipt_success_pct',receipt_success_pct,
      'p95_business_receipt_ms',p95_receipt_ms,
      'latest_cron_start',latest_cron_start,
      'latest_receipt_started_at',latest_receipt_started_at,
      'latest_receipt_completed_at',latest_receipt_completed_at,
      'latest_receipt_age_minutes',latest_receipt_age_minutes,
      'freshness_limit_minutes',freshness_limit_minutes,
      'evidence_verdict',evidence_verdict,
      'network_sla_cleared',network_sla_cleared,
      'apply',false,
      'requires_human_review',true
    ) order by estimated_relief_index desc),'[]'::jsonb),
    count(*)::int,
    count(*) filter(where network_sla_cleared)::int,
    count(*) filter(where protected_business)::int,
    count(*) filter(where evidence_verdict like 'EVIDENCE_INCOMPLETE%')::int,
    count(*) filter(where evidence_verdict='REVIEW_FAILURE_EVIDENCE')::int,
    count(*) filter(where evidence_verdict='REVIEW_HIGH_RECEIPT_LATENCY')::int
  into
    v_evidence,v_total,v_cleared,v_protected,v_incomplete,v_failure_review,v_latency_review
  from final;

  if v_total=0 then
    v_state := 'NO_NETWORK_CANDIDATES';
  elsif v_cleared>0 and v_v1461_minutes>=60 then
    v_state := 'NETWORK_SLA_CANDIDATES_READY_FOR_CONTROLLED_PLAN_REVIEW';
  elsif v_cleared>0 then
    v_state := 'NETWORK_SLA_CANDIDATES_WAIT_V1461_MATURITY';
  else
    v_state := 'NO_NETWORK_SLA_CANDIDATE_CLEARED';
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','v150-network-sla-evidence-shadow-db-v1',
    'generated_at',v_now,
    'state',v_state,
    'summary',jsonb_build_object(
      'network_candidates_audited',v_total,
      'network_sla_cleared_candidates',v_cleared,
      'protected_business_candidates',v_protected,
      'incomplete_evidence_candidates',v_incomplete,
      'failure_review_candidates',v_failure_review,
      'latency_review_candidates',v_latency_review
    ),
    'evidence',v_evidence,
    'thresholds',jsonb_build_object(
      'minimum_receipt_coverage_pct',95,
      'minimum_receipt_success_pct',99,
      'maximum_p95_business_receipt_ms',10000,
      'freshness_rule','LATEST_RECEIPT_WITHIN_MAX_30_OR_2X_CADENCE_PLUS_5_MIN'
    ),
    'dependencies',jsonb_build_object(
      'v149_state',v_v149->>'state',
      'v149_dependency_cleared_candidates',v_v149->'summary'->'dependency_cleared_candidates',
      'v1461_state',v_v1461->>'state',
      'v1461_observation_minutes',v_v1461->'observation_minutes',
      'v1461_failures_since_apply',v_v1461->'since_apply'->'failures'
    ),
    'promotion_gate',jsonb_build_object(
      'automatic_apply',false,
      'requires_human_review',true,
      'requires_network_sla_cleared_candidate',true,
      'requires_v1461_matured_observation',true,
      'minimum_v1461_observation_minutes',60,
      'protected_business_workflows_never_auto_clear',true,
      'requires_rollback_plan',true,
      'requires_post_change_observation',true
    ),
    'governance',jsonb_build_object(
      'action_permitted','WAIT',
      'capital_permission','0R',
      'live_order_routing',false,
      'automatic_rescheduling',false,
      'automatic_pool_reconfiguration',false,
      'automatic_policy_promotion',false,
      'network_sla_evidence_can_unlock_capital',false
    ),
    'truth_label','FIRST_PARTY_NETWORK_SLA_EVIDENCE_SHADOW_NOT_TRADING_PERMISSION'
  );
end;
$function$;

revoke all on function public.get_v150_network_sla_evidence_shadow() from public;
revoke all on function public.get_v150_network_sla_evidence_shadow() from anon;
revoke all on function public.get_v150_network_sla_evidence_shadow() from authenticated;
grant execute on function public.get_v150_network_sla_evidence_shadow() to service_role;
