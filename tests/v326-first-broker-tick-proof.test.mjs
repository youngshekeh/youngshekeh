// V326 builder extracted from actual staged Supabase Edge source.
// No public web calls, database writes, tokens or real MT5 host required.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const code=readFileSync(new URL(
  '../docs/release/V326-REVIEW-ONLY-public-gold-bridge-readiness.ts',
  import.meta.url),'utf8');
const off=code.indexOf('const n=v=>');
assert.ok(off>0,'actual review-only builder source not found');
const builder=code.slice(off).replace(
  'export function buildGoldBridgeReadiness',
  'function buildGoldBridgeReadiness'
);
const render=runInNewContext(
  builder+'\n;buildGoldBridgeReadiness',
  {Date,Number,String,Object,Math,Array},{timeout:3000});
const now=new Date('2026-10-27T07:10:00.000Z');
const bridge=(auth=false)=>({
  created_at:'2026-10-26T20:00:00Z',
  last_used_at:auth?'2026-10-27T07:09:59Z':null,
  use_count:auth?5:0,revoked_at:null,mode:'READ_ONLY_LIVE_MARKET_DATA'});
const noTick={ok:true,state:'LIVE_MARKET_BRIDGE_WAITING_FOR_TICK',
  source:{connected:false},quote:null,
  quality:{fresh:false,tick_count_60s:0}};
const goodTick={ok:true,state:'BROKER_LIVE',
  source:{connected:true},quality:{fresh:true,tick_count_60s:5},
  quote:{observed_at:'2026-10-27T07:09:59Z',mid:4400.5,age_seconds:1,
    trade_mode:'DEMO'}};
test('zero enrolled bridges means no false connection',()=>{
  const x=render({now,bridges:[],live:noTick});
  assert.equal(x.state,'NO_BRIDGE_ENROLLED');
  assert.equal(x.gates.first_tick_received.pass,false);
  assert.equal(x.governance.capital_permission,'0R');
});
test('an enrolled unused bridge waits for first persisted tick',()=>{
  const x=render({now,bridges:[bridge()],live:noTick});
  assert.equal(x.state,'BRIDGE_ENROLLED_WAITING_FIRST_TICK');
  assert.equal(x.next_step_code,'RUN_MT5_RELAY_ON_WINDOWS');
  assert.equal(x.gates.bridge_enrolled.pass,true);
  assert.equal(x.gates.bridge_authenticated.pass,false);
  assert.equal(x.gates.first_tick_received.pass,false);
});
test('authentication use_count=5 does not mean first tick received',()=>{
  const x=render({now,bridges:[bridge(true)],live:noTick});
  assert.equal(x.gates.bridge_authenticated.pass,true);
  assert.equal(x.gates.first_tick_received.pass,false);
  assert.equal(x.state,'BRIDGE_ENROLLED_WAITING_FIRST_TICK');
  assert.equal(x.public_counts.bridges_with_activity,1);
  assert.equal(x.gates.first_tick_received.proof,'PERSISTED_TICK_NOT_CREDENTIAL_USE');
  assert.equal(x.governance.machine_execution_allowed,false);
});
test('stored stale tick is real first-tick proof, not live quote proof',()=>{
  const stale={...goodTick,state:'BROKER_STALE',
    quality:{fresh:false,tick_count_60s:0},
    quote:{...goodTick.quote,observed_at:'2026-10-27T06:00:00Z',
      age_seconds:4200}};
  const x=render({now,bridges:[bridge(true)],live:stale});
  assert.equal(x.gates.first_tick_received.pass,true);
  assert.equal(x.gates.quote_fresh.pass,false);
  assert.equal(x.state,'BROKER_QUOTE_STALE');
  assert.equal(x.live_market.fresh,false);
  assert.equal(x.governance.capital_permission,'0R');
});
test('genuinely persisted and recent read-only quote gives BROKER_LIVE only',()=>{
  const x=render({now,bridges:[bridge(true)],live:goodTick});
  assert.equal(x.state,'BROKER_LIVE');
  assert.equal(x.next_step_code,'VERIFY_BROKER_DATA_DISPLAY_RIGHTS');
  assert.equal(x.live_market.mid,null);
  assert.equal(x.diagnostic.quote_redistribution_license_verified,false);
  assert.equal(x.gates.first_tick_received.pass,true);
  assert.equal(x.gates.broker_live.pass,true);
  assert.equal(x.governance.machine_execution_allowed,false);
  assert.equal(x.governance.live_order_submission_enabled,false);
  assert.equal(x.governance.capital_permission,'0R');
});
test('unauthenticated fake live state cannot qualify as persisted tick',()=>{
  const fake={...goodTick,source:{connected:false}};
  const x=render({now,bridges:[bridge(true)],live:fake});
  assert.equal(x.gates.first_tick_received.pass,false);
  assert.equal(x.state,'BRIDGE_ENROLLED_WAITING_FIRST_TICK');
});
test('missing observed_at invalidates first tick even with quote price present',()=>{
  const fake={...goodTick,quote:{mid:4400,age_seconds:1},
    quality:{fresh:true}};
  const x=render({now,bridges:[bridge(true)],live:fake});
  assert.equal(x.gates.first_tick_received.pass,false);
  assert.equal(x.state,'BRIDGE_ENROLLED_WAITING_FIRST_TICK');
});
test('a revoked enrolled bridge cannot authorize new broker data',()=>{
  const b={...bridge(true),revoked_at:'2026-10-27T06:30:00Z'};
  const x=render({now,bridges:[b],live:noTick});
  assert.equal(x.gates.bridge_enrolled.pass,false);
  assert.equal(x.gates.first_tick_received.pass,false);
});
test('deployment source disables public stale browser caching',()=>{
  assert.match(code,/'Cache-Control':'no-store'/);
  assert.match(code,/first_tick_received:\{pass:firstTickSeen/);
  assert.match(code,/PERSISTED_TICK_NOT_CREDENTIAL_USE/);
  assert.doesNotMatch(code,/firstTickSeen=used\.length>0/);
});

test('missing broker midpoint cannot qualify as live even with a fresh quality flag',()=>{
  const noMid={...goodTick,quote:{...goodTick.quote,mid:null}};
  const x=render({now,bridges:[bridge(true)],live:noMid});
  assert.equal(x.state,'BROKER_QUOTE_STALE');
  assert.equal(x.gates.broker_live.pass,false);
  assert.equal(x.live_market.mid,null);
  assert.equal(x.governance.capital_permission,'0R');
});
test('public staging source never redistributes broker price without licensed rights',()=>{
  assert.match(code,/quote_redistribution_license_verified:false/);
  assert.match(code,/mid:null/);
  assert.doesNotMatch(code,/mid:liveFresh\?n\(live\?\.quote\?\.mid\):null/);
});
