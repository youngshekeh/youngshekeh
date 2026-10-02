import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGoldBridgeReadiness} from '../src/gold-bridge-readiness-v195.mjs';

const now=new Date('2026-10-02T21:00:00Z');
const waiting={ok:true,state:'WAITING_FOR_LIVE_MARKET_BRIDGE',source:{connected:false},quality:{fresh:false},quote:null};

test('V195 reports no enrolled bridge without leaking identifiers',()=>{
  const out=buildGoldBridgeReadiness({now,bridges:[],live:waiting});
  assert.equal(out.state,'NO_BRIDGE_ENROLLED');
  assert.equal(out.next_step_code,'ENROLL_OWNER_AAL2_BRIDGE');
  assert.equal(out.gates.bridge_enrolled.pass,false);
  assert.equal(out.privacy.bridge_ids_public,false);
  assert.equal(out.governance.capital_permission,'0R');
});

test('V195 detects enrolled bridge waiting for first MT5 tick',()=>{
  const out=buildGoldBridgeReadiness({now,bridges:[{revoked_at:null,use_count:0,last_used_at:null}],live:waiting});
  assert.equal(out.state,'BRIDGE_ENROLLED_WAITING_FIRST_TICK');
  assert.equal(out.next_step_code,'RUN_MT5_RELAY_ON_WINDOWS');
  assert.equal(out.gates.bridge_enrolled.pass,true);
  assert.equal(out.gates.first_tick_received.pass,false);
});

test('V195 promotes only a fresh broker quote to BROKER_LIVE',()=>{
  const live={ok:true,state:'BROKER_LIVE',source:{connected:true},quality:{fresh:true},quote:{mid:4172.45,trade_mode:'DEMO',age_seconds:1}};
  const out=buildGoldBridgeReadiness({now,bridges:[{revoked_at:null,use_count:4,last_used_at:'2026-10-02T20:59:59Z'}],live});
  assert.equal(out.state,'BROKER_LIVE');
  assert.equal(out.next_step_code,'NONE');
  assert.equal(out.gates.broker_live.pass,true);
  assert.equal(out.live_market.mid,4172.45);
  assert.equal(out.governance.live_order_submission_enabled,false);
  assert.equal(out.governance.action_permitted,'WAIT');
});
