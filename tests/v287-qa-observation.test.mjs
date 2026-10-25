import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describeQaObservation} from '../src/v287-qa-observation.mjs';

const matrix=(passed=77,failed=30)=>({
  response:{ok:true,status:200},
  data:{ok:true,version:'v205.0',state:failed?'FAIL':'PASS',
    summary:{passed,failed,total:passed+failed}}
});
test('deferred QA cannot imply release certification',()=>{
  const r=describeQaObservation({admitted:false,result:matrix(107,0)});
  assert.equal(r.kind,'DEFERRED');
  assert.match(r.label,/NOT CERTIFIED/);
  assert.equal(r.certified,false);
});
test('HTTP 503 and network absence are transport failures, not 0 of 1 tests',()=>{
  for(const result of [
    {response:{ok:false,status:503},data:{ok:false,summary:{passed:0,failed:1,total:1}}},
    {response:{ok:false,status:401},data:{ok:true,summary:{passed:107,failed:0,total:107}}},
    null
  ]){
    const r=describeQaObservation({admitted:true,result});
    assert.equal(r.kind,'TRANSPORT_UNAVAILABLE');
    assert.equal(r.certified,false);
    assert.match(r.label,/NOT CERTIFIED/);
  }
  assert.match(describeQaObservation({admitted:true,
    result:{response:{ok:false,status:503}}}).label,/HTTP 503/);
});
test('synthetic v78 single-check records are never full matrix evidence',()=>{
  const r=describeQaObservation({admitted:true,result:{
    response:{ok:true,status:200},
    data:{ok:true,version:'v78-unknown',summary:{passed:0,failed:1,total:1}}
  }});
  assert.equal(r.kind,'SYNTHETIC_TRANSPORT_RECORD');
  assert.equal(r.certified,false);
});
test('full 77/107 failed matrix preserved while all-pass is still uncertified without launch gate',()=>{
  const bad=describeQaObservation({admitted:true,result:matrix()});
  const all=describeQaObservation({admitted:true,result:matrix(107,0)});
  assert.equal(bad.kind,'MATRIX_UNCERTIFIED');
  assert.match(bad.label,/QA 77\/107 · NOT CERTIFIED/);
  assert.match(all.label,/QA 107\/107 · NOT CERTIFIED/);
  assert.equal(all.certified,false);
});
test('malformed payloads do not render fabricated QA scores',()=>{
  for(const data of [
    {ok:true,summary:{passed:107,failed:0,total:999}},
    {ok:true,summary:{passed:'107',failed:0,total:107}},
    {ok:false,summary:{passed:107,failed:0,total:107}},null
  ]){
    const r=describeQaObservation({admitted:true,result:{response:{ok:true,status:200},data}});
    assert.equal(r.kind,'UNVERIFIED_PAYLOAD');
    assert.equal(r.certified,false);
  }
});
test('status page reuses existing QA request and keeps release/billing/trading locks',()=>{
  const status=readFileSync(new URL('../src/status.ts',import.meta.url),'utf8');
  const qa=readFileSync(new URL('../api/autonomous-qa-matrix.js',import.meta.url),'utf8');
  const checkout=readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8');
  const payment=readFileSync(new URL('../supabase/functions/create-checkout/index.ts',import.meta.url),'utf8');
  assert.match(status,/import \{describeQaObservation\} from '\.\/v287-qa-observation\.mjs'/);
  assert.match(status,/const qaTruth = describeQaObservation\(\{admitted:qaAdmission\.admitted,result:qa\}\)/);
  assert.match(status,/qaTruth\.label/);
  assert.match(status,/QA evidence class:/);
  assert.match(status,/evaluateLaunchReadiness\(\{ auth, readiness, billing, qa, gold \}\)/);
  assert.equal((status.match(/readSite\('\/api\/autonomous-qa-matrix\?status_surface=1'\)/g)||[]).length,1);
  assert.match(qa,/await preflightV285QaAdmission\(\)/);
  assert.match(checkout,/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
  assert.match(payment,/V272_CHARGES_ENABLED=false/);
});
