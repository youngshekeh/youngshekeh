import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGoldLiveAnchorGuard} from '../src/gold-live-anchor-guard-v197.mjs';

const command={ok:true,version:'v194-gold-command-snapshot-v1',state:'HUMAN_REVIEW_READY',command:{live_market_state:'BROKER_LIVE',live_price:4172.2},components:{live_xauusd:{ok:true}}};
const readiness={ok:true,version:'v195-gold-bridge-readiness-v1',state:'BROKER_LIVE',gates:{broker_live:{pass:true}},next_step_code:'NONE'};
const quality={ok:true,version:'v196-gold-feed-quality-v1',state:'LIVE_FEED_QUALITY_PASS',deterministic_quality_score:100};

test('V197 certifies only the fully commissioned stable live anchor',()=>{
  const out=buildGoldLiveAnchorGuard({command,readiness,quality,now:new Date('2026-10-02T21:10:00Z')});
  assert.equal(out.state,'LIVE_ANCHOR_CERTIFIED');
  assert.equal(out.anchor.certified,true);
  assert.equal(out.anchor.live_price,4172.2);
  assert.equal(out.promotion.human_review_ready_after_live_anchor_guard,true);
  assert.equal(out.governance.action_permitted,'WAIT');
  assert.equal(out.governance.capital_permission,'0R');
});

test('V197 blocks first-tick promotion while V196 warms',()=>{
  const q={...quality,state:'PROBATION_WARMING',deterministic_quality_score:80};
  const out=buildGoldLiveAnchorGuard({command,readiness,quality:q});
  assert.equal(out.state,'QUALITY_PROBATION');
  assert.equal(out.anchor.certified,false);
  assert.equal(out.anchor.live_price,null);
  assert.equal(out.promotion.human_review_ready_after_live_anchor_guard,false);
  assert.ok(out.blockers.includes('FEED_QUALITY_NOT_CERTIFIED'));
});

test('V197 exposes the no-bridge blocker cleanly',()=>{
  const r={...readiness,state:'NO_BRIDGE_ENROLLED',gates:{broker_live:{pass:false}},next_step_code:'ENROLL_OWNER_AAL2_BRIDGE'};
  const c={...command,state:'WAITING_FOR_LIVE_XAUUSD',command:{...command.command,live_market_state:'WAITING_FOR_LIVE_MARKET_BRIDGE',live_price:null}};
  const q={...quality,state:'NO_TICKS',deterministic_quality_score:0};
  const out=buildGoldLiveAnchorGuard({command:c,readiness:r,quality:q});
  assert.equal(out.state,'ANCHOR_BLOCKED');
  assert.ok(out.blockers.includes('BRIDGE_NOT_ENROLLED'));
  assert.ok(out.blockers.includes('NO_AUTHENTICATED_TICKS'));
  assert.equal(out.next_step,'ENROLL_OWNER_AAL2_BRIDGE');
});
