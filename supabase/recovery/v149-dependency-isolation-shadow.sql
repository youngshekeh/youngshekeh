-- V149 Dependency & Failure-Isolation Auditor Shadow
-- Audits V148 candidates for direct network I/O, privileged nested functions,
-- database writes, protected-data references and hidden transitive call chains.
-- Read-only. No scheduler, pool, execution, or capital mutation.

create or replace function public.get_v149_dependency_isolation_shadow()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','cron','pg_catalog','pg_temp'
as $function$
declare
  v_now timestamptz := now();
  v_v148 jsonb := '{}'::jsonb;
  v_v1461 jsonb := '{}'::jsonb;
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
  begin
    v_v148 := public.get_v148_predictive_collision_shadow();
  exception when others then
    v_v148 := jsonb_build_object('ok',false,'state','UNAVAILABLE');
  end;

  begin
    v_v1461 := public.get_v1461_peak_spreader_status();
  exception when others then
    v_v1461 := jsonb_build_object('ok',false,'state','UNAVAILABLE');
  end;

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
    'version','v149-dependency-isolation-shadow-db-v1',
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

revoke all on function public.get_v149_dependency_isolation_shadow() from public;
revoke all on function public.get_v149_dependency_isolation_shadow() from anon;
revoke all on function public.get_v149_dependency_isolation_shadow() from authenticated;
grant execute on function public.get_v149_dependency_isolation_shadow() to service_role;
