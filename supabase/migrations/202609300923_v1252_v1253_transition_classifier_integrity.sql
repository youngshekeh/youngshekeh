-- V125.2 / V125.3 integrity upgrade
-- 1) Allow multiple independent semantic events per snapshot pair.
-- 2) Version Gold review/reputation classification and use explicit event semantics only.

create or replace function public.detect_v123_gold_transitions()
returns jsonb
language plpgsql
set search_path to 'public','extensions','pg_temp'
as $$
declare
  v_inserted integer := 0;
begin
  with ordered as (
    select
      s.*,
      lag(s.id) over(order by s.id) as prev_id,
      lag(s.market_time) over(order by s.id) as prev_market_time,
      lag(s.desk_state) over(order by s.id) as prev_desk_state,
      lag(s.session_state) over(order by s.id) as prev_session_state,
      lag(s.daily_bias) over(order by s.id) as prev_daily_bias,
      lag(s.daily_structure) over(order by s.id) as prev_daily_structure,
      lag(s.long_state) over(order by s.id) as prev_long_state,
      lag(s.short_state) over(order by s.id) as prev_short_state,
      lag(s.futures_price) over(order by s.id) as prev_futures_price,
      lag(s.system_action) over(order by s.id) as prev_system_action,
      lag(s.system_capital_permission) over(order by s.id) as prev_capital_permission,
      lag(s.long_retest_high) over(order by s.id) as prev_long_retest_high,
      lag(s.short_failure_threshold) over(order by s.id) as prev_short_failure_threshold
    from public.gold_live_desk_snapshots s
  ),
  base as (
    select *,
      (market_time is not null and futures_price is not null and desk_state<>'WAIT_DATA') as cur_good,
      (prev_market_time is not null and prev_futures_price is not null and prev_desk_state<>'WAIT_DATA') as prev_good
    from ordered
    where prev_id is not null
  ),
  events as (
    select
      prev_id as from_snapshot_id,id as to_snapshot_id,
      prev_market_time as from_market_time,market_time as to_market_time,
      'DATA_QUALITY'::text as event_class,'DATA_UNAVAILABLE'::text as transition_code,'BLOCKER'::text as severity,
      prev_desk_state as from_state,desk_state as to_state,
      prev_futures_price as from_price,futures_price as to_price,
      case when prev_futures_price is not null and futures_price is not null then futures_price-prev_futures_price end as price_delta,
      prev_capital_permission as capital_before,system_capital_permission as capital_after,
      jsonb_build_object(
        'market_time_present',market_time is not null,
        'price_present',futures_price is not null,
        'desk_state',desk_state
      ) as changes
    from base where not cur_good

    union all
    select
      prev_id,id,prev_market_time,market_time,
      'DATA_QUALITY','DATA_RECOVERED','INFO',
      prev_desk_state,desk_state,prev_futures_price,futures_price,
      case when prev_futures_price is not null and futures_price is not null then futures_price-prev_futures_price end,
      prev_capital_permission,system_capital_permission,
      jsonb_build_object(
        'recovered_to_market_time',market_time,
        'recovered_to_price',futures_price,
        'desk_state',desk_state
      )
    from base where cur_good and not prev_good

    union all
    select
      prev_id,id,prev_market_time,market_time,
      'PERMISSION','PERMISSION_CHANGED','BLOCKER',
      prev_desk_state,desk_state,prev_futures_price,futures_price,
      futures_price-prev_futures_price,
      prev_capital_permission,system_capital_permission,
      jsonb_build_object(
        'action_from',prev_system_action,'action_to',system_action,
        'capital_from',prev_capital_permission,'capital_to',system_capital_permission
      )
    from base
    where cur_good and prev_good
      and (system_capital_permission is distinct from prev_capital_permission
        or system_action is distinct from prev_system_action)

    union all
    select
      prev_id,id,prev_market_time,market_time,
      'SETUP','DESK_STATE_CHANGED',
      case when desk_state like '%MANUAL_REVIEW%' then 'REVIEW_REQUIRED'
           when desk_state like 'WATCH_%' then 'WATCH' else 'INFO' end,
      prev_desk_state,desk_state,prev_futures_price,futures_price,
      futures_price-prev_futures_price,
      prev_capital_permission,system_capital_permission,
      jsonb_build_object('desk_from',prev_desk_state,'desk_to',desk_state)
    from base
    where cur_good and prev_good and desk_state is distinct from prev_desk_state

    union all
    select
      prev_id,id,prev_market_time,market_time,
      'SETUP','LONG_STATE_CHANGED',
      case when long_state like '%MANUAL_REVIEW%' then 'REVIEW_REQUIRED'
           when long_state like 'WATCH_%' then 'WATCH' else 'INFO' end,
      prev_desk_state,desk_state,prev_futures_price,futures_price,
      futures_price-prev_futures_price,
      prev_capital_permission,system_capital_permission,
      jsonb_build_object('long_from',prev_long_state,'long_to',long_state)
    from base
    where cur_good and prev_good and long_state is distinct from prev_long_state

    union all
    select
      prev_id,id,prev_market_time,market_time,
      'SETUP','SHORT_STATE_CHANGED',
      case when short_state like '%MANUAL_REVIEW%' then 'REVIEW_REQUIRED'
           when short_state like 'WATCH_%' then 'WATCH' else 'INFO' end,
      prev_desk_state,desk_state,prev_futures_price,futures_price,
      futures_price-prev_futures_price,
      prev_capital_permission,system_capital_permission,
      jsonb_build_object('short_from',prev_short_state,'short_to',short_state)
    from base
    where cur_good and prev_good and short_state is distinct from prev_short_state

    union all
    select
      prev_id,id,prev_market_time,market_time,
      'STRUCTURE','DAILY_STRUCTURE_CHANGED','WATCH',
      prev_desk_state,desk_state,prev_futures_price,futures_price,
      futures_price-prev_futures_price,
      prev_capital_permission,system_capital_permission,
      jsonb_build_object('structure_from',prev_daily_structure,'structure_to',daily_structure)
    from base
    where cur_good and prev_good and daily_structure is distinct from prev_daily_structure

    union all
    select
      prev_id,id,prev_market_time,market_time,
      'STRUCTURE','DAILY_BIAS_CHANGED','WATCH',
      prev_desk_state,desk_state,prev_futures_price,futures_price,
      futures_price-prev_futures_price,
      prev_capital_permission,system_capital_permission,
      jsonb_build_object('bias_from',prev_daily_bias,'bias_to',daily_bias)
    from base
    where cur_good and prev_good and daily_bias is distinct from prev_daily_bias

    union all
    select
      prev_id,id,prev_market_time,market_time,
      'SESSION','SESSION_CHANGED','INFO',
      prev_desk_state,desk_state,prev_futures_price,futures_price,
      futures_price-prev_futures_price,
      prev_capital_permission,system_capital_permission,
      jsonb_build_object('session_from',prev_session_state,'session_to',session_state)
    from base
    where cur_good and prev_good and session_state is distinct from prev_session_state

    union all
    select
      prev_id,id,prev_market_time,market_time,
      'LEVEL','LONG_RETEST_ZONE_ENTERED','WATCH',
      prev_desk_state,desk_state,prev_futures_price,futures_price,
      futures_price-prev_futures_price,
      prev_capital_permission,system_capital_permission,
      jsonb_build_object('retest_low',long_retest_low,'retest_high',long_retest_high,'price',futures_price)
    from base
    where cur_good and prev_good
      and prev_long_retest_high is not null
      and long_retest_low is not null and long_retest_high is not null
      and prev_futures_price > prev_long_retest_high
      and futures_price between least(long_retest_low,long_retest_high) and greatest(long_retest_low,long_retest_high)

    union all
    select
      prev_id,id,prev_market_time,market_time,
      'LEVEL','SHORT_FAILURE_THRESHOLD_BREACHED','WATCH',
      prev_desk_state,desk_state,prev_futures_price,futures_price,
      futures_price-prev_futures_price,
      prev_capital_permission,system_capital_permission,
      jsonb_build_object('failure_threshold',short_failure_threshold,'price',futures_price)
    from base
    where cur_good and prev_good
      and prev_short_failure_threshold is not null
      and short_failure_threshold is not null
      and prev_futures_price > prev_short_failure_threshold
      and futures_price <= short_failure_threshold
  )
  insert into public.gold_live_desk_transitions(
    from_snapshot_id,to_snapshot_id,from_market_time,to_market_time,
    event_class,transition_code,severity,from_state,to_state,
    from_price,to_price,price_delta,capital_before,capital_after,
    changes,transition_sha256
  )
  select
    e.from_snapshot_id,e.to_snapshot_id,e.from_market_time,e.to_market_time,
    e.event_class,e.transition_code,e.severity,e.from_state,e.to_state,
    e.from_price,e.to_price,e.price_delta,e.capital_before,e.capital_after,
    e.changes,
    encode(extensions.digest(
      convert_to(concat_ws('|',
        e.from_snapshot_id::text,e.to_snapshot_id::text,e.event_class,e.transition_code,e.severity,
        coalesce(e.from_state,''),coalesce(e.to_state,''),
        coalesce(e.from_price::text,''),coalesce(e.to_price::text,''),
        coalesce(e.capital_before,''),coalesce(e.capital_after,''),e.changes::text
      ),'UTF8'),'sha256'),'hex')
  from events e
  on conflict(from_snapshot_id,to_snapshot_id,transition_code) do nothing;

  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'ok',true,
    'version','v125.2-multi-event-transition-detector-v2',
    'transitions_inserted',v_inserted,
    'total_transitions',(select count(*) from public.gold_live_desk_transitions),
    'multi_event_pairs',(
      select count(*) from (
        select from_snapshot_id,to_snapshot_id
        from public.gold_live_desk_transitions
        group by from_snapshot_id,to_snapshot_id
        having count(*)>1
      ) q
    ),
    'latest_snapshot_id',(select max(id) from public.gold_live_desk_snapshots),
    'checked_at',now()
  );
end;
$$;

revoke all on function public.detect_v123_gold_transitions() from public, anon, authenticated;
grant execute on function public.detect_v123_gold_transitions() to service_role;

alter table public.gold_trigger_review_requests
  add column if not exists classifier_version text not null default 'v125.1-legacy';

alter table public.gold_signal_reputation_snapshots
  add column if not exists classifier_version text not null default 'v125.1-legacy';

alter table public.gold_trigger_review_requests
  drop constraint if exists gold_trigger_review_requests_transition_id_key;

alter table public.gold_signal_reputation_snapshots
  drop constraint if exists gold_signal_reputation_snapsh_signal_key_horizon_minutes_so_key;

create unique index if not exists gold_trigger_review_requests_transition_classifier_uidx
  on public.gold_trigger_review_requests(transition_id,classifier_version);

create unique index if not exists gold_signal_reputation_classifier_signal_outcome_uidx
  on public.gold_signal_reputation_snapshots(classifier_version,signal_key,horizon_minutes,source_outcome_max_id);

create index if not exists gold_trigger_review_requests_classifier_idx
  on public.gold_trigger_review_requests(classifier_version,requested_at desc);

create index if not exists gold_signal_reputation_classifier_idx
  on public.gold_signal_reputation_snapshots(classifier_version,evaluated_at desc);

create or replace function public.capture_v125_gold_review_requests()
returns jsonb
language plpgsql
set search_path to 'public','extensions','pg_temp'
as $$
declare
  t record;
  v_classifier constant text := 'v125.3-event-aware-v2';
  v_direction text;
  v_signal_state text;
  v_signal_key text;
  v_stage text;
  v_reason jsonb;
  v_inserted integer := 0;
begin
  for t in
    select *
    from public.gold_live_desk_transitions x
    where x.event_class in ('SETUP','LEVEL','STRUCTURE')
      and not exists (
        select 1
        from public.gold_trigger_review_requests r
        where r.transition_id=x.id
          and r.classifier_version=v_classifier
      )
    order by x.id
  loop
    v_signal_state:=case t.transition_code
      when 'DESK_STATE_CHANGED' then coalesce(t.changes->>'desk_to',t.to_state,'STATE_UNKNOWN')
      when 'LONG_STATE_CHANGED' then coalesce(t.changes->>'long_to','STATE_UNKNOWN')
      when 'SHORT_STATE_CHANGED' then coalesce(t.changes->>'short_to','STATE_UNKNOWN')
      when 'DAILY_BIAS_CHANGED' then coalesce(t.changes->>'bias_to','STATE_UNKNOWN')
      when 'DAILY_STRUCTURE_CHANGED' then coalesce(t.changes->>'structure_to','STATE_UNKNOWN')
      when 'LONG_RETEST_ZONE_ENTERED' then 'LONG_RETEST_ZONE_ENTERED'
      when 'SHORT_FAILURE_THRESHOLD_BREACHED' then 'SHORT_FAILURE_THRESHOLD_BREACHED'
      else coalesce(t.to_state,'STATE_UNKNOWN')
    end;

    v_direction:=case
      when t.transition_code='LONG_RETEST_ZONE_ENTERED' then 'LONG'
      when t.transition_code='SHORT_FAILURE_THRESHOLD_BREACHED' then 'SHORT'
      when t.transition_code='DESK_STATE_CHANGED' and v_signal_state ilike '%LONG%' then 'LONG'
      when t.transition_code='DESK_STATE_CHANGED' and v_signal_state ilike '%SHORT%' then 'SHORT'
      when t.transition_code='LONG_STATE_CHANGED'
        and (v_signal_state ilike 'WATCH%' or v_signal_state ilike '%REVIEW%') then 'LONG'
      when t.transition_code='SHORT_STATE_CHANGED'
        and (v_signal_state ilike 'WATCH%' or v_signal_state ilike '%REVIEW%') then 'SHORT'
      when t.transition_code='DAILY_BIAS_CHANGED'
        and (v_signal_state ilike '%BULL%' or v_signal_state ilike '%UPSIDE%') then 'LONG'
      when t.transition_code='DAILY_BIAS_CHANGED'
        and (v_signal_state ilike '%BEAR%' or v_signal_state ilike '%DOWNSIDE%') then 'SHORT'
      when t.transition_code='DAILY_STRUCTURE_CHANGED'
        and (v_signal_state ilike '%BULL%' or v_signal_state ilike '%UPSIDE%') then 'LONG'
      when t.transition_code='DAILY_STRUCTURE_CHANGED'
        and (v_signal_state ilike '%BEAR%' or v_signal_state ilike '%DOWNSIDE%') then 'SHORT'
      else 'UNCLASSIFIED'
    end;

    v_signal_key:=concat_ws(':',t.transition_code,v_signal_state);

    v_stage:=case
      when t.severity='REVIEW_REQUIRED' then 'HUMAN_REVIEW_REQUIRED'
      when t.event_class='LEVEL' then 'LEVEL_REVIEW_CANDIDATE'
      when t.event_class='STRUCTURE' then 'STRUCTURE_REVIEW_CANDIDATE'
      else 'WATCH_REVIEW_CANDIDATE'
    end;

    v_reason:=jsonb_build_object(
      'classifier_version',v_classifier,
      'severity',t.severity,
      'event_class',t.event_class,
      'transition_code',t.transition_code,
      'semantic_state',v_signal_state,
      'from_state',t.from_state,
      'to_state',t.to_state,
      'changes',t.changes,
      'direction_inferred_only_from_explicit_event_semantics',true,
      'human_decision_required_for_promotion',true,
      'automatic_promotion',false
    );

    insert into public.gold_trigger_review_requests(
      transition_id,snapshot_id,market_time,event_class,transition_code,
      signal_key,direction,review_stage,source_state,source_price,
      request_reason,request_sha256,classifier_version
    ) values (
      t.id,t.to_snapshot_id,t.to_market_time,t.event_class,t.transition_code,
      v_signal_key,v_direction,v_stage,v_signal_state,t.to_price,
      v_reason,
      encode(extensions.digest(
        convert_to(concat_ws('|',
          v_classifier,t.id::text,t.to_snapshot_id::text,coalesce(t.to_market_time::text,''),
          t.event_class,t.transition_code,v_signal_key,v_direction,v_stage,
          v_signal_state,coalesce(t.to_price::text,''),v_reason::text
        ),'UTF8'),'sha256'),'hex'),
      v_classifier
    )
    on conflict(transition_id,classifier_version) do nothing;

    if found then v_inserted:=v_inserted+1; end if;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'version','v125.3-review-capture-event-aware-v2',
    'classifier_version',v_classifier,
    'inserted',v_inserted,
    'current_requests',(select count(*) from public.gold_trigger_review_requests where classifier_version=v_classifier),
    'directional_requests',(select count(*) from public.gold_trigger_review_requests where classifier_version=v_classifier and direction in ('LONG','SHORT')),
    'unclassified_requests',(select count(*) from public.gold_trigger_review_requests where classifier_version=v_classifier and direction='UNCLASSIFIED'),
    'human_review_events',(select count(*) from public.gold_human_review_events),
    'checked_at',now()
  );
end;
$$;

revoke all on function public.capture_v125_gold_review_requests() from public, anon, authenticated;
grant execute on function public.capture_v125_gold_review_requests() to service_role;

create or replace function public.refresh_v125_gold_signal_reputation()
returns jsonb
language plpgsql
set search_path to 'public','extensions','pg_temp'
as $$
declare
  g record;
  v_classifier constant text := 'v125.3-event-aware-v2';
  v_hit numeric;
  v_wilson numeric;
  v_state text;
  v_review_state text;
  v_inserted integer := 0;
begin
  perform public.capture_v125_gold_review_requests();

  for g in
    with linked as (
      select
        r.signal_key,r.transition_code,r.source_state,r.direction,o.horizon_minutes,o.id as outcome_id,
        case when r.direction='LONG' then o.price_delta else -o.price_delta end as signed_delta,
        case when r.direction='LONG' then o.up_excursion else o.down_excursion end as favorable_excursion,
        case when r.direction='LONG' then o.down_excursion else o.up_excursion end as adverse_excursion
      from public.gold_trigger_review_requests r
      join public.gold_live_desk_outcomes o on o.snapshot_id=r.snapshot_id
      where r.classifier_version=v_classifier
        and r.direction in ('LONG','SHORT')
    )
    select
      signal_key,transition_code,source_state,direction,horizon_minutes,
      count(*)::int as sample_count,
      count(*) filter(where signed_delta>0)::int as favorable_count,
      count(*) filter(where signed_delta<0)::int as adverse_count,
      count(*) filter(where signed_delta=0)::int as flat_count,
      avg(signed_delta)::numeric as avg_signed_delta,
      avg(favorable_excursion)::numeric as avg_favorable_excursion,
      avg(adverse_excursion)::numeric as avg_adverse_excursion,
      max(outcome_id)::bigint as source_outcome_max_id
    from linked
    group by signal_key,transition_code,source_state,direction,horizon_minutes
  loop
    v_hit:=case when g.sample_count>0 then g.favorable_count::numeric/g.sample_count::numeric else null end;

    v_wilson:=case when g.sample_count>0 then
      (v_hit+(1.96*1.96)/(2*g.sample_count)
       -1.96*sqrt((v_hit*(1-v_hit)/g.sample_count)+((1.96*1.96)/(4*g.sample_count*g.sample_count))))
      /(1+(1.96*1.96)/g.sample_count)
      else null end;

    v_state:=case
      when g.sample_count<10 then 'WITHHELD_SAMPLE_TOO_SMALL'
      when g.sample_count<30 then 'EARLY_REPUTATION_SAMPLE'
      when v_wilson>0.50 then 'MATURE_FAVORABLE_EVIDENCE'
      else 'MATURE_EDGE_NOT_PROVEN'
    end;

    v_review_state:=case
      when g.sample_count<10 then 'WITHHELD_UNDER_MINIMUM_N'
      when g.sample_count<30 then 'HUMAN_REVIEWABLE_EARLY_SAMPLE'
      else 'HUMAN_REVIEWABLE_MATURE_SAMPLE'
    end;

    insert into public.gold_signal_reputation_snapshots(
      signal_key,transition_code,source_state,direction,horizon_minutes,
      sample_count,favorable_count,adverse_count,flat_count,
      observed_hit_rate_pct,wilson_lower_pct,avg_signed_delta,
      avg_favorable_excursion,avg_adverse_excursion,source_outcome_max_id,
      reputation_state,evidence_review_state,automatic_weight,
      automatic_promotion,capital_permission,payload_sha256,classifier_version
    ) values (
      g.signal_key,g.transition_code,g.source_state,g.direction,g.horizon_minutes,
      g.sample_count,g.favorable_count,g.adverse_count,g.flat_count,
      round(v_hit*100,2),round(v_wilson*100,2),round(g.avg_signed_delta,4),
      round(g.avg_favorable_excursion,4),round(g.avg_adverse_excursion,4),g.source_outcome_max_id,
      v_state,v_review_state,null,false,'0R',
      encode(extensions.digest(
        convert_to(concat_ws('|',
          v_classifier,g.signal_key,g.transition_code,coalesce(g.source_state,''),g.direction,
          g.horizon_minutes::text,g.sample_count::text,g.favorable_count::text,
          g.adverse_count::text,g.flat_count::text,coalesce(round(v_hit*100,2)::text,''),
          coalesce(round(v_wilson*100,2)::text,''),coalesce(round(g.avg_signed_delta,4)::text,''),
          coalesce(round(g.avg_favorable_excursion,4)::text,''),coalesce(round(g.avg_adverse_excursion,4)::text,''),
          g.source_outcome_max_id::text,v_state,v_review_state,'0R'
        ),'UTF8'),'sha256'),'hex'),
      v_classifier
    )
    on conflict(classifier_version,signal_key,horizon_minutes,source_outcome_max_id) do nothing;

    if found then v_inserted:=v_inserted+1; end if;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'version','v125.3-signal-reputation-event-aware-v2',
    'classifier_version',v_classifier,
    'inserted',v_inserted,
    'current_reputation_snapshots',(select count(*) from public.gold_signal_reputation_snapshots where classifier_version=v_classifier),
    'latest_sample_max',(select coalesce(max(sample_count),0) from public.gold_signal_reputation_snapshots where classifier_version=v_classifier),
    'human_review_events',(select count(*) from public.gold_human_review_events),
    'automatic_promotion',false,
    'capital_permission','0R',
    'checked_at',now()
  );
end;
$$;

revoke all on function public.refresh_v125_gold_signal_reputation() from public, anon, authenticated;
grant execute on function public.refresh_v125_gold_signal_reputation() to service_role;
