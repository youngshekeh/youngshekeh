import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildGoldActivationOrchestrator} from '../src/gold-activation-orchestrator-v204.mjs';

const ready={ok:true,state:'BRIDGE_ENROLLED_WAITING_FIRST_TICK',gates:{bridge_enrolled:{pass:true}}};
const quality={ok:true,state:'NO_TICKS'};
const anchor={ok:true,state:'WAITING_FIRST_TICK',anchor:{certified:false}};
const ledger={ok:true,state:'HASH_CHAIN_VERIFIED',counts:{events:1,chain_failures:0},latest_event_at:'2026-10-02T21:58:52Z'};
const relay={ok:true,bridge:{enrolled:true,age_seconds:1800,authentication_reached:false,total_authenticated_requests:0,last_auth_activity_age_seconds:null},relay:{first_tick_seen:false,streaming:false,accepted_ticks_examined:0,latest_tick_age_seconds:null}};

test('V204 identifies an enrolled bridge whose local relay never started',()=>{
  const out=buildGoldActivationOrchestrator({readiness:ready,quality,anchor,relay,ledger,now:new Date('2026-10-02T22:10:00Z')});
  assert.equal(out.state,'RELAY_NOT_STARTED');
  assert.equal(out.phase.passed_gates,1);
  assert.equal(out.commissioning_progress_pct,17);
  assert.equal(out.stall.active,true);
  assert.equal(out.stall.code,'LOCAL_RELAY_START_OVERDUE');
  assert.equal(out.next_step_code,'RUN_V201_THEN_V200_ON_WINDOWS');
  assert.equal(out.governance.action_permitted,'WAIT');
  assert.equal(out.governance.capital_permission,'0R');
});

test('V204 distinguishes authentication from first accepted tick',()=>{
  const r={...relay,bridge:{...relay.bridge,authentication_reached:true,total_authenticated_requests:2,last_auth_activity_age_seconds:30}};
  const out=buildGoldActivationOrchestrator({readiness:ready,quality,anchor,relay:r,ledger});
  assert.equal(out.state,'AUTHENTICATED_WAITING_FIRST_TICK');
  assert.equal(out.gates.intake_authentication.pass,true);
  assert.equal(out.gates.first_tick_accepted.pass,false);
});

test('V204 can mark the read-only data path ready without opening execution',()=>{
  const r={ok:true,bridge:{enrolled:true,age_seconds:10,authentication_reached:true,total_authenticated_requests:20,last_auth_activity_age_seconds:1},relay:{first_tick_seen:true,streaming:true,accepted_ticks_examined:20,latest_tick_age_seconds:1,relay_version:'v186.0',mt5_package_version:'5.0.6231',os_family:'Windows'}};
  const q={ok:true,state:'LIVE_FEED_QUALITY_PASS'};
  const a={ok:true,state:'LIVE_ANCHOR_CERTIFIED',anchor:{certified:true}};
  const out=buildGoldActivationOrchestrator({readiness:{ok:true,state:'BROKER_LIVE',gates:{bridge_enrolled:{pass:true}}},quality:q,anchor:a,relay:r,ledger});
  assert.equal(out.state,'LIVE_DATA_PATH_READY');
  assert.equal(out.commissioning_progress_pct,100);
  assert.equal(out.governance.live_data_ready_not_execution_permission,true);
  assert.equal(out.governance.automatic_execution,false);
  assert.equal(out.governance.live_order_submission_enabled,false);
  assert.equal(out.decision_compression.action_permitted,'WAIT');
});

test('V204 fails closed when a commissioning upstream is unavailable',()=>{
  const out=buildGoldActivationOrchestrator({readiness:{ok:false},quality,anchor,relay,ledger});
  assert.equal(out.ok,false);
  assert.equal(out.state,'DATA_DEGRADED');
  assert.ok(out.blockers.includes('COMMISSIONING_UPSTREAM_DEGRADED'));
  assert.equal(out.governance.capital_permission,'0R');
});

test('V204 API is fixed-source GET only',async()=>{
  const api=await readFile(new URL('../api/gold-activation-orchestrator-v204.js',import.meta.url),'utf8');
  for(const path of ['gold-bridge-readiness-v195','gold-feed-quality-v196','gold-live-anchor-guard-v197','gold-relay-observability-v199','gold-relay-event-ledger-v202'])assert.match(api,new RegExp(path));
  assert.match(api,/req\.method!=='GET'/);
  assert.doesNotMatch(api,/req\.query|req\.body/);
});

test('V204 API stages V197 until feed quality can reach anchor certification',async()=>{
  const api=await readFile(new URL('../api/gold-activation-orchestrator-v204.js',import.meta.url),'utf8');
  assert.match(api,/qualityCanReachAnchor/);
  assert.match(api,/ANCHOR_DEFERRED_UNTIL_FEED_QUALITY/);
  assert.match(api,/LIVE_FEED_QUALITY_PASS/);
});
