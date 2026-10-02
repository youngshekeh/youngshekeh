const known=x=>x&&typeof x==='object'&&!Array.isArray(x);

export function buildGoldLiveAnchorGuard({now=new Date(),command={},readiness={},quality={}}={}){
  const upstreamOk=command?.ok===true&&readiness?.ok===true&&quality?.ok===true;
  const bridgeLive=readiness?.state==='BROKER_LIVE'&&readiness?.gates?.broker_live?.pass===true;
  const qualityPass=quality?.state==='LIVE_FEED_QUALITY_PASS';
  const v194Live=command?.command?.live_market_state==='BROKER_LIVE'&&command?.components?.live_xauusd?.ok===true;
  const anchorCertified=upstreamOk&&bridgeLive&&qualityPass&&v194Live;

  const blockers=[];
  if(!command?.ok)blockers.push('V194_COMMAND_UNAVAILABLE');
  if(!readiness?.ok)blockers.push('V195_COMMISSIONING_UNAVAILABLE');
  if(!quality?.ok)blockers.push('V196_QUALITY_UNAVAILABLE');
  if(readiness?.state==='NO_BRIDGE_ENROLLED')blockers.push('BRIDGE_NOT_ENROLLED');
  else if(!bridgeLive)blockers.push('BRIDGE_NOT_LIVE');
  if(quality?.state==='NO_TICKS')blockers.push('NO_AUTHENTICATED_TICKS');
  else if(!qualityPass)blockers.push('FEED_QUALITY_NOT_CERTIFIED');
  if(command?.command?.live_market_state!=='BROKER_LIVE')blockers.push('V186_LIVE_MARKET_NOT_READY');

  let state='ANCHOR_BLOCKED';
  if(!upstreamOk)state='DATA_DEGRADED';
  else if(anchorCertified)state='LIVE_ANCHOR_CERTIFIED';
  else if(readiness?.state==='BRIDGE_ENROLLED_WAITING_FIRST_TICK')state='WAITING_FIRST_TICK';
  else if(['PROBATION_WARMING','FEED_QUALITY_DEGRADED','FEED_STALE'].includes(String(quality?.state||'')))state='QUALITY_PROBATION';

  const v194Review=command?.state==='HUMAN_REVIEW_READY';
  const humanReviewReady=anchorCertified&&v194Review;

  return{
    ok:upstreamOk,
    version:'v197-gold-live-anchor-guard-v1',
    generated_at:now.toISOString(),
    symbol:'XAUUSD',
    state,
    anchor:{
      certified:anchorCertified,
      live_price:anchorCertified?command?.command?.live_price??null:null,
      bridge_state:readiness?.state??'UNAVAILABLE',
      quality_state:quality?.state??'UNAVAILABLE',
      quality_score:quality?.deterministic_quality_score??null,
      command_state:command?.state??'UNAVAILABLE'
    },
    promotion:{
      v194_human_review_ready:v194Review,
      human_review_ready_after_live_anchor_guard:humanReviewReady,
      rule:'V194_REVIEW_READY_REQUIRES_V195_BROKER_LIVE_AND_V196_QUALITY_PASS'
    },
    blockers:[...new Set(blockers)],
    next_step:anchorCertified?'PRESERVE_LIVE_FEED_QUALITY':readiness?.next_step_code??(
      quality?.state==='NO_TICKS'?'WAIT_FOR_AUTHENTICATED_TICKS':'RESTORE_FEED_QUALITY'
    ),
    upstream:{
      command:known(command)?command?.version??'UNKNOWN':'UNAVAILABLE',
      readiness:known(readiness)?readiness?.version??'UNKNOWN':'UNAVAILABLE',
      quality:known(quality)?quality?.version??'UNKNOWN':'UNAVAILABLE'
    },
    decision_compression:{
      what_changed:anchorCertified?'Live XAUUSD anchor passed commissioning and feed-quality gates.':'Live XAUUSD anchor remains unqualified.',
      what_matters:anchorCertified
        ? 'Use the certified broker anchor as market-data context only; V194 evidence gates still govern review readiness.'
        : 'Do not promote broker price into trusted live-anchor status until V195 and V196 both pass.',
      action_permitted:'WAIT',
      capital_permission:'0R'
    },
    governance:{
      live_anchor_certification_not_trade_permission:true,
      human_review_requires_certified_anchor:true,
      automatic_execution:false,
      machine_execution_allowed:false,
      live_order_submission_enabled:false,
      action_permitted:'WAIT',
      capital_permission:'0R'
    }
  };
}
