-- V151.2 Bounded Evidence Bundle
-- Eliminates recursive recomputation while preserving V149 and V150 classification semantics.
-- Snapshot helpers are private and read-only.

create or replace function private.get_v149_dependency_isolation_from_v148(v_v148 jsonb, v_v1461 jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','cron','pg_catalog','pg_temp'
as $function$
declare
  v_now timestamptz := now();
  v_audits jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_cleared integer := 0;
  v_network integer := 0;
  v_protected integer := 0;
  v_write integer := 0;
  v_privileged integer := 0;
  v_missing_function integer := 0;
  v_v1461_minutes numeric := 0;
  v_state text := 'NO_CANDIDATES';
begin
  v_v1461_minutes := coalesce((v_v1461->>'observation_minutes')::numeric,0);

  with candidate_rows as (
    select
      x.value as candidate,
      (x.value->>'jobid')::bigint as jobid,
      x.value->>'jobname' as jobname,
      coalesce((x.value->>'estimated_relief_index')::numeric,0) as relief_index,
      coalesce((x.value->>'p95_runtime_ms')::numeric,0) as p95_runtime_ms,
      coalesce((x.value->>'network_call')::boolean,false) as v148_network_call,
      x.value->>'review_class' as v148_review_class
    from jsonb_array_elements(coalesce(v_v148->'candidates','[]'::jsonb)) x
  ),
  base as (
    select c.*,j.command,j.schedule
    from candidate_rows c
    join cron.job j on j.jobid=c.jobid
  ),
  expanded as (
    select
      b.*,
      fn.function_name
    from base b
    left join lateral (
      select m[1] as function_name
      from regexp_matches(
        b.command,
        'public\.([a-zA-Z0-9_]+)[[:space:]]*\(',
        'g'
      ) m
    ) fn on true
  ),
  fn_meta as (
    select
      e.*,
      p.oid as function_oid,
      coalesce(p.prosecdef,false) as security_definer,
      case when p.oid is null then null else pg_get_functiondef(p.oid) end as definition
    from expanded e
    left join pg_namespace n on n.nspname='public'
    left join pg_proc p
      on p.pronamespace=n.oid
     and p.proname=e.function_name
     and p.pronargs=0
  ),
  aggregated as (
    select
      jobid,
      max(jobname) as jobname,
      max(schedule) as schedule,
      max(command) as command,
      max(relief_index) as relief_index,
      max(p95_runtime_ms) as p95_runtime_ms,
      bool_or(v148_network_call or command ~* 'net\.(http_|http)') as direct_network_io,
      coalesce(jsonb_agg(distinct function_name) filter(where function_name is not null),'[]'::jsonb) as direct_functions,
      count(distinct function_name) filter(where function_name is not null)::int as direct_function_count,
      count(distinct function_name) filter(where function_name is not null and function_oid is null)::int as missing_function_count,
      count(distinct function_name) filter(where function_oid is not null and security_definer)::int as security_definer_count,
      bool_or(coalesce(definition,'') ~* 'net\.(http_|http|_http_response)') as nested_network_surface,
      bool_or(
        coalesce(definition,'') ~* '(insert[[:space:]]+into|update[[:space:]]+[a-zA-Z_]|delete[[:space:]]+from)'
      ) as database_write_surface,
      bool_or(
        coalesce(definition,'') ~* '(gold_|capital_|permission_|firewall|execution_|risk_|payment|flutterwave|billing|subscription)'
        or jobname ~* '(payment|flutterwave|billing|subscription)'
      ) as protected_data_surface,
      bool_or(
        regexp_replace(
          coalesce(definition,''),
          '^CREATE OR REPLACE FUNCTION public\.[^\n]+',
          '',
          'i'
        ) ~* 'public\.[a-zA-Z0-9_]+[[:space:]]*\('
      ) as transitive_public_call_surface,
      bool_or(coalesce(definition,'') ~* '(for[[:space:]]+update|pg_advisory|lock[[:space:]]+table)') as lock_sensitive_surface,
      max(v148_review_class) as v148_review_class
    from fn_meta
    group by jobid
  ),
  classified as (
    select
      a.*,
      case
        when protected_data_surface then 'BLOCKED_PROTECTED_DATA_SIDE_EFFECT'
        when direct_network_io then 'REVIEW_NETWORK_SLA_AND_FAILURE_ISOLATION'
        when nested_network_surface then 'REVIEW_NESTED_NETWORK_SURFACE'
        when missing_function_count>0 then 'BLOCKED_UNRESOLVED_FUNCTION_DEPENDENCY'
        when database_write_surface and security_definer_count>0 then 'REVIEW_PRIVILEGED_DATABASE_WRITE'
        when database_write_surface then 'REVIEW_DATABASE_WRITE'
        when lock_sensitive_surface then 'REVIEW_LOCK_SENSITIVE_PATH'
        when transitive_public_call_surface then 'REVIEW_TRANSITIVE_CALL_CHAIN'
        when security_definer_count>0 then 'REVIEW_PRIVILEGED_READ_PATH'
        else 'LOWER_RISK_READ_ONLY'
      end as dependency_verdict
    from aggregated a
  ),
  final as (
    select
      *,
      (
        dependency_verdict='LOWER_RISK_READ_ONLY'
        and p95_runtime_ms<=1000
        and direct_network_io=false
        and database_write_surface=false
        and protected_data_surface=false
        and missing_function_count=0
      ) as dependency_cleared
    from classified
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'jobid',jobid,
      'jobname',jobname,
      'schedule',schedule,
      'estimated_relief_index',round(relief_index,2),
      'p95_runtime_ms',p95_runtime_ms,
      'direct_network_io',direct_network_io,
      'direct_functions',direct_functions,
      'direct_function_count',direct_function_count,
      'missing_function_count',missing_function_count,
      'security_definer_count',security_definer_count,
      'nested_network_surface',nested_network_surface,
      'database_write_surface',database_write_surface,
      'protected_data_surface',protected_data_surface,
      'transitive_public_call_surface',transitive_public_call_surface,
      'lock_sensitive_surface',lock_sensitive_surface,
      'v148_review_class',v148_review_class,
      'dependency_verdict',dependency_verdict,
      'dependency_cleared',dependency_cleared,
      'apply',false,
      'requires_human_review',true
    ) order by relief_index desc),'[]'::jsonb),
    count(*)::int,
    count(*) filter(where dependency_cleared)::int,
    count(*) filter(where direct_network_io)::int,
    count(*) filter(where protected_data_surface)::int,
    count(*) filter(where database_write_surface)::int,
    count(*) filter(where security_definer_count>0)::int,
    count(*) filter(where missing_function_count>0)::int
  into
    v_audits,v_total,v_cleared,v_network,v_protected,v_write,v_privileged,v_missing_function
  from final;

  if v_total=0 then
    v_state := 'NO_CANDIDATES';
  elsif v_cleared>0 and v_v1461_minutes>=60 then
    v_state := 'DEPENDENCY_CLEARED_CANDIDATE_READY_FOR_CONTROLLED_PLAN';
  elsif v_cleared>0 then
    v_state := 'DEPENDENCY_CLEARED_WAIT_V1461_MATURITY';
  else
    v_state := 'NO_DEPENDENCY_CLEARED_CANDIDATE';
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','v149.1-dependency-isolation-from-v148-db-v2',
    'generated_at',v_now,
    'state',v_state,
    'summary',jsonb_build_object(
      'audited_candidates',v_total,
      'dependency_cleared_candidates',v_cleared,
      'direct_network_candidates',v_network,
      'protected_data_candidates',v_protected,
      'database_write_candidates',v_write,
      'privileged_function_candidates',v_privileged,
      'missing_function_candidates',v_missing_function
    ),
    'audits',v_audits,
    'dependencies',jsonb_build_object(
      'v148_state',v_v148->>'state',
      'v148_ranked_candidates',v_v148->'summary'->'ranked_candidates',
      'v1461_state',v_v1461->>'state',
      'v1461_observation_minutes',v_v1461->'observation_minutes',
      'v1461_failures_since_apply',v_v1461->'since_apply'->'failures'
    ),
    'promotion_gate',jsonb_build_object(
      'automatic_apply',false,
      'requires_human_review',true,
      'requires_dependency_cleared_candidate',true,
      'requires_v1461_matured_observation',true,
      'minimum_v1461_observation_minutes',60,
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
      'dependency_auditor_can_unlock_capital',false
    ),
    'truth_label','DEPENDENCY_FAILURE_ISOLATION_SHADOW_NOT_TRADING_PERMISSION'
  );
end;
$function$;

revoke all on function private.get_v149_dependency_isolation_from_v148(jsonb,jsonb) from public;
revoke all on function private.get_v149_dependency_isolation_from_v148(jsonb,jsonb) from anon;
revoke all on function private.get_v149_dependency_isolation_from_v148(jsonb,jsonb) from authenticated;
grant execute on function private.get_v149_dependency_isolation_from_v148(jsonb,jsonb) to service_role;


create or replace function private.get_v150_network_sla_evidence_from_v149(v_v149 jsonb, v_v1461 jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','cron','pg_catalog','pg_temp'
as $function$
declare
  v_now timestamptz := now();
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
    'version','v150.1-network-sla-evidence-from-v149-db-v2',
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

revoke all on function private.get_v150_network_sla_evidence_from_v149(jsonb,jsonb) from public;
revoke all on function private.get_v150_network_sla_evidence_from_v149(jsonb,jsonb) from anon;
revoke all on function private.get_v150_network_sla_evidence_from_v149(jsonb,jsonb) from authenticated;
grant execute on function private.get_v150_network_sla_evidence_from_v149(jsonb,jsonb) to service_role;

