const bool=v=>v===true;
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const uniq=a=>[...new Set(a)];

export function buildGoldSessionExecutionIntelligence({
  now=new Date(),guard={},signal={},lifecycle={},watch={},command={}
}={}){
  const upstreamOk=[guard,signal,lifecycle,watch,command].every(x=>x?.ok===true);
  const anchorCertified=guard?.anchor?.certified===true&&guard?.state==='LIVE_ANCHOR_CERTIFIED';
  const signalDay=signal?.signal_day?.state??command?.command?.signal_day??'UNKNOWN';
  const signalDayScore=num(signal?.signal_day?.score??command?.command?.signal_day_score);
  const signalDayConfirmed=signalDay==='SIGNAL_DAY_CONFIRMED';
  const signalTime=signal?.signal_time?.state??command?.command?.signal_time??'UNKNOWN';
  const signalTimeActive=signalTime==='ACTIVE_SIGNAL_TIME';
  const direction=signal?.signal_time?.direction_candidate??command?.command?.direction_candidate??'NEUTRAL';
  const tradeableExtreme=bool(lifecycle?.flags?.tradeable_extreme);
  const lifecycleResolved=bool(lifecycle?.flags?.liquidity_transition_resolved);
  const watchResolved=bool(watch?.review_gate?.requirements?.liquidity_transition_resolved);
  const liquidityConsensus=lifecycleResolved===watchResolved;
  const liquidityResolved=liquidityConsensus&&lifecycleResolved&&watchResolved;
  const breakout=signal?.day_dna?.breakout_state??lifecycle?.signal_time?.event?.dominant_state??'UNKNOWN';
  const acceptance=signal?.day_dna?.acceptance??lifecycle?.structural_state?.acceptance??'UNKNOWN';
  const phase=signal?.day_dna?.liquidity_phase??lifecycle?.structural_state?.phase??'UNKNOWN';
  const lifecycleStage=lifecycle?.lifecycle?.stage??command?.command?.lifecycle_stage??'UNKNOWN';

  const zones=Array.isArray(signal?.tradeable_zones?.zones)?signal.tradeable_zones.zones:[];
  const extremeZones=zones.filter(z=>/LOWER_TRADEABLE_ZONE|UPPER_TRADEABLE_ZONE/.test(String(z?.state||'')));
  const lowerCount=zones.filter(z=>z?.state==='LOWER_TRADEABLE_ZONE').length;
  const upperCount=zones.filter(z=>z?.state==='UPPER_TRADEABLE_ZONE').length;
  const zoneBias=lowerCount>upperCount?'LOWER_ZONE_CONFLUENCE':upperCount>lowerCount?'UPPER_ZONE_CONFLUENCE':'MIXED_OR_NEUTRAL';

  const sessions=Array.isArray(lifecycle?.session_liquidity?.sessions)?lifecycle.session_liquidity.sessions:[];
  const activeSessions=sessions.filter(s=>['ACTIVE','OPEN','PREP'].includes(String(s?.state||'')));
  const livePrice=anchorCertified?num(guard?.anchor?.live_price):null;
  const nearestAbove=lifecycle?.session_liquidity?.nearest_above??null;
  const nearestBelow=lifecycle?.session_liquidity?.nearest_below??null;

  const disagreement=[];
  if(!liquidityConsensus)disagreement.push('LIQUIDITY_TRANSITION_STATE_DISAGREEMENT');
  if(signal?.signal_day?.state&&lifecycle?.signal_day?.state&&signal.signal_day.state!==lifecycle.signal_day.state)
    disagreement.push('SIGNAL_DAY_STATE_DISAGREEMENT');
  if(signal?.signal_time?.state&&lifecycle?.signal_time?.state&&signal.signal_time.state!==lifecycle.signal_time.state)
    disagreement.push('SIGNAL_TIME_STATE_DISAGREEMENT');

  const requirements={
    upstream_healthy:upstreamOk,
    live_anchor_certified:anchorCertified,
    signal_day_confirmed:signalDayConfirmed,
    signal_time_active:signalTimeActive,
    tradeable_extreme:tradeableExtreme,
    liquidity_transition_consensus:liquidityConsensus,
    liquidity_transition_resolved:liquidityResolved,
    no_state_disagreement:disagreement.length===0
  };

  let score=0;
  if(upstreamOk)score+=10;
  if(anchorCertified)score+=25;
  if(signalDayConfirmed)score+=15;
  if(signalTimeActive)score+=20;
  if(tradeableExtreme)score+=10;
  if(liquidityConsensus)score+=10;
  if(liquidityResolved)score+=10;
  if(disagreement.length)score=Math.min(score,50);

  const reviewReady=Object.values(requirements).every(Boolean);
  let state='CONTEXT_WATCH';
  if(!upstreamOk)state='DATA_DEGRADED';
  else if(!anchorCertified)state='WAITING_FOR_CERTIFIED_LIVE_ANCHOR';
  else if(disagreement.length)state='STATE_CONSENSUS_BLOCKED';
  else if(!signalDayConfirmed)state='WAITING_FOR_SIGNAL_DAY';
  else if(!signalTimeActive)state='OFF_WINDOW_MONITOR';
  else if(!tradeableExtreme)state='WAITING_FOR_TRADEABLE_EXTREME';
  else if(!liquidityResolved)state='WAITING_FOR_LIQUIDITY_TRANSITION';
  else if(reviewReady)state='HUMAN_REVIEW_CANDIDATE';

  const blockers=[];
  if(!upstreamOk)blockers.push('UPSTREAM_DEGRADED');
  if(!anchorCertified)blockers.push('CERTIFIED_LIVE_ANCHOR_REQUIRED');
  if(!signalDayConfirmed)blockers.push('SIGNAL_DAY_NOT_CONFIRMED');
  if(!signalTimeActive)blockers.push('SIGNAL_TIME_NOT_ACTIVE');
  if(!tradeableExtreme)blockers.push('TRADEABLE_EXTREME_NOT_PRESENT');
  if(!liquidityConsensus)blockers.push('LIQUIDITY_TRANSITION_CONSENSUS_REQUIRED');
  else if(!liquidityResolved)blockers.push('LIQUIDITY_TRANSITION_NOT_RESOLVED');
  blockers.push(...disagreement);

  return{
    ok:upstreamOk,
    version:'v198-gold-live-session-intelligence-v1',
    generated_at:now.toISOString(),
    symbol:'XAUUSD',
    state,
    deterministic_review_score:score,
    review_ready:reviewReady,
    context:{
      live_price:livePrice,
      anchor_certified:anchorCertified,
      signal_day:signalDay,
      signal_day_score:signalDayScore,
      signal_time:signalTime,
      direction_candidate:direction,
      lifecycle_stage:lifecycleStage,
      liquidity_phase:phase,
      acceptance,
      breakout_state:breakout,
      tradeable_extreme:tradeableExtreme,
      zone_bias:zoneBias,
      extreme_zone_timeframes:extremeZones.map(z=>z?.timeframe).filter(Boolean),
      active_sessions:activeSessions.map(s=>({key:s?.key??null,label:s?.label??null,state:s?.state??null})),
      nearest_session_liquidity:{
        above:nearestAbove?{session:nearestAbove.session??null,kind:nearestAbove.kind??null,price:num(nearestAbove.price)}:null,
        below:nearestBelow?{session:nearestBelow.session??null,kind:nearestBelow.kind??null,price:num(nearestBelow.price)}:null
      }
    },
    consensus:{
      liquidity_transition:{
        lifecycle:lifecycleResolved,
        trigger_watch:watchResolved,
        consensus:liquidityConsensus,
        resolved:liquidityResolved
      },
      disagreements:uniq(disagreement)
    },
    requirements,
    blockers:uniq(blockers),
    next_signal_window:watch?.next_signal_window?.next??command?.command?.next_signal_window??null,
    decision_compression:{
      what_changed:reviewReady
        ? 'Certified live anchor, active Signal Time, tradeable extreme and liquidity-transition consensus are simultaneously present.'
        : state==='STATE_CONSENSUS_BLOCKED'
          ? 'Upstream engines disagree on a material review gate.'
          : state==='WAITING_FOR_CERTIFIED_LIVE_ANCHOR'
            ? 'MT5 bridge exists, but the live XAUUSD anchor has not passed V197 certification.'
            : 'Session opportunity evidence is incomplete.',
      what_matters:reviewReady
        ? 'Escalate to owner human review only; do not infer order permission.'
        : blockers.length?blockers.join(' · '):'Preserve evidence gates.',
      action_permitted:'WAIT',
      capital_permission:'0R'
    },
    governance:{
      deterministic_review_score_not_probability:true,
      structural_context_not_execution_instruction:true,
      human_review_candidate_not_trade_signal:true,
      requires_v197_certified_live_anchor:true,
      state_consensus_required:true,
      automatic_execution:false,
      machine_execution_allowed:false,
      live_order_submission_enabled:false,
      action_permitted:'WAIT',
      capital_permission:'0R'
    }
  };
}
