-- V165 Safe-Alternative Admission Handoff
-- Routes a scheduler candidate to human review only after live revalidation.
-- Direct V151/V162 candidates remain preferred. V163 alternatives may be used only
-- when V162 was blocked specifically by live density or active controlled-minute collision.
-- Read-only. No cron mutation, rollback mutation, capital permission, or live order routing.

create or replace function public.get_v165_safe_alternative_admission_handoff()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','cron','pg_catalog','pg_temp'
as $function$
declare
  v_now timestamptz := now();
  v_v162 jsonb := '{}'::jsonb;
  v_v163 jsonb := '{}'::jsonb;
  v_direct_clear boolean := false;
  v_alt_allowed boolean := false;
  v_alt_clear boolean := false;
  v_alt_identity_match boolean := false;
  v_alt_schedule_match boolean := false;
  v_selected jsonb := null;
  v_route text := 'NONE';
  v_state text := 'NO_REVALIDATED_CANDIDATE';
  v_blockers jsonb := '[]'::jsonb;
begin
  begin
    v_v162 := public.get_v162_prospective_collision_revalidation();
  exception when others then
    v_v162 := jsonb_build_object('ok',false,'state','UNAVAILABLE');
  end;

  v_direct_clear :=
    coalesce(v_v162->>'state','')='REVALIDATION_CLEAR_FOR_HUMAN_REVIEW'
    and coalesce((v_v162->'revalidation'->>'clear')::boolean,false)
    and coalesce((v_v162->'candidate'->>'exact_live_schedule_match')::boolean,false);

  if v_direct_clear then
    v_route := 'DIRECT_V151_V162';
    v_state := 'HANDOFF_CLEAR_FOR_HUMAN_REVIEW';
    v_selected := jsonb_build_object(
      'jobid',v_v162->'candidate'->'jobid',
      'jobname',v_v162->'candidate'->>'jobname',
      'current_schedule',v_v162->'candidate'->>'planner_current_schedule',
      'live_schedule',v_v162->'candidate'->>'live_schedule',
      'recommended_schedule',v_v162->'candidate'->>'recommended_schedule',
      'rollback_schedule',v_v162->'candidate'->>'planner_current_schedule',
      'exact_live_schedule_match',true,
      'current_peer_triggers',v_v162->'live_density'->'current_peer_triggers',
      'proposed_peer_triggers',v_v162->'live_density'->'proposed_peer_triggers',
      'peer_trigger_delta',v_v162->'live_density'->'peer_trigger_delta',
      'controlled_overlap_count',v_v162->'controlled_experiment_reservations'->'overlap_count',
      'estimated_relief_index',v_v162->'planner_context'->'estimated_relief_index',
      'receipt_coverage_pct',v_v162->'planner_context'->'receipt_coverage_pct',
      'receipt_success_pct',v_v162->'planner_context'->'receipt_success_pct',
      'source','V162_DIRECT_REVALIDATION',
      'requires_human_review',true,
      'apply',false
    );
  else
    v_alt_allowed := coalesce(v_v162->>'state','') in (
      'REJECTED_CONTROLLED_EXPERIMENT_MINUTE_COLLISION',
      'REJECTED_NO_LIVE_DENSITY_IMPROVEMENT'
    )
    and coalesce((v_v162->'candidate'->>'exact_live_schedule_match')::boolean,false);

    if v_alt_allowed then
      begin
        v_v163 := public.get_v163_safe_alternative_minute_search();
      exception when others then
        v_v163 := jsonb_build_object('ok',false,'state','UNAVAILABLE');
      end;

      v_alt_identity_match :=
        nullif(v_v162->'candidate'->>'jobname','') is not null
        and v_v163->'candidate'->>'jobname'=v_v162->'candidate'->>'jobname'
        and coalesce((v_v163->'candidate'->>'jobid')::bigint,-1)
            =coalesce((v_v162->'candidate'->>'jobid')::bigint,-2);

      v_alt_schedule_match :=
        nullif(v_v163->'candidate'->>'live_schedule','') is not null
        and v_v163->'candidate'->>'live_schedule'=v_v163->'candidate'->>'current_schedule'
        and v_v163->'candidate'->>'current_schedule'=v_v162->'candidate'->>'planner_current_schedule';

      v_alt_clear :=
        coalesce(v_v163->>'state','')='SAFE_ALTERNATIVE_FOUND'
        and v_alt_identity_match
        and v_alt_schedule_match
        and nullif(v_v163->'recommended_alternative'->>'recommended_schedule','') is not null
        and v_v163->'recommended_alternative'->>'recommended_schedule'
            <>v_v163->'candidate'->>'current_schedule'
        and not coalesce((v_v163->'recommended_alternative'->>'controlled_reserved')::boolean,true)
        and coalesce((v_v163->'recommended_alternative'->>'peer_improvement')::integer,0)>0
        and coalesce((v_v163->'recommended_alternative'->>'requires_human_review')::boolean,false);

      if v_alt_clear then
        v_route := 'SAFE_ALTERNATIVE_V163';
        v_state := 'HANDOFF_CLEAR_FOR_HUMAN_REVIEW';
        v_selected := jsonb_build_object(
          'jobid',v_v163->'candidate'->'jobid',
          'jobname',v_v163->'candidate'->>'jobname',
          'current_schedule',v_v163->'candidate'->>'current_schedule',
          'live_schedule',v_v163->'candidate'->>'live_schedule',
          'recommended_schedule',v_v163->'recommended_alternative'->>'recommended_schedule',
          'rollback_schedule',v_v163->'recommended_alternative'->>'rollback_schedule',
          'exact_live_schedule_match',true,
          'current_peer_triggers',v_v163->'candidate'->'current_peer_triggers',
          'proposed_peer_triggers',v_v163->'recommended_alternative'->'peer_triggers',
          'peer_trigger_delta',
            coalesce((v_v163->'recommended_alternative'->>'peer_triggers')::integer,0)
            -coalesce((v_v163->'candidate'->>'current_peer_triggers')::integer,0),
          'controlled_overlap_count',0,
          'estimated_relief_index',v_v163->'planner_context'->'original_estimated_relief_index',
          'receipt_coverage_pct',v_v163->'candidate'->'receipt_coverage_pct',
          'receipt_success_pct',v_v163->'candidate'->'receipt_success_pct',
          'source','V163_SAFE_ALTERNATIVE',
          'alternative_rank',v_v163->'recommended_alternative'->'rank',
          'starts_24h',v_v163->'recommended_alternative'->'starts_24h',
          'requires_human_review',true,
          'apply',false
        );
      end if;
    end if;
  end if;

  if v_selected is null then
    if not coalesce((v_v162->'candidate'->>'exact_live_schedule_match')::boolean,false)
       and nullif(v_v162->'candidate'->>'jobname','') is not null then
      v_blockers := v_blockers || jsonb_build_array('LIVE_SCHEDULE_DRIFT_NOT_BYPASSABLE');
    end if;
    if not v_alt_allowed and not v_direct_clear then
      v_blockers := v_blockers || jsonb_build_array('V162_BLOCK_REASON_NOT_ELIGIBLE_FOR_ALTERNATIVE_ROUTING');
    end if;
    if v_alt_allowed and coalesce(v_v163->>'state','')<>'SAFE_ALTERNATIVE_FOUND' then
      v_blockers := v_blockers || jsonb_build_array('NO_SAFE_V163_ALTERNATIVE');
    end if;
    if v_alt_allowed and coalesce(v_v163->>'state','')='SAFE_ALTERNATIVE_FOUND' and not v_alt_identity_match then
      v_blockers := v_blockers || jsonb_build_array('V163_CANDIDATE_IDENTITY_MISMATCH');
    end if;
    if v_alt_allowed and coalesce(v_v163->>'state','')='SAFE_ALTERNATIVE_FOUND' and not v_alt_schedule_match then
      v_blockers := v_blockers || jsonb_build_array('V163_LIVE_SCHEDULE_MISMATCH');
    end if;
    if v_alt_allowed and coalesce(v_v163->>'state','')='SAFE_ALTERNATIVE_FOUND'
       and coalesce((v_v163->'recommended_alternative'->>'controlled_reserved')::boolean,true) then
      v_blockers := v_blockers || jsonb_build_array('V163_ALTERNATIVE_RESERVED');
    end if;
    if v_alt_allowed and coalesce(v_v163->>'state','')='SAFE_ALTERNATIVE_FOUND'
       and coalesce((v_v163->'recommended_alternative'->>'peer_improvement')::integer,0)<=0 then
      v_blockers := v_blockers || jsonb_build_array('V163_ALTERNATIVE_NO_STRICT_DENSITY_IMPROVEMENT');
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','v165-safe-alternative-admission-handoff-db-v1',
    'generated_at',v_now,
    'state',v_state,
    'route',v_route,
    'selected_candidate',v_selected,
    'revalidation',jsonb_build_object(
      'clear',v_selected is not null,
      'blockers',v_blockers,
      'direct_v162_clear',v_direct_clear,
      'alternative_routing_allowed',v_alt_allowed,
      'v163_identity_match',v_alt_identity_match,
      'v163_live_schedule_match',v_alt_schedule_match,
      'requires_exact_live_schedule_match',true,
      'requires_strict_live_density_improvement',true,
      'controlled_experiment_minutes_reserved',true,
      'human_review_required',true
    ),
    'direct_path',jsonb_build_object(
      'v162_state',v_v162->>'state',
      'v162_clear',v_v162->'revalidation'->'clear',
      'v162_blockers',v_v162->'revalidation'->'blockers',
      'original_recommended_schedule',v_v162->'candidate'->>'recommended_schedule'
    ),
    'alternative_path',jsonb_build_object(
      'v163_state',v_v163->>'state',
      'eligible_count',v_v163->'search'->'eligible_count',
      'recommended_schedule',v_v163->'recommended_alternative'->>'recommended_schedule',
      'peer_improvement',v_v163->'recommended_alternative'->'peer_improvement',
      'controlled_reserved',v_v163->'recommended_alternative'->'controlled_reserved'
    ),
    'runtime_budget',jsonb_build_object(
      'v162_calls',1,
      'v163_calls',case when v_alt_allowed and not v_direct_clear then 1 else 0 end,
      'bounded_fail_closed',true
    ),
    'governance',jsonb_build_object(
      'action_permitted','WAIT',
      'capital_permission','0R',
      'live_order_routing',false,
      'automatic_rescheduling',false,
      'automatic_rollback',false,
      'automatic_policy_promotion',false,
      'human_review_required',true,
      'handoff_can_unlock_capital',false
    ),
    'truth_label','SAFE_ALTERNATIVE_ADMISSION_HANDOFF_NOT_SCHEDULER_OR_TRADING_PERMISSION'
  );
end;
$function$;

revoke all on function public.get_v165_safe_alternative_admission_handoff() from public;
revoke all on function public.get_v165_safe_alternative_admission_handoff() from anon;
revoke all on function public.get_v165_safe_alternative_admission_handoff() from authenticated;
grant execute on function public.get_v165_safe_alternative_admission_handoff() to service_role;
