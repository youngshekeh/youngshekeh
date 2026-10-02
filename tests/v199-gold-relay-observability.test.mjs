import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGoldRelayObservability} from '../src/gold-relay-observability-v199.mjs';
const now=new Date('2026-10-02T22:30:00Z');
const baseBridge={created_at:'2026-10-02T22:00:00Z',last_used_at:null,use_count:0,revoked_at:null};
const tick=(seq,obs,extra={})=>({sequence:seq,observed_at:obs,received_at:new Date(Date.parse(obs)+250).toISOString(),terminal_connected:true,relay_version:'v186.0',mt5_package_version:'5.0.6231',os_family:'Windows',...extra});

test('V199 separates issued credential from relay contact',()=>{
 const out=buildGoldRelayObservability({now,bridges:[baseBridge],ticks:[]});
 assert.equal(out.state,'CREDENTIAL_ISSUED_AWAITING_RELAY');
 assert.equal(out.bridge.authentication_reached,false);
 assert.equal(out.relay.first_tick_seen,false);
 assert.equal(out.next_step_code,'RUN_MT5_RELAY_ON_WINDOWS');
 assert.equal(out.governance.capital_permission,'0R');
});

test('V199 detects authentication without an accepted tick',()=>{
 const b={...baseBridge,use_count:1,last_used_at:'2026-10-02T22:29:55Z'};
 const out=buildGoldRelayObservability({now,bridges:[b],ticks:[]});
 assert.equal(out.state,'AUTH_REACHED_AWAITING_ACCEPTED_TICK');
 assert.equal(out.bridge.authentication_reached,true);
 assert.equal(out.relay.first_tick_seen,false);
});

test('V199 exposes first-tick probation separately from sustained stream',()=>{
 const out=buildGoldRelayObservability({now,bridges:[{...baseBridge,use_count:1,last_used_at:'2026-10-02T22:29:59Z'}],ticks:[tick(1,'2026-10-02T22:29:59Z')]});
 assert.equal(out.state,'FIRST_TICK_ACCEPTED_PROBATION');
 assert.equal(out.relay.first_tick_seen,true);
 assert.equal(out.relay.streaming,false);
});

test('V199 recognizes sustained relay streaming',()=>{
 const ticks=[tick(1,'2026-10-02T22:29:52Z'),tick(2,'2026-10-02T22:29:56Z'),tick(3,'2026-10-02T22:29:59Z')];
 const out=buildGoldRelayObservability({now,bridges:[{...baseBridge,use_count:3,last_used_at:'2026-10-02T22:29:59Z'}],ticks});
 assert.equal(out.state,'RELAY_STREAMING');
 assert.equal(out.relay.streaming,true);
 assert.equal(out.milestones.sustained_stream,true);
 assert.equal(out.governance.live_order_submission_enabled,false);
});

test('V199 fails stale when an earlier stream stops',()=>{
 const ticks=[tick(1,'2026-10-02T22:20:00Z'),tick(2,'2026-10-02T22:20:05Z'),tick(3,'2026-10-02T22:20:10Z')];
 const out=buildGoldRelayObservability({now,bridges:[{...baseBridge,use_count:3,last_used_at:'2026-10-02T22:20:10Z'}],ticks});
 assert.equal(out.state,'RELAY_STALE');
 assert.equal(out.next_step_code,'RESTORE_MT5_RELAY_HEARTBEAT');
});
