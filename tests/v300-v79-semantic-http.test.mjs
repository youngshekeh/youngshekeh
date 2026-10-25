import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyGoldStateBridge,GOLD_STATE_OBSERVATION_MAX_AGE_MS} from '../src/v300-v79-semantic-http.mjs';
const NOW=Date.parse('2026-10-25T09:36:00Z');
const valid=()=>({
 ok:true,usable:true,version:'v79-gold-liquidity-state-machine-v1',
 observed_at:new Date(NOW-60000).toISOString(),quality_state:'PASS',
 capital_permission:'0R',live_order_submission_enabled:false,automatic_execution:false,
 state:{phase:'BALANCED_ROTATION',direction:'NEUTRAL'}
});
test('V300 a signed, current, full 0R observation is research-only 200',()=>{
 const r=classifyGoldStateBridge({httpStatus:200,body:valid(),now:NOW});
 assert.equal(r.httpStatus,200);
 assert.equal(r.certifiedObservation,true);
 assert.equal(r.payload.ok,true);
 assert.equal(r.payload.capital_permission,'0R');
 assert.match(r.policy,/NOT-EXECUTION/);
});
test('V300 actual HTTP-200 load shed is HTTP-503 with honest health state',()=>{
 const body={ok:false,usable:false,version:'runtime-v79-liquidity-load-shed-v1',
  state:'LOAD_SHED_DB_RECOVERY',action:'WAIT',capital_permission:'0R',
  live_order_submission_enabled:false,automatic_execution:false,quality_state:null};
 const r=classifyGoldStateBridge({httpStatus:200,body,now:NOW});
 assert.equal(r.httpStatus,503);assert.equal(r.certifiedObservation,false);
 assert.equal(r.payload.state,'LOAD_SHED_DB_RECOVERY');
 assert.equal(r.payload.upstream_http_status,200);
 assert.equal(r.payload.ok,false);assert.equal(r.payload.usable,false);
 assert.equal(r.payload.engine_certified,false);
 assert.equal(r.payload.market_data_current,false);
 assert.equal(r.payload.capital_permission,'0R');
 assert.equal(r.payload.commercial_launch_certified,false);
 assert.equal(r.payload.live_order_submission_enabled,false);
 assert.equal(r.payload.source_version,body.version);
});
test('V300 a completed observation requires live freshness and immutable 0R',()=>{
 for(const age of [0,600000,780000]){
  const b={...valid(),observed_at:new Date(NOW-age).toISOString()};
  assert.equal(classifyGoldStateBridge({httpStatus:200,body:b,now:NOW}).httpStatus,200);
 }
 for(const age of [780001,1800000,17*86400000]){
  const b={...valid(),observed_at:new Date(NOW-age).toISOString()};
  const r=classifyGoldStateBridge({httpStatus:200,body:b,now:NOW});
  assert.equal(r.httpStatus,503);assert.equal(r.payload.market_data_current,false);
 }
 assert.equal(GOLD_STATE_OBSERVATION_MAX_AGE_MS,780000);
});
test('V300 forged state, lax governance, missing quality and network outages fail closed',()=>{
 const cases=[
 {body:{...valid(),capital_permission:'1R'},code:200},
 {body:{...valid(),live_order_submission_enabled:true},code:200},
 {body:{...valid(),automatic_execution:true},code:200},
 {body:{...valid(),quality_state:'PASS',state:'READY'},code:200},
 {body:{...valid(),quality_state:'DATA_GATED'},code:200},
 {body:{...valid(),observed_at:'2020-01-01'},code:200},
 {body:{...valid(),observed_at:new Date(NOW+1000).toISOString()},code:200},
 {body:{...valid(),version:'unknown'},code:200},
 {body:valid(),code:401},
 {body:{ok:false,state:'LOAD_SHED_DB_RECOVERY'},code:503},
 {body:null,code:0}
 ];
 for(const {body,code} of cases){
  const v=classifyGoldStateBridge({httpStatus:code,body,now:NOW});
  assert.equal(v.httpStatus,503);assert.equal(v.payload.ok,false);
  assert.equal(v.payload.capital_permission,'0R');
  assert.equal(v.payload.engine_certified,false);
 }
});
test('V300 Gold bridge uses exact prior signed V79 endpoint with one private call, no fallback',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const src=read('api/gold-liquidity-state-machine.js');
 assert.match(src,/getVercelOidcToken/);
 assert.match(src,/runtime-v79-liquidity/);
 assert.match(src,/classifyGoldStateBridge\(\{httpStatus:upstream.status,body\}\)/);
 assert.match(src,/res.status\(result.httpStatus\).json\(result.payload\)/);
 assert.match(src,/Retry-After','60'/);
 assert.match(src,/redirect:'error'/);
 assert.equal((src.match(/await fetch\(/g)||[]).length,1);
 assert.doesNotMatch(src,/service_role|anon_key|\bPOST\b|\.insert\(|\.update\(|cron\.schedule|Coinbase|Yahoo/i);
 assert.match(read('src/private-state-bridge.mjs'),/LOAD_SHED_DB_RECOVERY/);
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(read('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
});
