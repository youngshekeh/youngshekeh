-- V148 Predictive Collision Optimizer Shadow
-- Historical repeat-pattern forecast and advisory candidate ranking only.
-- No scheduler mutation, no pool mutation, no trading-permission mutation.

create or replace function private.v148_minute_matches(expr text, minute_value integer)
returns boolean
language plpgsql
immutable
set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  part text;
  range_part text;
  step_part text;
  start_min integer;
  end_min integer;
  step_min integer;
begin
  if expr is null or minute_value < 0 or minute_value > 59 then
    return false;
  end if;

  if expr = '*' then
    return true;
  end if;

  if expr ~ '^\*/[1-9][0-9]*$' then
    step_min := split_part(expr,'/',2)::integer;
    return mod(minute_value,step_min)=0;
  end if;

  if expr ~ '^[0-9]+-[0-9]+/[1-9][0-9]*$' then
    range_part := split_part(expr,'/',1);
    step_part := split_part(expr,'/',2);
    start_min := split_part(range_part,'-',1)::integer;
    end_min := split_part(range_part,'-',2)::integer;
    step_min := step_part::integer;
    return minute_value between start_min and end_min
       and mod(minute_value-start_min,step_min)=0;
  end if;

  if expr ~ '^[0-9]+(,[0-9]+)*$' then
    foreach part in array string_to_array(expr,',') loop
      if part::integer=minute_value then
        return true;
      end if;
    end loop;
    return false;
  end if;

  return false;
end;
$function$;

revoke all on function private.v148_minute_matches(text,integer) from public;
revoke all on function private.v148_minute_matches(text,integer) from anon;
revoke all on function private.v148_minute_matches(text,integer) from authenticated;
grant execute on function private.v148_minute_matches(text,integer) to service_role;

create or replace function public.get_v148_predictive_collision_shadow()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','cron','pg_catalog','pg_temp'
as $function$
declare
  v_now timestamptz := now();
  v_hot_minutes jsonb := '[]'::jsonb;
  v_candidates jsonb := '[]'::jsonb;
  v_candidate_count integer := 0;
  v_low_complexity_count integer := 0;
  v_review_count integer := 0;
  v_protected_count integer := 0;
  v_best_relief numeric := 0;
  v_state text := 'NO_CANDIDATES';
  v_v1461 jsonb := '{}'::jsonb;
  v_v147 jsonb := '{}'::jsonb;
begin
  begin
    v_v1461 := public.get_v1461_peak_spreader_status();
  exception when others then
    v_v1461 := jsonb_build_object('ok',false,'state','UNAVAILABLE');
  end;

  begin
    v_v147 := public.get_v147_connection_pressure_shadow();
  exception when others then
    v_v147 := jsonb_build_object('ok',false,'state','UNAVAILABLE');
  end;

  with hour_span as (
    select greatest(count(distinct date_trunc('hour',start_time)),1)::numeric as hours_observed
    from cron.job_run_details
    where start_time>=v_now-interval '24 hours'
  ),
  minute_load as (
    select
      extract(minute from d.start_time)::int as minute_of_hour,
      count(*)::int as starts_24h,
      count(*) filter(where d.status not in ('succeeded','running'))::int as failures_24h,
      round((count(*)::numeric/(select hours_observed from hour_span)),2) as avg_starts_per_observed_hour,
      round(avg(extract(epoch from (d.end_time-d.start_time))*1000)
        filter(where d.end_time is not null)::numeric,1) as avg_runtime_ms,
      round(percentile_cont(0.95) within group(order by extract(epoch from (d.end_time-d.start_time))*1000)
        filter(where d.end_time is not null)::numeric,1) as p95_runtime_ms
    from cron.job_run_details d
    where d.start_time>=v_now-interval '24 hours'
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'minute_of_hour',minute_of_hour,
    'starts_24h',starts_24h,
    'failures_24h',failures_24h,
    'historical_avg_starts_per_hour',avg_starts_per_observed_hour,
    'avg_runtime_ms',avg_runtime_ms,
    'p95_runtime_ms',p95_runtime_ms,
    'forecast_basis','24H_MINUTE_OF_HOUR_REPEAT_PATTERN'
  ) order by avg_starts_per_observed_hour desc,minute_of_hour),'[]'::jsonb)
  into v_hot_minutes
  from (
    select * from minute_load
    order by avg_starts_per_observed_hour desc,minute_of_hour
    limit 12
  ) x;

  with hour_span as (
    select greatest(count(distinct date_trunc('hour',start_time)),1)::numeric as hours_observed
    from cron.job_run_details
    where start_time>=v_now-interval '24 hours'
  ),
  minute_load as (
    select
      extract(minute from d.start_time)::int as minute_of_hour,
      count(*)::numeric/(select hours_observed from hour_span) as avg_starts
    from cron.job_run_details d
    where d.start_time>=v_now-interval '24 hours'
    group by 1
  ),
  minute_grid as (
    select g as minute_of_hour,coalesce(m.avg_starts,0)::numeric as avg_starts
    from generate_series(0,59) g
    left join minute_load m using(minute_of_hour)
  ),
  job_stats as (
    select
      j.jobid,j.jobname,j.schedule,j.command,j.active,
      split_part(j.schedule,' ',1) as minute_expr,
      split_part(j.schedule,' ',2) as hour_expr,
      split_part(j.schedule,' ',3) as dom_expr,
      split_part(j.schedule,' ',4) as month_expr,
      split_part(j.schedule,' ',5) as dow_expr,
      count(d.runid)::int as runs_24h,
      count(d.runid) filter(where d.status not in ('succeeded','running'))::int as failures_24h,
      round(percentile_cont(0.95) within group(order by extract(epoch from (d.end_time-d.start_time))*1000)
        filter(where d.end_time is not null)::numeric,1) as p95_runtime_ms,
      (j.command ilike '%net.http%' or j.command ilike '%http_post%' or j.command ilike '%http_get%') as network_call,
      (j.command ~* 'public\.[a-zA-Z0-9_]+\s*\(') as nested_public_call,
      (j.jobname ~* '(gold|capital|permission|firewall|execution|risk|state|transition|provenance|quota|data-quality|load-shed|autonomous-core|market-memory|contract-path|exposure|paper|broker|portfolio)') as protected_lane,
      exists(select 1 from private.v1461_peak_spreader_plan p where p.jobid=j.jobid) as already_governed_v1461
    from cron.job j
    left join cron.job_run_details d
      on d.jobid=j.jobid
     and d.start_time>=v_now-interval '24 hours'
    where j.active
    group by j.jobid,j.jobname,j.schedule,j.command,j.active
  ),
  recurring_simple as (
    select js.*,
      array(
        select m
        from generate_series(0,59) m
        where private.v148_minute_matches(js.minute_expr,m)
        order by m
      ) as trigger_minutes
    from job_stats js
    where js.hour_expr='*'
      and js.dom_expr='*'
      and js.month_expr='*'
      and js.dow_expr='*'
      and (
        js.minute_expr='*'
        or js.minute_expr ~ '^\*/[1-9][0-9]*$'
        or js.minute_expr ~ '^[0-9]+-[0-9]+/[1-9][0-9]*$'
        or js.minute_expr ~ '^[0-9]+(,[0-9]+)*$'
      )
  ),
  candidate_base as (
    select r.*,
      cardinality(trigger_minutes) as triggers_per_hour,
      coalesce((
        select sum(mg.avg_starts)
        from unnest(trigger_minutes) t(m)
        join minute_grid mg on mg.minute_of_hour=t.m
      ),0)::numeric as current_load_index
    from recurring_simple r
    where not protected_lane
      and not already_governed_v1461
      and failures_24h=0
      and cardinality(trigger_minutes) between 1 and 4
      and coalesce(p95_runtime_ms,0) <= 2500
      and jobname !~* '(billing|subscription|payment|transactional-email|source-ingestion|newsroom-ingestion|trend-synthesis|member-digest)'
  ),
  deltas as (
    select c.*,d.delta,
      array(
        select ((m+d.delta+60)%60)
        from unnest(c.trigger_minutes) m
        order by 1
      ) as shifted_minutes
    from candidate_base c
    cross join (values(-4),(-3),(-2),(-1),(1),(2),(3),(4)) d(delta)
  ),
  scored as (
    select d.*,
      coalesce((
        select sum(mg.avg_starts)
        from unnest(d.shifted_minutes) t(m)
        join minute_grid mg on mg.minute_of_hour=t.m
      ),0)::numeric as shifted_load_index
    from deltas d
  ),
  ranked_delta as (
    select *,
      row_number() over(
        partition by jobid
        order by shifted_load_index asc,abs(delta) asc,delta asc
      ) as delta_rank
    from scored
  ),
  recommended as (
    select
      *,
      greatest(current_load_index-shifted_load_index,0) as estimated_relief_index,
      case
        when network_call then 'REVIEW_REQUIRED_NETWORK_IO'
        when nested_public_call then 'REVIEW_REQUIRED_NESTED_CALL'
        else 'LOW_COMPLEXITY_REVIEW_CANDIDATE'
      end as review_class
    from ranked_delta
    where delta_rank=1
      and shifted_load_index < current_load_index
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'jobid',jobid,
      'jobname',jobname,
      'schedule',schedule,
      'triggers_per_hour',triggers_per_hour,
      'current_trigger_minutes',to_jsonb(trigger_minutes),
      'recommended_delta_minutes',delta,
      'recommended_trigger_minutes',to_jsonb(shifted_minutes),
      'current_load_index',round(current_load_index,2),
      'shifted_load_index',round(shifted_load_index,2),
      'estimated_relief_index',round(estimated_relief_index,2),
      'p95_runtime_ms',p95_runtime_ms,
      'network_call',network_call,
      'nested_public_call',nested_public_call,
      'review_class',review_class,
      'apply',false,
      'requires_human_review',true
    ) order by estimated_relief_index desc,p95_runtime_ms desc nulls last),'[]'::jsonb),
    count(*)::int,
    count(*) filter(where review_class='LOW_COMPLEXITY_REVIEW_CANDIDATE')::int,
    count(*) filter(where review_class<>'LOW_COMPLEXITY_REVIEW_CANDIDATE')::int,
    coalesce(max(estimated_relief_index),0)
  into
    v_candidates,v_candidate_count,v_low_complexity_count,v_review_count,v_best_relief
  from (
    select * from recommended
    order by estimated_relief_index desc,p95_runtime_ms desc nulls last
    limit 10
  ) x;

  select count(*)::int
  into v_protected_count
  from cron.job j
  where j.active
    and j.jobname ~* '(gold|capital|permission|firewall|execution|risk|state|transition|provenance|quota|data-quality|load-shed|autonomous-core|market-memory|contract-path|exposure|paper|broker|portfolio)';

  if v_candidate_count>0 then
    v_state := case
      when v_low_complexity_count>0 then 'LOW_COMPLEXITY_CANDIDATES_FOUND'
      else 'REVIEW_ONLY_CANDIDATES_FOUND'
    end;
  else
    v_state := 'NO_SAFE_CANDIDATE_RELIEF_FOUND';
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','v148-predictive-collision-shadow-db-v1',
    'generated_at',v_now,
    'state',v_state,
    'forecast',jsonb_build_object(
      'basis','24H_MINUTE_OF_HOUR_REPEAT_PATTERN',
      'horizon_minutes',60,
      'exact_next_run_prediction',false,
      'hot_minutes',v_hot_minutes,
      'note','Forecast ranks recurring minute-of-hour pressure from the previous 24 hours. It is a historical-repeat load index, not a guarantee of future concurrency.'
    ),
    'summary',jsonb_build_object(
      'active_jobs',(select count(*) from cron.job where active),
      'protected_jobs',v_protected_count,
      'ranked_candidates',v_candidate_count,
      'low_complexity_candidates',v_low_complexity_count,
      'review_required_candidates',v_review_count,
      'best_estimated_relief_index',round(v_best_relief,2),
      'recommended_concurrent_ceiling',8
    ),
    'candidates',v_candidates,
    'dependencies',jsonb_build_object(
      'v1461_state',v_v1461->>'state',
      'v1461_observation_minutes',v_v1461->'observation_minutes',
      'v1461_failures_since_apply',v_v1461->'since_apply'->'failures',
      'v147_state',v_v147->>'state',
      'v147_pressure_score',v_v147->'pressure_score',
      'v147_client_utilization_pct',v_v147->'connections'->'utilization_pct'
    ),
    'promotion_gate',jsonb_build_object(
      'automatic_apply',false,
      'requires_human_review',true,
      'requires_v1461_matured_observation',true,
      'minimum_v1461_observation_minutes',60,
      'requires_rollback_plan',true,
      'requires_post_change_observation',true,
      'protected_lanes_excluded',true
    ),
    'governance',jsonb_build_object(
      'action_permitted','WAIT',
      'capital_permission','0R',
      'live_order_routing',false,
      'automatic_rescheduling',false,
      'automatic_pool_reconfiguration',false,
      'automatic_policy_promotion',false,
      'predictive_optimizer_can_unlock_capital',false
    ),
    'truth_label','HISTORICAL_COLLISION_FORECAST_SHADOW_NOT_TRADING_PERMISSION'
  );
end;
$function$;

revoke all on function public.get_v148_predictive_collision_shadow() from public;
revoke all on function public.get_v148_predictive_collision_shadow() from anon;
revoke all on function public.get_v148_predictive_collision_shadow() from authenticated;
grant execute on function public.get_v148_predictive_collision_shadow() to service_role;
