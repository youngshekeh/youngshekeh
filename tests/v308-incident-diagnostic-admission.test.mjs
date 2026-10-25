import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyHeartbeatIncident,checkHeartbeatIncident}
 from '../src/v307-heartbeat-incident-admission.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const paths=['api/connection-pressure-shadow.js','api/peak-minute-spreader-status.js'];
const at=Date.parse('2026-10-25T14:30:00.000Z');
const incident={
 ok:true,generated_at:new Date(at-1000).toISOString(),state:'DATABASE INCIDENT REPORTED',
 checks:{database_incident_reported:true,readiness_source_current:true,
  database_incident_code:'POSTGREST_RUNTIME_UNAVAILABLE'},
 private_actions_executed:0,database_jobs_modified:0,
 governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false}
};

test('V308 both routes retain their existing OIDC private targets and URLs',()=>{
 const expected=[
 ['api/connection-pressure-shadow.js','runtime-v147-connection-pressure-shadow'],
 ['api/peak-minute-spreader-status.js','runtime-v1461-peak-spreader-status']
 ];
 for(const [path,target] of expected){
  const src=read(path);
  assert.ok(src.includes(target));
  assert.ok(src.includes("import { getVercelOidcToken } from '@vercel/oidc'"));
  assert.ok(src.includes("import { checkHeartbeatIncident } from '../src/v307-heartbeat-incident-admission.mjs'"));
  assert.ok(src.includes('const incident=await checkHeartbeatIncident();'));
  assert.ok(src.includes('if(incident.defer_private_kernel)'));
  assert.ok(src.indexOf("if(req.method!=='GET')")<src.indexOf('await checkHeartbeatIncident()'));
  assert.ok(src.indexOf('await checkHeartbeatIncident()')<src.indexOf('await getVercelOidcToken()'));
  assert.ok(src.indexOf('await checkHeartbeatIncident()')<src.indexOf('await fetch(TARGET,'));
  assert.ok(src.includes("res.setHeader('Retry-After','300')"));
  assert.ok(src.includes("return failClosed(res,503,'verified_database_incident_diagnostic_deferred'"));
  assert.ok(src.includes('private_request_attempted:false'));
  assert.equal((src.match(/await checkHeartbeatIncident\(\)/g)||[]).length,1);
  assert.ok(src.includes('getVercelOidcToken()'));
  assert.ok(src.includes('Authorization:'));
  assert.ok(src.includes('AbortSignal.timeout(35000)'));
  assert.doesNotMatch(src,/cron\.unschedule|cron\.alter_job|execute_trade|create-checkout/);
 }
});
test('V308 verified active public incident defers both routes; never certifies runtime',()=>{
 const status=classifyHeartbeatIncident({responseOk:true,data:incident},at);
 assert.equal(status.defer_private_kernel,true);
 assert.equal(status.verified_active_database_incident,true);
 assert.equal(status.certified_private_kernel,false);
 assert.equal(status.certified_commercial_launch,false);
 assert.equal(status.capital_permission,'0R');
});
test('V308 clear, stale and contradictory evidence falls through to existing OIDC path',async()=>{
 const bad=[
 {...incident,state:'PRIVATE CERTIFICATION NOT ESTABLISHED',checks:{...incident.checks,database_incident_reported:false}},
 {...incident,generated_at:new Date(at-600000).toISOString()},
 {...incident,private_actions_executed:1},
 {...incident,governance:{...incident.governance,capital_permission:'2R'}}
 ];
 for(const v of bad){
  assert.equal(classifyHeartbeatIncident({responseOk:true,data:v},at).defer_private_kernel,false);
 }
 assert.equal((await checkHeartbeatIncident({now:()=>at,fetchImpl:async()=>{
  throw Error('unavailable');
 }})).defer_private_kernel,false);
});
test('V308 preserves original operator response shapes and financial locks',()=>{
 for(const path of paths){
  const src=read(path);
  assert.match(src,/state:'FAIL_CLOSED'/);
  assert.match(src,/capital_permission:'0R'/);
  assert.match(src,/automatic_/);
  assert.match(src,/res\.status\(upstream\.status\)\.json\(body\)/);
 }
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(read('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
 assert.match(read('api/ops-heartbeat.js'),/KERNEL_DEFERRED_DURING_DATABASE_INCIDENT/);
 assert.match(read('vercel.json'),/4-59\/5 \* \* \* \*/);
});
