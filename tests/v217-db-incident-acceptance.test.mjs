import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {summarizeIncident,assessDatabaseRecovery,supportSummary,DB_INCIDENT_SCHEMA} from '../src/db-incident-acceptance.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const now=Date.parse('2026-10-20T19:37:35Z');
const recent=new Date(now-1000).toISOString();
const clean=()=>({
 observed_at:recent,
 incident:summarizeIncident([],now),
 management_sql:{ok:true,observed_at:recent},
 postgrest_probe:{ok:true,schema_cache_ready:true,observed_at:recent},
 cron:{active_jobs:58,enabled:'on',recent_startup_timeouts:0,observed_at:recent},
 heartbeat_runs:[
  {run_id:'a',status:'SUCCEEDED',mode:'EXECUTE',health_state:'HEALTHY',
   finished_at:new Date(now-8*60000).toISOString(),seal:{sealed:true,transport:'SQL_POOLER_VERIFIED'},
   governance:{action_permitted:'WAIT',capital_permission:'0R',trades_sent:false,funds_moved:false}},
  {run_id:'b',status:'SUCCEEDED',mode:'EXECUTE',health_state:'HEALTHY',
   finished_at:new Date(now-3*60000).toISOString(),seal:{sealed:true,transport:'POSTGREST_VERIFIED'},
   governance:{action_permitted:'WAIT',capital_permission:'0R',trades_sent:false,funds_moved:false}}
 ],
 payment:{full_live_acceptance:true,signed_webhook_verified:true,entitlement_verified:true,observed_at:recent}
});
test('only known technical incident codes are retained; customer payloads never appear',()=>{
 const events=[
  {timestamp:recent,event_message:'PGRST002 57014 client email ava@private.test JWT eyJhbGciOiJIUzI1NiJ9'},
  {timestamp:recent,event_message:'cron job 24 job startup timeout; password=secret-value'},
  {timestamp:recent,event_message:'Connection terminated due to connection timeout'},
  {timestamp:recent,event_message:'V180_CONTINUOUS_KERNEL_ERROR KERNEL_SEAL'},
  {timestamp:new Date(now-2*3600000).toISOString(),event_message:'PGRST002'}
 ];
 const evidence=summarizeIncident(events,now);
 assert.equal(evidence.schema,DB_INCIDENT_SCHEMA);
 assert.equal(evidence.recent_event_count,4);
 assert.equal(evidence.codes.PGRST002,1);
 assert.equal(evidence.codes['57014'],1);
 assert.equal(evidence.codes.CRON_STARTUP_TIMEOUT,1);
 assert.equal(evidence.codes.MANAGEMENT_SQL_TIMEOUT,1);
 assert.equal(evidence.codes.KERNEL_SEAL,1);
 assert.doesNotMatch(JSON.stringify(evidence),/private\.test|secret-value|eyJhb/);
 const text=supportSummary(evidence);
 assert.doesNotMatch(text,/private\.test|password|eyJhb/);
 assert.match(text,/PGRST002/);
});
test('strict recovery is only for final operator QA, never automatic payment release',()=>{
 const result=assessDatabaseRecovery(clean(),now);
 assert.equal(result.ready_for_operator_final_qa,true);
 assert.equal(result.state,'READY_FOR_OPERATOR_FINAL_QA');
 assert.equal(result.governance.automatic_checkout_unlock,false);
 assert.equal(result.governance.real_orders,false);
 assert.equal(result.governance.trading,'WAIT / 0R');
});
test('live observed errors block database recovery',()=>{
 const data=clean();data.incident=summarizeIncident([{timestamp:recent,event_message:'PGRST002'}],now);
 assert.ok(assessDatabaseRecovery(data,now).blockers.includes('RECENT_DATABASE_ERRORS'));
});
test('missing or stale management and PostgREST proof fail closed',()=>{
 const data=clean();data.management_sql.ok=false;
 assert.ok(assessDatabaseRecovery(data,now).blockers.includes('MANAGEMENT_SQL_NOT_VERIFIED'));
 data.management_sql.ok=true;data.postgrest_probe.schema_cache_ready=false;
 assert.ok(assessDatabaseRecovery(data,now).blockers.includes('POSTGREST_CACHE_NOT_VERIFIED'));
 data.postgrest_probe.schema_cache_ready=true;data.observed_at='2026-10-20T18:00:00Z';
 assert.ok(assessDatabaseRecovery(data,now).blockers.includes('OBSERVATION_NOT_FRESH'));
});
test('unverified cron startup, stopped jobs or changed expected inventory fail closed',()=>{
 for(const update of [{active_jobs:57},{enabled:'off'},{recent_startup_timeouts:1}]){
  const data=clean();Object.assign(data.cron,update);
  assert.ok(assessDatabaseRecovery(data,now).blockers.includes('SCHEDULER_RUNTIME_NOT_VERIFIED'));
 }
});
test('two distinct finished kernel executions must be sealed and at least one minute apart',()=>{
 const data=clean();data.heartbeat_runs[1].run_id='a';
 assert.ok(assessDatabaseRecovery(data,now).blockers.includes('TWO_DISTINCT_KERNEL_CYCLES_NOT_VERIFIED'));
 data.heartbeat_runs[1].run_id='b';data.heartbeat_runs[0].mode='DEAD_LETTER_HOLD';
 assert.ok(assessDatabaseRecovery(data,now).blockers.includes('TWO_DISTINCT_KERNEL_CYCLES_NOT_VERIFIED'));
 data.heartbeat_runs[0].mode='EXECUTE';data.heartbeat_runs[0].seal.transport='UNVERIFIED';
 assert.ok(assessDatabaseRecovery(data,now).blockers.includes('TWO_DISTINCT_KERNEL_CYCLES_NOT_VERIFIED'));
 data.heartbeat_runs[0].seal.transport='SQL_POOLER_VERIFIED';data.heartbeat_runs[0].finished_at=data.heartbeat_runs[1].finished_at;
 assert.ok(assessDatabaseRecovery(data,now).blockers.includes('TWO_DISTINCT_KERNEL_CYCLES_NOT_VERIFIED'));
});
test('failed signed webhook and absent entitlements hold paid launch',()=>{
 const data=clean();data.payment.signed_webhook_verified=false;
 assert.ok(assessDatabaseRecovery(data,now).blockers.includes('PAYMENT_FULFILMENT_NOT_VERIFIED'));
 data.payment.signed_webhook_verified=true;data.payment.entitlement_verified=false;
 assert.ok(assessDatabaseRecovery(data,now).blockers.includes('PAYMENT_FULFILMENT_NOT_VERIFIED'));
});
test('checked-in incident evidence is redacted and accurately remains launch HOLD',()=>{
 const data=JSON.parse(read('docs/operations/evidence/v217-20261020-redacted-snapshot.json'));
 const nowAt=Date.parse(data.observed_at);
 const incident=summarizeIncident(data.events,nowAt);
 const verdict=assessDatabaseRecovery({...data,incident},nowAt);
 assert.equal(verdict.state,'LAUNCH_HOLD');
 assert.ok(verdict.blockers.includes('RECENT_DATABASE_ERRORS'));
 assert.ok(verdict.blockers.includes('POSTGREST_CACHE_NOT_VERIFIED'));
 assert.ok(verdict.blockers.includes('TWO_DISTINCT_KERNEL_CYCLES_NOT_VERIFIED'));
 assert.ok(verdict.blockers.includes('PAYMENT_FULFILMENT_NOT_VERIFIED'));
 assert.doesNotMatch(JSON.stringify(data),/Bearer\s|sk-proj-|password=|Authorization:/i);
});
test('the diagnostics runner only handles local inputs and cannot mutate the database',()=>{
 const src=read('scripts/v217-db-incident.mjs');
 assert.match(src,/support-summary\.md/);
 assert.match(src,/launch-verdict\.json/);
 assert.match(src,/assessDatabaseRecovery/);
 assert.doesNotMatch(src,/\bfetch\s*\(|ALTER ROLE|ALTER SYSTEM|cron\.unschedule|UPDATE public\./i);
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(read('api/ops-heartbeat.js'),/certifyKernelReceipt/);
});
