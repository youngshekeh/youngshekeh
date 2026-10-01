-- V163 Safe Alternative Minute Search Shadow
-- Finds a safer replacement minute for the current V151 candidate using the live cron graph.
-- Read-only. It never mutates cron, rollback state, trading permission, or capital permission.\n-- V163.1 performance hotfix: aggregate the 24h run history once before candidate joins.

create or replace function public.get_v163_safe_alternative_minute_search()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','cron','pg_catalog','pg_temp'
as $function$
declare
  v_now timestamptz := now();
  v_v151 jsonb := '{}'::jsonb;
  v_plan jsonb := '{}'::jsonb;

  v_jobid bigint;
  v_jobname text;
  v_current_schedule text;
  v_live_schedule text;
  v_max_shift integer := 0;
  v_current_minute integer;
  v_current_token_count integer := 0;
  v_current_peer_triggers integer := 0;
  v_current_hist_starts integer := 0;

  v_alternatives jsonb := '[]'::jsonb;
  v_best jsonb := null;
  v_eligible_count integer := 0;
  v_state text := 'NO_CANDIDATE';
begin
  begin
    v_v151 := public.get_v151_single_candidate_plan_shadow();
  exception when others then
    v_v151 := jsonb_build_object('ok',false,'state','UNAVAILABLE');
  end;

  v_plan := coalesce(v_v151->'plan','{}'::jsonb);
  v_jobid := nullif(v_plan->>'jobid','')::bigint;
  v_jobname := nullif(v_plan->>'jobname','');
  v_current_schedule := nullif(v_plan->>'current_schedule','');
  v_max_shift := coalesce((v_plan->>'max_abs_shift_minutes')::integer,0);

  if v_jobid is null or v_jobname is null then
    return jsonb_build_object(
      'ok',true,
      'version','v163.1-safe-alternative-minute-search-db-v2-fast-history',
      'generated_at',v_now,
      'state','NO_CANDIDATE',
      'search',jsonb_build_object('eligible_count',0,'alternatives','[]'::jsonb),
      'governance',jsonb_build_object(
        'action_permitted','WAIT',
        'capital_permission','0R',
        'live_order_routing',false,
        'automatic_rescheduling',false,
        'automatic_rollback',false
      ),
      'truth_label','SAFE_ALTERNATIVE_MINUTE_SEARCH_NOT_SCHEDULER_PERMISSION'
    );
  end if;

  select j.schedule
  into v_live_schedule
  from cron.job j
  where j.jobid=v_jobid
    and j.jobname=v_jobname
    and j.active;

  select count(*)
  into v_current_token_count
  from regexp_split_to_table(split_part(coalesce(v_current_schedule,''),' ',1), ',') t(token);

  if v_current_token_count<>1
     or split_part(coalesce(v_current_schedule,''),' ',1) !~ '^([0-9]|[1-5][0-9])$'
     or split_part(coalesce(v_live_schedule,''),' ',1) !~ '^([0-9]|[1-5][0-9])$'
     or v_live_schedule<>v_current_schedule
     or v_max_shift<=0 then
    return jsonb_build_object(
      'ok',true,
      'version','v163.1-safe-alternative-minute-search-db-v2-fast-history',
      'generated_at',v_now,
      'state',case when v_live_schedule<>v_current_schedule then 'CANDIDATE_LIVE_SCHEDULE_DRIFT' else 'UNSUPPORTED_OR_EMPTY_SEARCH_WINDOW' end,
      'candidate',jsonb_build_object(
        'jobid',v_jobid,
        'jobname',v_jobname,
        'live_schedule',v_live_schedule,
        'planner_current_schedule',v_current_schedule,
        'max_abs_shift_minutes',v_max_shift
      ),
      'search',jsonb_build_object('eligible_count',0,'alternatives','[]'::jsonb),
      'governance',jsonb_build_object(
        'action_permitted','WAIT',
        'capital_permission','0R',
        'live_order_routing',false,
        'automatic_rescheduling',false,
        'automatic_rollback',false
      ),
      'truth_label','SAFE_ALTERNATIVE_MINUTE_SEARCH_NOT_SCHEDULER_PERMISSION'
    );
  end if;

  v_current_minute := split_part(v_current_schedule,' ',1)::integer;

  with current_peers as (
    select j.jobid
    from cron.job j
    cross join lateral regexp_split_to_table(split_part(j.schedule,' ',1), ',') m(token)
    where j.active
      and j.jobid<>v_jobid
      and m.token ~ '^([0-9]|[1-5][0-9])$'
      and m.token::integer=v_current_minute
  )
  select count(*)::integer
  into v_current_peer_triggers
  from current_peers;

  select count(*)::integer
  into v_current_hist_starts
  from cron.job_run_details d
  where d.start_time>=v_now-interval '24 hours'
    and extract(minute from d.start_time)::integer=v_current_minute;

  with controlled as (
    select
      'V1511_OWNER_ANOMALY_SHIFT_001'::text as experiment_id,
      jobid,jobname,governed_schedule
    from private.v1511_controlled_shift_ledger
    where plan_id='V1511_OWNER_ANOMALY_SHIFT_001'
      and rolled_back_at is null

    union all

    select
      'V157_MEMBER_ALERT_SHIFT_001',
      jobid,jobname,governed_schedule
    from private.v157_controlled_shift_ledger
    where plan_id='V157_MEMBER_ALERT_SHIFT_001'
      and rolled_back_at is null
  ),
  controlled_minutes as (
    select
      c.experiment_id,
      c.jobid,
      c.jobname,
      (m.token)::integer as minute_of_hour
    from controlled c
    cross join lateral regexp_split_to_table(split_part(c.governed_schedule,' ',1), ',') m(token)
    where c.jobid<>v_jobid
      and m.token ~ '^([0-9]|[1-5][0-9])$'
  ),
  search_minutes as (
    select generate_series(
      greatest(0,v_current_minute-v_max_shift),
      least(59,v_current_minute+v_max_shift)
    )::integer as minute_of_hour
  ),
  density as (
    select
      sm.minute_of_hour,
      count(j.jobid) filter(where j.jobid<>v_jobid)::integer as peer_triggers
    from search_minutes sm
    left join cron.job j
      on j.active
     and j.jobid<>v_jobid
     and exists(
       select 1
       from regexp_split_to_table(split_part(j.schedule,' ',1), ',') m(token)
       where m.token ~ '^([0-9]|[1-5][0-9])$'
         and m.token::integer=sm.minute_of_hour
     )
    where sm.minute_of_hour<>v_current_minute
    group by sm.minute_of_hour
  ),
  history_rollup as (
    select
      extract(minute from d.start_time)::integer as minute_of_hour,
      count(*)::integer as starts_24h
    from cron.job_run_details d
    where d.start_time>=v_now-interval '24 hours'
    group by 1
  ),
  historical as (
    select
      sm.minute_of_hour,
      coalesce(hr.starts_24h,0)::integer as starts_24h
    from search_minutes sm
    left join history_rollup hr using(minute_of_hour)
    where sm.minute_of_hour<>v_current_minute
  ),
  candidates as (
    select
      d.minute_of_hour,
      d.peer_triggers,
      h.starts_24h,
      d.minute_of_hour-v_current_minute as delta_minutes,
      abs(d.minute_of_hour-v_current_minute) as abs_delta_minutes,
      exists(
        select 1 from controlled_minutes cm
        where cm.minute_of_hour=d.minute_of_hour
      ) as controlled_reserved,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'experiment_id',cm.experiment_id,
          'jobid',cm.jobid,
          'jobname',cm.jobname
        ) order by cm.experiment_id)
        from controlled_minutes cm
        where cm.minute_of_hour=d.minute_of_hour
      ),'[]'::jsonb) as controlled_reservations,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'jobid',j.jobid,
          'jobname',j.jobname,
          'schedule',j.schedule
        ) order by j.jobname)
        from cron.job j
        where j.active
          and j.jobid<>v_jobid
          and exists(
            select 1
            from regexp_split_to_table(split_part(j.schedule,' ',1), ',') m(token)
            where m.token ~ '^([0-9]|[1-5][0-9])$'
              and m.token::integer=d.minute_of_hour
          )
      ),'[]'::jsonb) as peers
    from density d
    join historical h using(minute_of_hour)
  ),
  eligible as (
    select *
    from candidates
    where not controlled_reserved
      and peer_triggers<v_current_peer_triggers
  ),
  ranked as (
    select
      e.*,
      row_number() over(
        order by peer_triggers asc,abs_delta_minutes asc,starts_24h asc,minute_of_hour asc
      ) as rank
    from eligible e
  )
  select
    count(*)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'rank',rank,
      'minute_of_hour',minute_of_hour,
      'recommended_schedule',minute_of_hour::text || ' * * * *',
      'delta_minutes',delta_minutes,
      'abs_delta_minutes',abs_delta_minutes,
      'peer_triggers',peer_triggers,
      'peer_improvement',v_current_peer_triggers-peer_triggers,
      'starts_24h',starts_24h,
      'controlled_reserved',controlled_reserved,
      'controlled_reservations',controlled_reservations,
      'peers',peers
    ) order by rank),'[]'::jsonb),
    (
      select jsonb_build_object(
        'rank',r.rank,
        'minute_of_hour',r.minute_of_hour,
        'recommended_schedule',r.minute_of_hour::text || ' * * * *',
        'rollback_schedule',v_current_schedule,
        'delta_minutes',r.delta_minutes,
        'abs_delta_minutes',r.abs_delta_minutes,
        'peer_triggers',r.peer_triggers,
        'peer_improvement',v_current_peer_triggers-r.peer_triggers,
        'starts_24h',r.starts_24h,
        'controlled_reserved',r.controlled_reserved,
        'controlled_reservations',r.controlled_reservations,
        'peers',r.peers,
        'apply',false,
        'requires_human_review',true
      )
      from ranked r
      where r.rank=1
    )
  into v_eligible_count,v_alternatives,v_best
  from ranked;

  if v_eligible_count>0 and v_best is not null then
    v_state := 'SAFE_ALTERNATIVE_FOUND';
  else
    v_state := 'NO_SAFE_ALTERNATIVE_IN_ALLOWED_WINDOW';
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','v163.1-safe-alternative-minute-search-db-v2-fast-history',
    'generated_at',v_now,
    'state',v_state,
    'candidate',jsonb_build_object(
      'jobid',v_jobid,
      'jobname',v_jobname,
      'current_schedule',v_current_schedule,
      'live_schedule',v_live_schedule,
      'current_minute',v_current_minute,
      'max_abs_shift_minutes',v_max_shift,
      'current_peer_triggers',v_current_peer_triggers,
      'current_starts_24h',v_current_hist_starts,
      'receipt_coverage_pct',v_plan->'receipt_coverage_pct',
      'receipt_success_pct',v_plan->'receipt_success_pct'
    ),
    'search',jsonb_build_object(
      'eligible_count',v_eligible_count,
      'ranking','PEER_TRIGGERS_ASC_THEN_ABS_SHIFT_ASC_THEN_24H_STARTS_ASC',
      'requires_strict_peer_improvement',true,
      'controlled_experiment_minutes_reserved',true,
      'alternatives',v_alternatives
    ),
    'recommended_alternative',v_best,
    'planner_context',jsonb_build_object(
      'v151_state',v_v151->>'state',
      'original_recommended_schedule',v_plan->>'recommended_schedule',
      'original_estimated_relief_index',v_plan->'estimated_relief_index',
      'note','V163 does not mutate or overwrite V151; it provides a current-graph alternative shadow'
    ),
    'governance',jsonb_build_object(
      'action_permitted','WAIT',
      'capital_permission','0R',
      'live_order_routing',false,
      'automatic_rescheduling',false,
      'automatic_rollback',false,
      'automatic_policy_promotion',false,
      'alternative_search_can_unlock_capital',false
    ),
    'truth_label','SAFE_ALTERNATIVE_MINUTE_SEARCH_NOT_SCHEDULER_PERMISSION'
  );
end;
$function$;

revoke all on function public.get_v163_safe_alternative_minute_search() from public;
revoke all on function public.get_v163_safe_alternative_minute_search() from anon;
revoke all on function public.get_v163_safe_alternative_minute_search() from authenticated;
grant execute on function public.get_v163_safe_alternative_minute_search() to service_role;
