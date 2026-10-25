import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {attributePrivateQaBlockers} from '../src/v297-private-qa-causality.mjs';
const make=()=>{
 const tests=Array.from({length:107},(_,i)=>({
  name:'test_'+i,pass:i<77,
  detail:i>=77&&i<98?'state=undefined, output=n/a':'contract_failed'
 }));
 return {response:{ok:true,status:200},data:{
  ok:false,state:'FAIL',version:'v205.0',summary:{passed:77,failed:30,total:107},tests,
  transport:{incomplete:false,not_started_probes:0,deadline_aborted_probes:0,
   probes:[{name:'mission',status:503},{name:'productionClosure',status:503},
    {name:'auto',status:200},{name:'quota',status:200}]},
  invariants:{capital_permission:'0R'}
 }};
};
test('V297 actual 107-test incomplete-engine evidence is not converted into a pass',()=>{
 const r=attributePrivateQaBlockers({admitted:true,result:make()});
 assert.equal(r.kind,'REAL_MATRIX_FAILED');
 assert.equal(r.total,107);assert.equal(r.failed,30);
 assert.equal(r.missing_values,21);
 assert.equal(r.mission_http_503,true);
 assert.equal(r.closure_http_503,true);
 assert.equal(r.all_transport_started,true);
 assert.match(r.summary,/77\/107 QA CHECKS/);
 assert.match(r.summary,/MISSION SERVICE UNAVAILABLE/);
 assert.match(r.summary,/21 WITH MISSING VALUES/);
 assert.match(r.summary,/NOT LAUNCH-CERTIFIED/);
 assert.equal(r.certified,false);assert.equal(r.commercial_launch_allowed,false);
 assert.equal(r.capital_permission,'0R');
});
test('V297 absent transport, retry-deferred, invalid and synthetic QA remain unverified',()=>{
 const ok=make();
 const tampered=[
 {response:{ok:false,status:503},data:ok.data},
 {response:{ok:true,status:200},data:{summary:{passed:0,failed:1,total:1},tests:[{name:'x',pass:false}],version:'v78-unknown'}},
 {response:{ok:true,status:200},data:{...ok.data,summary:{passed:107,failed:0,total:107}}},
 {response:{ok:true,status:200},data:{...ok.data,invariants:{capital_permission:'1R'}}},
 {response:{ok:true,status:200},data:{...ok.data,tests:ok.data.tests.slice(0,99)}},
 {response:{ok:true,status:200},data:{...ok.data,tests:[...ok.data.tests.slice(0,106),{name:'bad',pass:'false'}]}}
 ];
 for(const result of tampered){
  const r=attributePrivateQaBlockers({admitted:true,result});
  assert.equal(r.certified,false);
  assert.equal(r.commercial_launch_allowed,false);
  assert.notEqual(r.kind,'REAL_MATRIX_FAILED');
 }
 assert.equal(attributePrivateQaBlockers({admitted:false,result:ok}).kind,'NOT_REQUESTED');
});
test('V297 full matrix with no source-probe receipts cannot infer OIDC, recovery or certification',()=>{
 const packet=make();
 packet.data.transport.probes=[];
 const r=attributePrivateQaBlockers({admitted:true,result:packet});
 assert.equal(r.kind,'REAL_MATRIX_FAILED');
 assert.equal(r.mission_http_503,false);
 assert.equal(r.closure_http_503,false);
 assert.match(r.summary,/MISSION SERVICE NOT VERIFIED/);
 assert.match(r.summary,/CLOSURE STATUS NOT VERIFIED/);
 assert.equal(r.certified,false);
});
test('V297 published status consumes existing admitted QA evidence only',()=>{
 const src=readFileSync(new URL('../src/status.ts',import.meta.url),'utf8');
 const qa=readFileSync(new URL('../api/autonomous-qa-matrix.js',import.meta.url),'utf8');
 assert.match(src,/import \{attributePrivateQaBlockers\} from '\.\/v297-private-qa-causality\.mjs'/);
 assert.match(src,/const qaBlockers = attributePrivateQaBlockers\(\{admitted:qaAdmission\.admitted,result:qa\}\)/);
 assert.match(src,/QA causal attribution:/);
 assert.match(src,/evaluateLaunchReadiness\(\{ auth, readiness, billing, qa, gold \}\)/);
 assert.equal((src.match(/readSite\('\/api\/autonomous-qa-matrix\?status_surface=1'\)/g)||[]).length,1);
 assert.match(qa,/await preflightV285QaAdmission\(\)/);
 assert.match(readFileSync(new URL('../src\/checkout.ts',import.meta.url),'utf8'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(readFileSync(new URL('../supabase\/functions\/create-checkout\/index.ts',import.meta.url),'utf8'),/V272_CHARGES_ENABLED=false/);
});
