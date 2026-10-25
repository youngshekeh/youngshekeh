import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyHeartbeatIncident,checkHeartbeatIncident,INCIDENT_READ_BUDGET_MS}
 from '../src/v307-heartbeat-incident-admission.mjs';
const now=Date.parse('2026-10-25T14:15:00Z');
const at=(n)=>new Date(now-n).toISOString();
const evidence=()=>({
 ok:true,version:'v258-readonly-recovery-triage-v1',
 generated_at:at(2000),state:'DATABASE INCIDENT REPORTED',
 checks:{readiness_source_current:true,database_incident_reported:true,
 database_incident_code:'POSTGREST_RUNTIME_UNAVAILABLE'},
 private_actions_executed:0,database_jobs_modified:0,
 governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false}
});
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('V307 exact recent incident defers private cycle without certifying health',()=>{
 const v=classifyHeartbeatIncident({responseOk:true,data:evidence()},now);
 assert.equal(v.defer_private_kernel,true);
 assert.equal(v.verified_active_database_incident,true);
 assert.equal(v.certified_private_kernel,false);
 assert.equal(v.certified_commercial_launch,false);
 assert.equal(v.capital_permission,'0R');
});
test('V307 stale, future, missing, fake or inconsistent evidence never defers',()=>{
 const v=evidence();
 const cases=[
  {responseOk:false,data:v},{responseOk:true,data:{}},
  {responseOk:true,data:{...v,generated_at:at(360000)}},
  {responseOk:true,data:{...v,generated_at:at(-120000)}},
  {responseOk:true,data:{...v,ok:false}},
  {responseOk:true,data:{...v,state:'PRIVATE READINESS UNVERIFIED'}},
  {responseOk:true,data:{...v,checks:{...v.checks,database_incident_reported:false}}},
  {responseOk:true,data:{...v,checks:{...v.checks,readiness_source_current:false}}},
  {responseOk:true,data:{...v,checks:{...v.checks,database_incident_code:null}}},
  {responseOk:true,data:{...v,governance:{...v.governance,capital_permission:'1R'}}},
  {responseOk:true,data:{...v,governance:{...v.governance,live_order_submission_enabled:true}}},
  {responseOk:true,data:{...v,database_jobs_modified:1}}
 ];
 for(const x of cases){
  const report=classifyHeartbeatIncident(x,now);
  assert.equal(report.defer_private_kernel,false,JSON.stringify(x));
  assert.equal(report.certified_private_kernel,false);
 }
});
test('V307 fixed-host bounded GET without credentials; real incident defers',async()=>{
 const called=[];
 const fetchImpl=async(url,opts)=>{called.push([url,opts]);return{
  ok:true,json:async()=>evidence()
 }};
 const result=await checkHeartbeatIncident({fetchImpl,now:()=>now});
 assert.equal(result.defer_private_kernel,true);
 assert.equal(called.length,1);
 assert.equal(called[0][0],'https://thefatheranalytics.com/api/public-recovery-triage');
 assert.equal(called[0][1].method,'GET');
 assert.equal(called[0][1].cache,'no-store');
 assert.equal(called[0][1].redirect,'error');
 assert.equal(called[0][1].headers.Authorization,undefined);
 assert.ok(INCIDENT_READ_BUDGET_MS<12000);
});
test('V307 failed transport / HTTP / JSON falls through to sealed kernel',async()=>{
 for(const impl of [async()=>{throw Error('timeout')},
  async()=>({ok:false,status:503}),
  async()=>({ok:true,json:async()=>{throw Error('bad json')}})]){
  assert.equal((await checkHeartbeatIncident({fetchImpl:impl,now:()=>now})).defer_private_kernel,false);
 }
});
test('V307 cron authorization, receipt and checkout guards persist',()=>{
 const hb=src('api/ops-heartbeat.js');
 assert.ok(hb.includes('authHeader!=='));
 assert.ok(hb.indexOf('authHeader!==')<hb.indexOf('await checkHeartbeatIncident()'));
 assert.ok(hb.indexOf('await checkHeartbeatIncident()')<hb.indexOf('await getVercelOidcToken()'));
 assert.ok(hb.indexOf('await checkHeartbeatIncident()')<hb.indexOf('const kernel=await callPrivate('));
 assert.match(hb,/if\(incident\.defer_private_kernel\)/);
 assert.match(hb,/KERNEL_DEFERRED_DURING_DATABASE_INCIDENT/);
 assert.match(hb,/kernel:\{attempted:false,ok:false\}/);
 assert.match(hb,/certifyKernelReceipt\(kernel\.body\)/);
 assert.match(hb,/V307_HEARTBEAT_LOAD_SHED/);
 assert.match(hb,/database_scheduler:\{changed:false/);
 assert.equal((hb.match(/await checkHeartbeatIncident\(\)/g)||[]).length,1);
 const cfg=JSON.parse(src('vercel.json'));
 assert.deepEqual(cfg.crons.filter(x=>x.path==='/api/ops-heartbeat'),
  [{path:'/api/ops-heartbeat',schedule:'4-59/5 * * * *'}]);
 assert.match(src('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(src('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
 assert.doesNotMatch(hb,/cron\.unschedule|cron\.alter_job|execute_trade|create-checkout/);
});
