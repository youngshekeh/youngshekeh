import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectRecoveryTriage} from '../api/public-recovery-triage.js';
import {assessProviderEdgeAdmission} from '../src/v283-provider-edge-admission.mjs';
const NOW=Date.parse('2026-10-25T13:15:00Z');
const body=(active)=>({ok:true,generated_at:new Date(NOW-800).toISOString(),
 database_incident:{active,code:'POSTGREST_RUNTIME_UNAVAILABLE'},
 hard_blockers:active?['database_incident','auth_runtime']:[]});
const observed=(b,status=200)=>({transport:'HTTP_RESPONSE',status,data:b});
const transport={transport:'HTTP_RESPONSE',status:200,data:null};
test('V306 confirmed fresh private DB incident sends exactly one readiness probe, no Auth or REST',async()=>{
 const called=[];
 const d=await collectRecoveryTriage({now:()=>NOW,probe:async(path)=>{
  called.push(path);
  if(path!=='/functions/v1/public-final-readiness')throw Error('unpermitted incident amplification');
  return observed(body(true));
 }});
 assert.deepEqual(called,['/functions/v1/public-final-readiness']);
 assert.equal(d.state,'DATABASE INCIDENT REPORTED');
 assert.equal(d.checks.database_incident_reported,true);
 assert.equal(d.checks.auth_http.state,'DEFERRED_BY_DATABASE_INCIDENT');
 assert.equal(d.checks.postgrest_http.state,'DEFERRED_BY_DATABASE_INCIDENT');
 assert.equal(d.checks.auth_http.transport_reachable,false);
 assert.equal(d.checks.postgrest_http.transport_reachable,false);
 assert.equal(d.checks.auth_http.service_ready,false);
 assert.equal(d.governance.commercial_launch_certified,false);
 assert.equal(d.governance.action_permitted,'WAIT');
 assert.equal(d.governance.capital_permission,'0R');
 assert.equal(d.private_actions_executed,0);
 assert.equal(d.database_jobs_modified,0);
 const admission=assessProviderEdgeAdmission({ok:true,status:200,body:d},NOW);
 assert.equal(admission.admitted,false);
 assert.equal(admission.reason,'DATABASE_INCIDENT_REPORTED');
});
test('V306 current explicitly cleared incident retains both independent transport probes',async()=>{
 const called=[];
 const d=await collectRecoveryTriage({now:()=>NOW,probe:async(path)=>{
  called.push(path);
  return path.includes('public-final')?observed(body(false)):transport;
 }});
 assert.deepEqual(called,['/functions/v1/public-final-readiness','/auth/v1/health','/rest/v1/']);
 assert.equal(d.state,'PRIVATE CERTIFICATION NOT ESTABLISHED');
 assert.equal(d.checks.database_incident_reported,false);
 assert.equal(d.checks.auth_http.transport_reachable,true);
 assert.equal(d.checks.postgrest_http.transport_reachable,true);
 assert.equal(d.governance.commercial_launch_certified,false);
});
test('V306 stale, future and failed incident sources never omit independent transport evidence',async()=>{
 const samples=[
  observed({...body(true),generated_at:new Date(NOW-310000).toISOString()}),
  observed({...body(true),generated_at:new Date(NOW+100000).toISOString()}),
  observed(body(true),503),
  {transport:'TIMEOUT',status:0,data:null},
  observed({...body(true),ok:false}),
  observed({...body(true),database_incident:{active:'true'}})
 ];
 for(const sample of samples){
  const calls=[];
  const d=await collectRecoveryTriage({now:()=>NOW,probe:async(path)=>{
   calls.push(path);
   return path.includes('public-final')?sample:transport;
  }});
  assert.deepEqual(calls,['/functions/v1/public-final-readiness','/auth/v1/health','/rest/v1/']);
  assert.equal(d.checks.auth_http.transport_reachable,true);
  assert.equal(d.checks.postgrest_http.transport_reachable,true);
  assert.equal(d.governance.action_permitted,'WAIT');
 }
});
test('V306 deferred probes are not misrepresented as a timeout or verified login',()=>{
 const policy=readFileSync(new URL('../src/read-only-recovery-triage.mjs',import.meta.url),'utf8');
 const route=readFileSync(new URL('../api/public-recovery-triage.js',import.meta.url),'utf8');
 const status=readFileSync(new URL('../src/status.ts',import.meta.url),'utf8');
 assert.match(policy,/state:'DEFERRED_BY_DATABASE_INCIDENT'/);
 assert.match(route,/incidentView.checks.readiness_source_current===true/);
 assert.match(route,/incidentView.checks.database_incident_reported===true/);
 assert.match(route,/const deferred=\{transport:'DEFERRED_DB_INCIDENT'/);
 assert.match(route,/Promise.all\(\[\s*safely\('\/auth\/v1\/health'\)/);
 assert.match(route,/CACHE_MS=90000/);
 assert.match(route,/READINESS_BUDGET_MS=9000/);
 assert.match(route,/req.method!=='GET'/);
 assert.match(status,/readSite\('\/api\/public-recovery-triage',15000\)/);
 assert.match(status,/async function readSite\(path, deadline=timeoutMs\)/);
 assert.equal((status.match(/readSite\('\/api\/public-recovery-triage'/g)||[]).length,1);
 assert.doesNotMatch(route+policy,/SUPABASE_SERVICE_ROLE_KEY|cron\.schedule|cron\.alter_job|\.insert\(|place_order|send_payment/i);
 assert.match(readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(readFileSync(new URL('../supabase/functions/create-checkout/index.ts',import.meta.url),'utf8'),/V272_CHARGES_ENABLED=false/);
});
