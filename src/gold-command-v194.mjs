const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const pick=(...v)=>v.find(x=>x!==null&&x!==undefined&&x!=='');
const ageSeconds=(now,value)=>{
  const t=Date.parse(String(value||''));
  return Number.isFinite(t)?Math.max(0,Math.round((now.getTime()-t)/1000)):null;
};
const component=(now,body,timeKeys=[])=>{
  const at=timeKeys.map(k=>body?.[k]).find(Boolean)??body?.generated_at??body?.checked_at??null;
  return {
    ok:body?.ok===true,
    state:pick(body?.state,'UNKNOWN'),
    version:pick(body?.version,body?.public_version,'UNKNOWN'),
    observed_at:at,
    age_seconds:ageSeconds(now,at)
  };
};

export function buildGoldCommandSnapshot({
  now=new Date(),
  live={},
  signal={},
  lifecycle={},
  watch={},
  ledger={},
  router={}
}={}){
  const signalDay=pick(signal?.signal_day?.state,lifecycle?.signal_day?.state,'UNKNOWN');
  const signalDayScore=num(pick(signal?.signal_day?.score,lifecycle?.signal_day?.score));
  const signalTime=pick(signal?.signal_time?.state,lifecycle?.signal_time?.state,'UNKNOWN');
  const direction=pick(signal?.signal_time?.direction_candidate,lifecycle?.signal_time?.direction_candidate,watch?.context?.direction_candidate,'NEUTRAL');
  const lifecycleStage=pick(lifecycle?.lifecycle?.stage,watch?.context?.lifecycle_stage,'UNKNOWN');
  const anchorState=pick(live?.state,lifecycle?.anchor?.state,signal?.live_anchor?.state,'UNAVAILABLE');
  const liveFresh=live?.ok===true&&live?.state==='BROKER_LIVE'&&live?.quality?.fresh===true&&num(live?.quote?.mid)!==null;
  const anchorPrice=liveFresh?num(live?.quote?.mid):num(pick(lifecycle?.anchor?.price,signal?.live_anchor?.price));
  const review=watch?.review_gate?.requirements??{};
  const next=watch?.next_signal_window?.next??null;

  const components={
    live_xauusd:component(now,live,['checked_at']),
    signal_map:component(now,signal,['generated_at']),
    lifecycle:component(now,lifecycle,['generated_at']),
    trigger_watch:component(now,watch,['generated_at']),
    event_ledger:component(now,ledger,['generated_at','latest_event_at']),
    alert_router:component(now,router,['generated_at','latest_route_at']),
    owner_alert_inbox:{
      ok:true,state:'AAL2_OWNER_ONLY',version:'v193-owner-gold-alert-inbox-v1',
      observed_at:null,age_seconds:null,public_payload:false
    }
  };

  const coreKeys=['signal_map','lifecycle','trigger_watch','event_ledger','alert_router'];
  const unavailable=coreKeys.filter(k=>components[k]?.ok!==true);
  const blockers=[];
  for(const k of unavailable) blockers.push(`UPSTREAM_${k.toUpperCase()}_UNAVAILABLE`);
  if(!liveFresh) blockers.push('FRESH_BROKER_XAUUSD');
  if(signalDay!=='SIGNAL_DAY_CONFIRMED') blockers.push('SIGNAL_DAY_NOT_CONFIRMED');
  if(signalTime!=='ACTIVE_SIGNAL_TIME') blockers.push('SIGNAL_TIME_NOT_ACTIVE');
  if(review?.liquidity_transition_resolved!==true) blockers.push('LIQUIDITY_TRANSITION_UNRESOLVED');

  const reviewReady=unavailable.length===0
    &&watch?.review_gate?.ready===true
    &&liveFresh
    &&signalDay==='SIGNAL_DAY_CONFIRMED'
    &&signalTime==='ACTIVE_SIGNAL_TIME'
    &&review?.liquidity_transition_resolved===true;

  let state='WATCHING_LIFECYCLE';
  if(unavailable.length) state='DATA_DEGRADED';
  else if(reviewReady) state='HUMAN_REVIEW_READY';
  else if(!liveFresh) state='WAITING_FOR_LIVE_XAUUSD';
  else if(signalDay!=='SIGNAL_DAY_CONFIRMED') state='WAITING_FOR_SIGNAL_DAY';
  else if(signalTime!=='ACTIVE_SIGNAL_TIME') state='WAITING_FOR_SIGNAL_TIME';
  else if(review?.liquidity_transition_resolved!==true) state='WAITING_FOR_LIQUIDITY_TRANSITION';

  const events=Array.isArray(ledger?.events)?ledger.events:[];
  const latestEvent=events[0]??null;
  const zones=Array.isArray(signal?.tradeable_zones?.zones)?signal.tradeable_zones.zones:[];
  const zoneSummary=Object.fromEntries(zones.map(z=>[
    String(z?.timeframe||'UNKNOWN').toLowerCase(),
    {
      state:z?.state??'UNKNOWN',
      lower_zone:z?.lower_zone??null,
      equilibrium_zone:z?.equilibrium_zone??null,
      upper_zone:z?.upper_zone??null,
      position_pct:num(z?.position_pct)
    }
  ]));

  return {
    ok:unavailable.length===0,
    version:'v194-gold-command-snapshot-v1',
    generated_at:now.toISOString(),
    symbol:'XAUUSD',
    state,
    command:{
      live_market_state:live?.state??'UNAVAILABLE',
      live_price:liveFresh?anchorPrice:null,
      structural_anchor:anchorPrice,
      anchor_state:anchorState,
      signal_day:signalDay,
      signal_day_score:signalDayScore,
      signal_time:signalTime,
      direction_candidate:direction,
      lifecycle_stage:lifecycleStage,
      next_signal_window:next,
      tradeable_zones:zoneSummary
    },
    evidence:{
      event_ledger_state:ledger?.state??'UNAVAILABLE',
      event_count:num(ledger?.counts?.events)??0,
      latest_event_at:ledger?.latest_event_at??latestEvent?.event_at??null,
      latest_event:latestEvent?{
        event_key:latestEvent?.event_key??null,
        previous_state:latestEvent?.previous_state??null,
        event_state:latestEvent?.event_state??null,
        condition:latestEvent?.condition??null
      }:null,
      alert_router_state:router?.state??'UNAVAILABLE',
      visible_alerts:num(router?.counts?.visible_alerts)??0,
      notification_ready:num(router?.counts?.notification_ready)??0,
      alert_chain_failures:num(router?.counts?.chain_failures),
      owner_review_state:'AAL2_OWNER_ONLY'
    },
    blockers:[...new Set(blockers)],
    components,
    decision_compression:{
      what_changed:latestEvent
        ? `${latestEvent?.event_key??'EVENT'} · ${latestEvent?.previous_state??'GENESIS'} → ${latestEvent?.event_state??'UNKNOWN'}`
        : pick(signal?.decision_compression?.what_changed,lifecycle?.decision_compression?.state,'NO_NEW_MATERIAL_EVENT'),
      what_matters:pick(watch?.decision_compression?.what_matters,lifecycle?.lifecycle?.next_condition,signal?.decision_compression?.what_matters,'Preserve evidence gates.'),
      action_permitted:'WAIT',
      capital_permission:'0R'
    },
    governance:{
      canonical_read_model:true,
      owner_actions_private:true,
      owner_actions_require_aal2:true,
      human_review_not_trade_approval:true,
      deterministic_scores_not_probabilities:true,
      automatic_execution:false,
      machine_execution_allowed:false,
      live_order_submission_enabled:false,
      action_permitted:'WAIT',
      capital_permission:'0R'
    }
  };
}
