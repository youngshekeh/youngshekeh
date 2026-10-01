-- V145.2 Connection-Aware Admission Shadow
-- Deep call-graph screening detects nested public calls and network I/O inside SQL wrappers.
-- Read-only planning only. It never alters cron jobs, schedules, order routing, or capital permission.

CREATE OR REPLACE FUNCTION public.get_v145_connection_admission_shadow()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'cron', 'pg_temp'
AS $function$


declare
  v_now timestamptz := now();
  v_active_jobs integer := 0;
  v_candidate_groups integer := 0;
  v_simple_candidate_groups integer := 0;
  v_review_groups integer := 0;
  v_potential_slots_saved integer := 0;
  v_groups jsonb := '[]'::jsonb;
  v_hot_minutes jsonb := '[]'::jsonb;
  v_state text := 'SHADOW_ANALYSIS';
begin
  select count(*)::int into v_active_jobs from cron.job where active=true;

  with job_base as (
    select
      j.jobid,
      j.jobname,
      j.schedule,
      j.command,
      substring(j.command from 'public[.]([a-zA-Z0-9_]+)') as function_name,
      (j.command ~* '^[[:space:]]*select[[:space:]]+public[.][a-zA-Z0-9_]+[(][^;]*[)];?[[:space:]]*$') as simple_sql_call
    from cron.job j
    where j.active=true
  ),
  job_enriched as (
    select
      b.*,
      coalesce(fn.prosrc,'') as function_source,
      (
        b.command ~* 'net[.]http_|http_post|http_get'
        or coalesce(fn.prosrc,'') ~* 'net[.]http_|http_post|http_get'
      ) as network_call,
      (
        coalesce(fn.prosrc,'') ~* '(perform|select)[[:space:]]+public[.]'
      ) as nested_public_call
    from job_base b
    left join lateral (
      select p.prosrc
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and p.proname=b.function_name
      order by p.oid
      limit 1
    ) fn on true
  ),
  job_stats as (
    select
      b.jobid,
      b.jobname,
      b.schedule,
      b.command,
      b.function_name,
      b.simple_sql_call,
      b.network_call,
      b.nested_public_call,
      count(d.*) filter(where d.start_time>=v_now-interval '24 hours')::int as runs_24h,
      count(d.*) filter(where d.start_time>=v_now-interval '24 hours' and d.status not in ('succeeded','running'))::int as failures_24h,
      round(avg(extract(epoch from (d.end_time-d.start_time))*1000)
        filter(where d.start_time>=v_now-interval '24 hours' and d.end_time is not null)::numeric,1) as avg_ms_24h,
      round(percentile_cont(0.95) within group(order by extract(epoch from (d.end_time-d.start_time))*1000)
        filter(where d.start_time>=v_now-interval '24 hours' and d.end_time is not null)::numeric,1) as p95_ms_24h
    from job_enriched b
    left join cron.job_run_details d on d.jobid=b.jobid
    group by b.jobid,b.jobname,b.schedule,b.command,b.function_name,b.simple_sql_call,b.network_call,b.nested_public_call
  ),
  cadence_groups as (
    select
      schedule,
      count(*)::int as job_count,
      count(*) filter(where simple_sql_call)::int as simple_sql_jobs,
      count(*) filter(where network_call)::int as network_jobs,
      count(*) filter(where nested_public_call)::int as nested_public_jobs,
      sum(failures_24h)::int as failures_24h,
      round(sum(coalesce(p95_ms_24h,0))::numeric,1) as sequential_p95_budget_ms,
      round(max(coalesce(p95_ms_24h,0))::numeric,1) as max_job_p95_ms,
      greatest(count(*)-1,0)::int as projected_slots_saved_per_trigger,
      case
        when count(*) filter(where network_call)>0 then 'REVIEW_NETWORK_OR_EXTERNAL_IO'
        when count(*) filter(where nested_public_call)>0 then 'REVIEW_NESTED_CALL_GRAPH'
        when count(*) filter(where not simple_sql_call)>0 then 'REVIEW_COMPLEX_COMMAND'
        when sum(failures_24h)>0 then 'REVIEW_RECENT_FAILURES'
        when sum(coalesce(p95_ms_24h,0))>20000 then 'REVIEW_SERIAL_RUNTIME_BUDGET'
        when count(*)>8 then 'REVIEW_LARGE_BUNDLE'
        else 'SHADOW_SERIALIZATION_CANDIDATE'
      end as admission_class,
      jsonb_agg(
        jsonb_build_object(
          'jobid',jobid,
          'jobname',jobname,
          'simple_sql_call',simple_sql_call,
          'network_call',network_call,
          'nested_public_call',nested_public_call,
          'runs_24h',runs_24h,
          'failures_24h',failures_24h,
          'avg_ms_24h',avg_ms_24h,
          'p95_ms_24h',p95_ms_24h,
          'v144_managed',exists(select 1 from private.v144_scheduler_plan p where p.jobid=job_stats.jobid)
        )
        order by coalesce(p95_ms_24h,0) desc,jobname
      ) as jobs
    from job_stats
    group by schedule
    having count(*)>=2
  )
  select
    count(*)::int,
    count(*) filter(where admission_class='SHADOW_SERIALIZATION_CANDIDATE')::int,
    count(*) filter(where admission_class<>'SHADOW_SERIALIZATION_CANDIDATE')::int,
    coalesce(sum(projected_slots_saved_per_trigger)
      filter(where admission_class='SHADOW_SERIALIZATION_CANDIDATE'),0)::int,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'schedule',schedule,
        'job_count',job_count,
        'simple_sql_jobs',simple_sql_jobs,
        'network_jobs',network_jobs,
        'nested_public_jobs',nested_public_jobs,
        'failures_24h',failures_24h,
        'sequential_p95_budget_ms',sequential_p95_budget_ms,
        'max_job_p95_ms',max_job_p95_ms,
        'projected_slots_saved_per_trigger',projected_slots_saved_per_trigger,
        'admission_class',admission_class,
        'requires_call_graph_review',true,
        'jobs',jobs
      )
      order by
        case when admission_class='SHADOW_SERIALIZATION_CANDIDATE' then 0 else 1 end,
        job_count desc,
        sequential_p95_budget_ms desc
    ),'[]'::jsonb)
  into
    v_candidate_groups,
    v_simple_candidate_groups,
    v_review_groups,
    v_potential_slots_saved,
    v_groups
  from cadence_groups;

  with p as (
    select max(updated_at) as changed_at from private.v144_scheduler_plan
  ),
  per_minute as (
    select
      date_trunc('minute',d.start_time) as bucket,
      count(*)::int as starts,
      count(*) filter(where d.status not in ('succeeded','running'))::int as failures,
      round(max(extract(epoch from (d.end_time-d.start_time))*1000)
        filter(where d.end_time is not null)::numeric,1) as max_runtime_ms,
      round(sum(extract(epoch from (d.end_time-d.start_time))*1000)
        filter(where d.end_time is not null)::numeric,1) as aggregate_runtime_ms
    from cron.job_run_details d
    cross join p
    where d.start_time>=p.changed_at
    group by 1
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'minute',bucket,
      'starts',starts,
      'failures',failures,
      'max_runtime_ms',max_runtime_ms,
      'aggregate_runtime_ms',aggregate_runtime_ms,
      'above_recommended_start_count',starts>8
    )
    order by starts desc,aggregate_runtime_ms desc
  ),'[]'::jsonb)
  into v_hot_minutes
  from (
    select * from per_minute
    order by starts desc,aggregate_runtime_ms desc
    limit 12
  ) x;

  if v_simple_candidate_groups=0 then
    v_state := 'NO_LOW_COMPLEXITY_BUNDLES';
  elsif v_potential_slots_saved>=8 then
    v_state := 'SERIALIZATION_OPPORTUNITY_IDENTIFIED';
  else
    v_state := 'LIMITED_SERIALIZATION_OPPORTUNITY';
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','v145.2-connection-admission-shadow-db-v3',
    'generated_at',v_now,
    'state',v_state,
    'summary',jsonb_build_object(
      'active_jobs',v_active_jobs,
      'collision_groups',v_candidate_groups,
      'shadow_serialization_candidate_groups',v_simple_candidate_groups,
      'review_required_groups',v_review_groups,
      'projected_connection_slots_saved_per_trigger',v_potential_slots_saved,
      'recommended_concurrent_ceiling',8
    ),
    'cadence_groups',v_groups,
    'post_v144_hot_minutes',v_hot_minutes,
    'admission_policy',jsonb_build_object(
      'mode','SHADOW_ONLY',
      'automatic_bundling',false,
      'automatic_job_disable',false,
      'automatic_schedule_change',false,
      'requires_call_graph_review',true,
      'requires_transaction_semantics_review',true,
      'requires_failure_isolation_review',true,
      'promotion_rule','No bundle may become active solely from this score.'
    ),
    'governance',jsonb_build_object(
      'action_permitted','WAIT',
      'capital_permission','0R',
      'live_order_routing',false,
      'automatic_policy_promotion',false,
      'automatic_rescheduling',false,
      'admission_shadow_can_unlock_capital',false
    ),
    'truth_label','SHADOW_CONNECTION_ADMISSION_ANALYSIS_NOT_EXECUTION_PERMISSION'
  );
end;


$function$


revoke all on function public.get_v145_connection_admission_shadow() from public;
revoke all on function public.get_v145_connection_admission_shadow() from anon;
revoke all on function public.get_v145_connection_admission_shadow() from authenticated;
grant execute on function public.get_v145_connection_admission_shadow() to service_role;
