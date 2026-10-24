import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyTransport,assessRecoveryTriage} from '../src/read-only-recovery-triage.mjs';
import {collectRecoveryTriage,recoveryProbeDeadline} from '../api/public-recovery-triage.js';
const now=Date.parse('2026-10-23T17:52:00Z');
const r=Object.freeze({transport:'HTTP_RESPONSE',status:200});
const incident=()=>({
 ...r,data:{ok:true,state:'BUILD_HOLD',
  generated_at:new Date(now-1200).toISOString(),
  database_incident:{active:true,code:'POSTGREST_RUNTIME_UNAVAILABLE'},
  hard_blockers:['database_incident','auth_runtime','runtime_baseline','billing_preflight'],
  acceptance_pending:[],external_unknowns:[]}
});
test('a DB incident remains a hold even if Auth and REST HTTP endpoints respond',()=>{
 const v=assessRecoveryTriage({auth:r,rest:r,readiness:incident()},now);
 assert.equal(v.state,'DATABASE INCIDENT REPORTED');
 assert.equal(v.checks.auth_http.transport_reachable,true);
 assert.equal(v.checks.postgrest_http.transport_reachable,true);
 assert.equal(v.checks.postgrest_http.service_ready,false);
 assert.equal(v.checks.database_incident_code,'POSTGREST_RUNTIME_UNAVAILABLE');
 assert.equal(v.governance.capital_permission,'0R');
 assert.equal(v.governance.commercial_launch_certified,false);
 assert.equal(v.private_actions_executed,0);
 assert.equal(v.database_jobs_modified,0);
});
test('an HTTP 401/403 proves a response, never login nor database readiness',()=>{
 for(const status of [401,403,429,500,503]){
  const v=classifyTransport({transport:'HTTP_RESPONSE',status});
  assert.equal(v.transport_reachable,true);
  assert.equal(v.service_ready,false);
  assert.equal(v.state,'HTTP ERROR');
 }
});
test('healthy status codes do not establish a valid user login or SQL connection',()=>{
 for(const status of [200,202,204,301,302]){
  const v=classifyTransport({transport:'HTTP_RESPONSE',status});
  assert.equal(v.state,'HTTP RESPONDED');
  assert.equal(v.service_ready,false);
 }
});
test('provider timeout, DNS failure and empty evidence are not verified',()=>{
 for(const x of [null,{}, {transport:'TIMEOUT',status:0},
  {transport:'ERROR',status:0},{transport:'HTTP_RESPONSE',status:999}]){
  const v=classifyTransport(x);
  assert.equal(v.transport_reachable,false);
  assert.equal(v.service_ready,false);
 }
});
test('missing, malformed, stale and future-dated release evidence remain unverified',()=>{
 const base=incident();
 for(const invalid of [
  null,{...base,data:{...base.data,generated_at:null}},
  {...base,data:{...base.data,generated_at:'2050-01-01T00:00:00Z'}},
  {...base,data:{...base.data,generated_at:new Date(now-310000).toISOString()}},
  {...base,status:503},{...base,data:{...base.data,ok:false}}
 ]){
  const v=assessRecoveryTriage({auth:r,rest:r,readiness:invalid},now);
  assert.equal(v.state,'PRIVATE READINESS UNVERIFIED');
  assert.equal(v.checks.readiness_source_current,false);
  assert.equal(v.governance.action_permitted,'WAIT');
 }
});
test('even a claimed full-acceptance response still requires independent private certification',()=>{
 const ready={...incident(),data:{...incident().data,
  state:'FULL_ACCEPTANCE_READY',database_incident:{active:false},
  hard_blockers:[]}};
 const v=assessRecoveryTriage({auth:r,rest:r,readiness:ready},now);
 assert.equal(v.state,'PRIVATE CERTIFICATION NOT ESTABLISHED');
 assert.equal(v.governance.commercial_launch_certified,false);
 assert.equal(v.checks.database_incident_reported,false);
});
test('diagnostic sanitizes unexpected incident codes and arbitrary blocker names',()=>{
 const sample=incident();
 sample.data.hard_blockers.push('SECRET_DO_NOT_ECHO');
 sample.data.database_incident={active:true,code:'DATABASE_PASSWORD_LEAK'};
 const v=assessRecoveryTriage({auth:r,rest:r,readiness:sample},now);
 assert.equal(v.checks.database_incident_code,null);
 assert.equal(v.checks.blockers.includes('SECRET_DO_NOT_ECHO'),false);
 assert.equal(JSON.stringify(v).includes('DATABASE_PASSWORD_LEAK'),false);
});
test('only the fixed current incident source receives an extended bounded observation window',()=>{
 assert.equal(recoveryProbeDeadline('/auth/v1/health'),4700);
 assert.equal(recoveryProbeDeadline('/rest/v1/'),4700);
 assert.equal(recoveryProbeDeadline('/functions/v1/public-final-readiness'),9000);
 assert.equal(recoveryProbeDeadline('/functions/v1/public-final-readiness?cache=1'),4700);
});
test('probe uses three fixed endpoints, independently, with no supplied user URL',async()=>{
 const calls=[];
 const v=await collectRecoveryTriage({now:()=>now,probe:async(path,opts)=>{
  calls.push([path,opts||{}]);
  if(path==='/rest/v1/')throw Error('network failed');
  return path.includes('public-final')?incident():r;
 }});
 assert.deepEqual(calls.map(x=>x[0]),[
  '/auth/v1/health','/rest/v1/','/functions/v1/public-final-readiness'
 ]);
 assert.equal(v.checks.auth_http.transport_reachable,true);
 assert.equal(v.checks.postgrest_http.transport_reachable,false);
 assert.equal(v.checks.database_incident_reported,true);
 assert.equal(v.governance.live_order_submission_enabled,false);
});
test('one vendor timeout does not erase other independent evidence',async()=>{
 const v=await collectRecoveryTriage({now:()=>now,probe:async(path)=>{
  if(path.includes('/auth/'))throw Error('TIMEOUT');
  return path.includes('public-final')?incident():r;
 }});
 assert.equal(v.checks.auth_http.transport_reachable,false);
 assert.equal(v.checks.postgrest_http.transport_reachable,true);
 assert.equal(v.checks.readiness_source_current,true);
 assert.equal(v.state,'DATABASE INCIDENT REPORTED');
});
test('recovery diagnostic is click-only, fixed-host and can never mutate DB or credentials',()=>{
 const route=readFileSync(new URL('../api/public-recovery-triage.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../src/status.ts',import.meta.url),'utf8');
 const html=readFileSync(new URL('../status/index.html',import.meta.url),'utf8');
 assert.match(route,/req.method!=='GET'/);
 assert.match(route,/const PROJECT='https:\/\/mpcelmjiycjpdyyflisn.supabase.co'/);
 assert.match(route,/CACHE_MS=90000/);
 assert.match(route,/BUDGET_MS=4700/);
 assert.match(route,/READINESS_BUDGET_MS=9000/);
 assert.match(route,/signal:AbortSignal\.timeout\(recoveryProbeDeadline\(path\)\)/);
 assert.match(route,/safely\('\/rest\/v1\/'/);
 assert.match(ui,/recovery-triage-check/);
 assert.match(ui,/freshEvidence\(d.generated_at\)/);
 assert.doesNotMatch(ui,/void inspectRecoveryTriage\(\);\s*void load/);
 assert.match(html,/NOT CHECKED · NO AUTOMATIC PROBE/);
 assert.doesNotMatch(route+ui,/SUPABASE_SERVICE_ROLE|SUPABASE_DB_URL|ALTER DATABASE|cron\.alter_job|place_order|execute_trade|process\.env\.DATABASE_URL/);
});
