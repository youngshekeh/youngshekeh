import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessStatusDependencyAdmission,probeStatusDependencies} from '../src/status-dependency-admission.mjs';
const now=Date.parse('2026-10-23T13:50:00Z');
const make=(active=false,at=new Date(now-1000).toISOString())=>({
 response:{ok:true,headers:{get:()=>null}},
 data:{ok:true,generated_at:at,state:active?'BUILD_HOLD':'FULL_ACCEPTANCE_READY',database_incident:{active}}
});
test('active current PostgREST incident defers two costly dependent reads without calling them',async()=>{
 let calls=0;
 const r=await probeStatusDependencies({readiness:make(true),now:()=>now,
   readAuth:()=>{calls++;throw Error('must not call')},
   readBilling:()=>{calls++;throw Error('must not call')}});
 assert.equal(calls,0);assert.equal(r.requests_sent,0);
 assert.equal(r.admission.reason,'DATABASE_INCIDENT_ACTIVE');
 assert.equal(r.auth.response.ok,false);
 assert.equal(r.billing.data.ok,false);
 assert.match(r.billing.data.state,/DEFERRED/);
 assert.equal(r.admission.capital_permission,'0R');
});
test('stale, missing or failed readiness defers and cannot create a green signal',async()=>{
 const candidates=[null,{response:{ok:false},data:make(false).data},
   make(false,new Date(now-30*60_000).toISOString()),
   {response:{ok:true},data:{ok:true,generated_at:new Date(now).toISOString(),state:'READY'}},
   {...make(false),data:{...make(false).data,database_incident:{active:'false'}}}
 ];
 for(const readiness of candidates){
  let n=0;
  const result=await probeStatusDependencies({readiness,now:()=>now,
   readAuth:()=>{n++;return{response:{ok:true},data:{ok:true}}},
   readBilling:()=>{n++;return{response:{ok:true},data:{ok:true}}}});
  assert.equal(n,0);assert.equal(result.requests_sent,0);
  assert.equal(result.admission.admitted,false);
 }
});
test('fresh cleared incident restores both independent probes in parallel',async()=>{
 let a=0,b=0;const readiness=make(false);
 const output=await probeStatusDependencies({readiness,now:()=>now,
  readAuth:async()=>{a++;return{response:{ok:true},data:{ok:true,state:'PASSWORD_AUTH_READY'}}},
  readBilling:async()=>{b++;return{response:{ok:true},data:{ok:true,state:'LIVE_FLOW_VERIFIED'}}}
 });
 assert.equal(a,1);assert.equal(b,1);assert.equal(output.requests_sent,2);
 assert.equal(output.admission.reason,'DATABASE_INCIDENT_CLEARED');
 assert.equal(output.auth.data.state,'PASSWORD_AUTH_READY');
 assert.equal(output.billing.data.state,'LIVE_FLOW_VERIFIED');
 assert.equal(output.admission.billing_verified,false);
});
test('failures of independent dependent probes remain unavailable, never cached acceptance',async()=>{
 const r=await probeStatusDependencies({readiness:make(false),now:()=>now,
  readAuth:async()=>{throw Error('private_auth_503')},
  readBilling:async()=>({response:{ok:false},data:{ok:false,state:'BILLING_LEDGER_UNAVAILABLE'}})});
 assert.equal(r.auth.data.state,'UNAVAILABLE');
 assert.equal(r.billing.data.state,'BILLING_LEDGER_UNAVAILABLE');
 assert.equal(r.auth.response.ok,false);
 assert.equal(r.billing.response.ok,false);
});
test('all admission checks refuse private QA, identity and capital certification',()=>{
 for(const active of [true,false]){
  const verdict=assessStatusDependencyAdmission(make(active),now);
  for(const key of ['auth_verified','billing_verified','private_qa_verified','kernel_verified','live_order_submission_enabled'])assert.equal(verdict[key],false,key);
  assert.equal(verdict.capital_permission,'0R');
 }
});
test('status page preserves isolated public probe, Gold read and mandatory release evaluator',()=>{
 const src=readFileSync(new URL('../src/status.ts',import.meta.url),'utf8');
 assert.match(src,/const results = await Promise\.allSettled\(\[/);
 assert.match(src,/readEdge\('public-final-readiness'\)/);
 assert.match(src,/readSite\('\/api\/public-gold-read'\)/);
 assert.match(src,/probeStatusDependencies/);
 assert.match(src,/evaluateLaunchReadiness\(\{ auth, readiness, billing, qa, gold \}\)/);
 assert.match(src,/void loadPublic\(\);\s*void load\(\)/);
 assert.match(src,/No live orders authorized/);
});
test('incident lane cannot import database, service role, token or transaction logic',()=>{
 const src=readFileSync(new URL('../src/status-dependency-admission.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/cron\.(?:schedule|unschedule|alter_job)|fetch\(|SERVICE_ROLE|SUPABASE_DB_URL|place_order|submit_trade/i);
});
