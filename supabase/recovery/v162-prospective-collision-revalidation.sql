-- V162 Prospective Collision Revalidation
-- Revalidates the V151 next-candidate recommendation against the current live cron graph.
-- Read-only. It never mutates cron, capital permission, or execution state.

create or replace function public.get_v162_prospective_collision_revalidation()
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
  v_live_schedule text;
  v_current_schedule text;
  v_recommended_schedule text;

  v_current_minutes integer[];
  v_proposed_minutes integer[];
  v_current_tokens integer := 0;
  v_proposed_tokens integer := 0;
  v_parseable boolean := false;
  v_exact_match boolean := false;
  v_schedule_changes boolean := false;

  v_current_peer_triggers integer := 0;
  v_proposed_peer_triggers integer := 0;
  v_live_density_improves boolean := false;

  v_controlled_overlaps jsonb := '[]'::jsonb;
  v_controlled_overlap_count integer := 0;
  v_current_peers jsonb := '[]'::jsonb;
  v_proposed_peers jsonb := '[]'::jsonb;

  v_historical_current_starts integer := 0;
  v_historical_proposed_starts integer := 0;

  v_clear boolean := false;
  v_state text := 'NO_CANDIDATE';
  v_blockers jsonb := '[]'::jsonb;
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
  v_recommended_schedule := nullif(v_plan->>'recommended_schedule','');

  if v_jobid is null or v_jobname is null then
    return jsonb_build_object(
      'ok',true,
      'version','v162-prospective-collision-revalidation-db-v1',
      'generated_at',v_now,
      'state','NO_CANDIDATE',
      'revalidation',jsonb_build_object(
        'clear',false,
        'blockers',jsonb_build_array('NO_NEXT_SINGLE_CANDIDATE')
      ),
      'governance',jsonb_build_object(
        'action_permitted','WAIT',
        'capital_permission','0R',
        'live_order_routing',false,
        'automatic_rescheduling',false,
        'automatic_rollback',false
      ),
      'truth_label','PROSPECTIVE_COLLISION_REVALIDATION_NOT_SCHEDULER_PERMISSION'
    );
  end if;

  select j.schedule
  into v_live_schedule
  from cron.job j
  where j.jobid=v_jobid
    and j.jobname=v_jobname
    and j.active;

  v_exact_match := v_live_schedule is not null and v_live_schedule=v_current_schedule;

  select count(*)
  into v_current_tokens
  from regexp_split_to_table(split_part(coalesce(v_current_schedule,''),' ',1), ',') as t(token);

  select count(*)
  into v_proposed_tokens
  from regexp_split_to_table(split_part(coalesce(v_recommended_schedule,''),' ',1), ',') as t(token);

  select array_agg(token::integer order by token::integer)
  into v_current_minutes
  from regexp_split_to_table(split_part(coalesce(v_current_schedule,''),' ',1), ',') as t(token)
  where token ~ '^([0-9]|[1-5][0-9])$';

  select array_agg(token::integer order by token::integer)
  into v_proposed_minutes
  from regexp_split_to_table(split_part(coalesce(v_recommended_schedule,''),' ',1), ',') as t(token)
  where token ~ '^([0-9]|[1-5][0-9])$';

  v_parseable :=
    v_current_tokens>0
    and v_proposed_tokens>0
    and v_current_tokens=coalesce(cardinality(v_current_minutes),0)
    and v_proposed_tokens=coalesce(cardinality(v_proposed_minutes),0);

  v_schedule_changes :=
    v_parseable
    and v_current_minutes is distinct from v_proposed_minutes;

  if v_parseable then
    with peers as (
      select j.jobid,j.jobname,j.schedule,(m.token)::integer as minute_of_hour
      from cron.job j
      cross join lateral regexp_split_to_table(split_part(j.schedule,' ',1), ',') as m(token)
      where j.active
        and j.jobid<>v_jobid
        and m.token ~ '^([0-9]|[1-5][0-9])$'
        and (m.token)::integer=any(v_current_minutes)
    )
    select
      count(*)::int,
      coalesce(jsonb_agg(jsonb_build_object(
        'jobid',jobid,
        'jobname',jobname,
        'schedule',schedule,
        'minute_of_hour',minute_of_hour
      ) order by minute_of_hour,jobname),'[]'::jsonb)
    into v_current_peer_triggers,v_current_peers
    from peers;

    with peers as (
      select j.jobid,j.jobname,j.schedule,(m.token)::integer as minute_of_hour
      from cron.job j
      cross join lateral regexp_split_to_table(split_part(j.schedule,' ',1), ',') as m(token)
      where j.active
        and j.jobid<>v_jobid
        and m.token ~ '^([0-9]|[1-5][0-9])$'
        and (m.token)::integer=any(v_proposed_minutes)
    )
    select
      count(*)::int,
      coalesce(jsonb_agg(jsonb_build_object(
        'jobid',jobid,
        'jobname',jobname,
        'schedule',schedule,
        'minute_of_hour',minute_of_hour
      ) order by minute_of_hour,jobname),'[]'::jsonb)
    into v_proposed_peer_triggers,v_proposed_peers
    from peers;

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
    overlaps as (
      select
        c.experiment_id,
        c.jobid,
        c.jobname,
        c.governed_schedule,
        (m.token)::integer as minute_of_hour
      from controlled c
      cross join lateral regexp_split_to_table(split_part(c.governed_schedule,' ',1), ',') as m(token)
      where c.jobid<>v_jobid
        and m.token ~ '^([0-9]|[1-5][0-9])$'
        and (m.token)::integer=any(v_proposed_minutes)
    )
    select
      count(*)::int,
      coalesce(jsonb_agg(jsonb_build_object(
        'experiment_id',experiment_id,
        'jobid',jobid,
        'jobname',jobname,
        'governed_schedule',governed_schedule,
        'minute_of_hour',minute_of_hour
      ) order by minute_of_hour,experiment_id),'[]'::jsonb)
    into v_controlled_overlap_count,v_controlled_overlaps
    from overlaps;

    select count(*)::int
    into v_historical_current_starts
    from cron.job_run_details d
    where d.start_time>=v_now-interval '24 hours'
      and extract(minute from d.start_time)::integer=any(v_current_minutes);

    select count(*)::int
    into v_historical_proposed_starts
    from cron.job_run_details d
    where d.start_time>=v_now-interval '24 hours'
      and extract(minute from d.start_time)::integer=any(v_proposed_minutes);
  end if;

  v_live_density_improves :=
    v_parseable
    and v_proposed_peer_triggers<v_current_peer_triggers;

  if not v_exact_match then
    v_blockers := v_blockers || jsonb_build_array('CANDIDATE_LIVE_SCHEDULE_DRIFT');
  end if;
  if not v_parseable then
    v_blockers := v_blockers || jsonb_build_array('UNSUPPORTED_CRON_MINUTE_PATTERN');
  end if;
  if v_parseable and not v_schedule_changes then
    v_blockers := v_blockers || jsonb_build_array('PROPOSED_SCHEDULE_DOES_NOT_CHANGE_MINUTES');
  end if;
  if v_controlled_overlap_count>0 then
    v_blockers := v_blockers || jsonb_build_array('PROPOSED_MINUTE_RESERVED_BY_ACTIVE_CONTROLLED_EXPERIMENT');
  end if;
  if v_parseable and not v_live_density_improves then
    v_blockers := v_blockers || jsonb_build_array('NO_LIVE_PEER_DENSITY_IMPROVEMENT');
  end if;

  v_clear :=
    v_exact_match
    and v_parseable
    and v_schedule_changes
    and v_controlled_overlap_count=0
    and v_live_density_improves;

  if not v_exact_match then
    v_state := 'REJECTED_CANDIDATE_SCHEDULE_DRIFT';
  elsif not v_parseable then
    v_state := 'REJECTED_UNSUPPORTED_CRON_PATTERN';
  elsif not v_schedule_changes then
    v_state := 'REJECTED_NO_SCHEDULE_CHANGE';
  elsif v_controlled_overlap_count>0 then
    v_state := 'REJECTED_CONTROLLED_EXPERIMENT_MINUTE_COLLISION';
  elsif not v_live_density_improves then
    v_state := 'REJECTED_NO_LIVE_DENSITY_IMPROVEMENT';
  else
    v_state := 'REVALIDATION_CLEAR_FOR_HUMAN_REVIEW';
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','v162-prospective-collision-revalidation-db-v1',
    'generated_at',v_now,
    'state',v_state,
    'candidate',jsonb_build_object(
      'jobid',v_jobid,
      'jobname',v_jobname,
      'live_schedule',v_live_schedule,
      'planner_current_schedule',v_current_schedule,
      'recommended_schedule',v_recommended_schedule,
      'exact_live_schedule_match',v_exact_match,
      'current_minutes',to_jsonb(v_current_minutes),
      'proposed_minutes',to_jsonb(v_proposed_minutes),
      'minute_pattern_parseable',v_parseable
    ),
    'live_density',jsonb_build_object(
      'current_peer_triggers',v_current_peer_triggers,
      'proposed_peer_triggers',v_proposed_peer_triggers,
      'peer_trigger_delta',v_proposed_peer_triggers-v_current_peer_triggers,
      'improves',v_live_density_improves,
      'current_peers',v_current_peers,
      'proposed_peers',v_proposed_peers
    ),
    'controlled_experiment_reservations',jsonb_build_object(
      'overlap_count',v_controlled_overlap_count,
      'clear',v_controlled_overlap_count=0,
      'overlaps',v_controlled_overlaps
    ),
    'historical_context',jsonb_build_object(
      'window_hours',24,
      'current_minute_starts',v_historical_current_starts,
      'proposed_minute_starts',v_historical_proposed_starts,
      'note','HISTORICAL_LOAD_IS_DIAGNOSTIC_ONLY; LIVE_GRAPH_AND_CONTROLLED_RESERVATIONS_ARE_HARD_GATES'
    ),
    'revalidation',jsonb_build_object(
      'clear',v_clear,
      'blockers',v_blockers,
      'requires_strict_live_density_improvement',true,
      'controlled_experiment_minutes_reserved',true,
      'exact_live_schedule_match_required',true
    ),
    'planner_context',jsonb_build_object(
      'v151_state',v_v151->>'state',
      'estimated_relief_index',v_plan->'estimated_relief_index',
      'receipt_coverage_pct',v_plan->'receipt_coverage_pct',
      'receipt_success_pct',v_plan->'receipt_success_pct'
    ),
    'governance',jsonb_build_object(
      'action_permitted','WAIT',
      'capital_permission','0R',
      'live_order_routing',false,
      'automatic_rescheduling',false,
      'automatic_rollback',false,
      'automatic_policy_promotion',false,
      'revalidation_can_unlock_capital',false
    ),
    'truth_label','PROSPECTIVE_COLLISION_REVALIDATION_NOT_SCHEDULER_PERMISSION'
  );
end;
$function$;

revoke all on function public.get_v162_prospective_collision_revalidation() from public;
revoke all on function public.get_v162_prospective_collision_revalidation() from anon;
revoke all on function public.get_v162_prospective_collision_revalidation() from authenticated;
grant execute on function public.get_v162_prospective_collision_revalidation() to service_role;
