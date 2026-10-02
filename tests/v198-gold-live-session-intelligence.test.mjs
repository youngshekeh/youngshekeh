import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGoldSessionExecutionIntelligence} from '../src/gold-live-session-intelligence-v198.mjs';

const signal={ok:true,signal_day:{state:'SIGNAL_DAY_CONFIRMED',score:85},signal_time:{state:'ACTIVE_SIGNAL_TIME',direction_candidate:'LONG_REPAIR_BIAS'},day_dna:{breakout_state:'FAILED_BREAKOUT_DOWN',acceptance:'RECLAIM_CONFIRMED',liquidity_phase:'RAID_RECLAIM'},tradeable_zones:{zones:[{timeframe:'DAILY',state:'LOWER_TRADEABLE_ZONE'},{timeframe:'WEEKLY',state:'LOWER_TRADEABLE_ZONE'}]}};
const lifecycle={ok:true,lifecycle:{stage:'ACTIVE_SIGNAL_WINDOW'},flags:{tradeable_extreme:true,liquidity_transition_resolved:true},signal_day:{state:'SIGNAL_DAY_CONFIRMED'},signal_time:{state:'ACTIVE_SIGNAL_TIME'},session_liquidity:{sessions:[{key:'NEW_YORK',label:'COMEX New York',state:'ACTIVE'}],nearest_above:{session:'NEW_YORK',kind:'HIGH',price:4259},nearest_below:{session:'NEW_YORK',kind:'LOW',price:4203.2}}};
const watch={ok:true,review_gate:{requirements:{liquidity_transition_resolved:true}},next_signal_window:{next:null}};
const command={ok:true,command:{signal_day:'SIGNAL_DAY_CONFIRMED',signal_time:'ACTIVE_SIGNAL_TIME'}};
const guard={ok:true,state:'LIVE_ANCHOR_CERTIFIED',anchor:{certified:true,live_price:4172.3}};

test('V198 escalates only a fully agreed live context to human review',()=>{
  const out=buildGoldSessionExecutionIntelligence({guard,signal,lifecycle,watch,command});
  assert.equal(out.state,'HUMAN_REVIEW_CANDIDATE');
  assert.equal(out.review_ready,true);
  assert.equal(out.context.live_price,4172.3);
  assert.equal(out.consensus.liquidity_transition.consensus,true);
  assert.equal(out.governance.action_permitted,'WAIT');
  assert.equal(out.governance.live_order_submission_enabled,false);
});

test('V198 fails closed when V188 and V189 disagree',()=>{
  const w={...watch,review_gate:{requirements:{liquidity_transition_resolved:false}}};
  const out=buildGoldSessionExecutionIntelligence({guard,signal,lifecycle,watch:w,command});
  assert.equal(out.state,'STATE_CONSENSUS_BLOCKED');
  assert.equal(out.review_ready,false);
  assert.ok(out.blockers.includes('LIQUIDITY_TRANSITION_STATE_DISAGREEMENT'));
  assert.ok(out.deterministic_review_score<=50);
});

test('V198 blocks structural opportunity context without V197 anchor certification',()=>{
  const g={...guard,state:'WAITING_FIRST_TICK',anchor:{certified:false,live_price:null}};
  const out=buildGoldSessionExecutionIntelligence({guard:g,signal,lifecycle,watch,command});
  assert.equal(out.state,'WAITING_FOR_CERTIFIED_LIVE_ANCHOR');
  assert.equal(out.context.live_price,null);
  assert.ok(out.blockers.includes('CERTIFIED_LIVE_ANCHOR_REQUIRED'));
  assert.equal(out.governance.capital_permission,'0R');
});

test('V198 keeps active-window review blocked when not at a tradeable extreme',()=>{
  const l={...lifecycle,flags:{...lifecycle.flags,tradeable_extreme:false}};
  const out=buildGoldSessionExecutionIntelligence({guard,signal,lifecycle:l,watch,command});
  assert.equal(out.state,'WAITING_FOR_TRADEABLE_EXTREME');
  assert.equal(out.review_ready,false);
});
