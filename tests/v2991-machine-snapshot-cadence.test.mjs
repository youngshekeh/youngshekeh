import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateDbEvidence} from '../src/v299-db-evidence-gate.mjs';
const NOW=Date.parse('2026-10-25T09:21:30Z');
const body=()=>({ok:true,usable:false,version:'v299-signed-db-evidence-v1',
 state:'SIGNED_DATABASE_EVIDENCE_OBSERVED',workload_identity_verified:true,
 database_snapshot_observed:true,database_state:'ONLINE',
 capital_permission:'0R',action_permitted:'WAIT',mission_restored:false,
 engine_registry_certified:false,commercial_launch_certified:false,
 live_order_submission_enabled:false,refresh_cadence_seconds:900,
 snapshot_freshness_sla_seconds:1080,snapshot_at:new Date(NOW).toISOString()});
test('V299.1 accepts healthy 15-minute DB refresh cadence plus <=3min margin',()=>{
 for(const sec of [0,540,899,900,960,1020,1080]){
  const x=validateDbEvidence({status:200,now:NOW,
   body:{...body(),snapshot_at:new Date(NOW-sec*1000).toISOString()}});
  assert.equal(x.ok,true,'unexpected hold at '+sec+' seconds');
  assert.equal(x.snapshot_age_seconds,sec);
  assert.equal(x.refresh_cadence_seconds,900);
  assert.equal(x.snapshot_freshness_sla_seconds,1080);
  assert.equal(x.mission_restored,false);
  assert.equal(x.engine_registry_certified,false);
  assert.equal(x.capital_permission,'0R');
 }
});
test('V299.1 rejects missed refresh, impossible timestamp and tampered source schedule',()=>{
 for(const sec of [1081,1200,1800]){
  const x=validateDbEvidence({status:200,now:NOW,
   body:{...body(),snapshot_at:new Date(NOW-sec*1000).toISOString()}});
  assert.equal(x.ok,false);
 }
 const future=validateDbEvidence({status:200,now:NOW,
  body:{...body(),snapshot_at:new Date(NOW+5000).toISOString()}});
 assert.equal(future.ok,false);
 for(const tamper of [{refresh_cadence_seconds:60},{snapshot_freshness_sla_seconds:3600},
  {capital_permission:'1R'},{mission_restored:true}]){
  const x=validateDbEvidence({status:200,now:NOW,body:{...body(),...tamper}});
  assert.equal(x.ok,false);assert.equal(x.commercial_launch_certified,false);
 }
});
test('V299.1 only changes private machine snapshot freshness; public market source rules remain intact',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const edge=read('supabase/functions/runtime-v299-mission-evidence/index.ts');
 const gate=read('src/v299-db-evidence-gate.mjs');
 assert.match(edge,/MACHINE_SNAPSHOT_MAX_AGE_MS=18\*60\*1000/);
 assert.match(gate,/MACHINE_SNAPSHOT_MAX_AGE_MS=18\*60\*1000/);
 assert.match(edge,/refresh_cadence_seconds:900,snapshot_freshness_sla_seconds:1080/);
 assert.match(gate,/body\?\.refresh_cadence_seconds!==900/);
 assert.match(edge,/age>MACHINE_SNAPSHOT_MAX_AGE_MS/);
 assert.match(edge,/final_permission!=='0R'/);
 assert.match(gate,/engine_registry_certified:false/);
 assert.match(read('src/v293-market-session-truth.mjs'),/SOURCE_STALE/);
 assert.match(read('src/v294-public-quarterly-rights.mjs'),/public_quarterly_range_allowed:false/);
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(read('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
});
