import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {summarizeIncident,assessDatabaseRecovery,supportSummary,DB_INCIDENT_SCHEMA,twoDistinctSealedCycles,twoStableSqlReads} from '../src/db-incident-acceptance.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const now=Date.parse('2026-10-20T19:37:35Z');
const recent=new Date(now-1000).toISOString();
const clean=()=>({
 observed_at:recent,
 incident:summarizeIncident([],now),
 management_sql:{ok:true,observed_at:recent},
 management_sql_samples:[
  {probe_id:'probe-01',source:'SUPABASE_MANAGEMENT_SQL',check:'SELECT_NOW',
   ok:true,observed_at:new Date(now-4*60_000).toISOString(),
   database_time:new Date(now-4*60_000).toISOString()},
  {probe_id:'probe-02',source:'SUPABASE_MANAGEMENT_SQL',check:'SELECT_NOW',
   ok:true,observed_at:recent,database_time:recent}
 ],
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
test('V267 recognizes current PostgREST pool and Supavisor auth timeouts without leaking raw logs',()=>{
 const errors=[
  {timestamp:recent,event_message:'{"code":"PGRST003","message":"Timed out acquiring connection from connection pool.","private":"not-for-display"}'},
  {timestamp:recent,event_message:'DbHandler: Authentication timeout after 15000ms user@example.private'},
  {timestamp:new Date(now-2*3600000).toISOString(),event_message:'PGRST003'},
  {timestamp:recent,event_message:'Normal authentication check succeeded'}
 ];
 const evidence=summarizeIncident(errors,now);
 assert.equal(evidence.codes.PGRST003,1);
 assert.equal(evidence.codes.POOLER_AUTH_TIMEOUT,1);
 assert.equal(evidence.recent_event_count,3);
 assert.doesNotMatch(JSON.stringify(evidence),/not-for-display|example.private/);
 const support=supportSummary(evidence);
 assert.match(support,/PGRST003: 1/);
 assert.match(support,/POOLER_AUTH_TIMEOUT: 1/);
 assert.doesNotMatch(support,/not-for-display|example.private/);
 for(const message of ['PGRST003','DbHandler: Authentication timeout after 15000ms']){
  const data=clean();
  data.incident=summarizeIncident([{timestamp:recent,event_message:message}],now);
  const verdict=assessDatabaseRecovery(data,now);
  assert.equal(verdict.state,'LAUNCH_HOLD');
  assert.ok(verdict.blockers.includes('RECENT_DATABASE_ERRORS'));
  assert.equal(verdict.governance.automatic_checkout_unlock,false);
  assert.equal(verdict.governance.real_orders,false);
 }
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
test('V269 duplicate and contradictory sealed kernel receipts never grant false two-cycle proof',()=>{
 const fixture=clean(),a=fixture.heartbeat_runs[0],b=fixture.heartbeat_runs[1];
 assert.equal(twoDistinctSealedCycles([a,b],now),true);
 assert.equal(twoDistinctSealedCycles([a,a],now),false);
 const duplicateOld={...a,finished_at:new Date(now-14*60000).toISOString()};
 assert.equal(twoDistinctSealedCycles([a,duplicateOld,b],now),false,
  'a reused ID with different times is contradictory even with a distinct other ID');
 const duplicatedSame={...a};
 assert.equal(twoDistinctSealedCycles([a,duplicatedSame,b],now),true,
  'identical retransmissions cannot replace a second cycle, but do not invalidate it');
 const sameClock={...b,finished_at:a.finished_at};
 assert.equal(twoDistinctSealedCycles([a,sameClock],now),false);
 const near={...b,finished_at:new Date(Date.parse(a.finished_at)+59_999).toISOString()};
 assert.equal(twoDistinctSealedCycles([a,near],now),false);
 assert.equal(twoDistinctSealedCycles([a,b,{...a,run_id:'other',seal:{sealed:false}}],now),true,
  'failed extra evidence cannot count as a valid cycle');
 const invalid=clean();invalid.heartbeat_runs=[a,duplicateOld,b];
 const verdict=assessDatabaseRecovery(invalid,now);
 assert.equal(verdict.state,'LAUNCH_HOLD');
 assert.ok(verdict.blockers.includes('TWO_DISTINCT_KERNEL_CYCLES_NOT_VERIFIED'));
 assert.equal(verdict.governance.real_orders,false);
 assert.equal(verdict.governance.automatic_checkout_unlock,false);
});
test('V269 two valid unique IDs at different times qualify regardless of row order',()=>{
 const fixture=clean(),[a,b]=fixture.heartbeat_runs;
 const extra={...a,run_id:'third',finished_at:new Date(now-5*60000).toISOString()};
 assert.equal(twoDistinctSealedCycles([extra,a,b],now),true);
 assert.equal(twoDistinctSealedCycles([b,a],now),true);
 assert.equal(twoDistinctSealedCycles(new Array(257).fill(a),now),false);
 assert.equal(twoDistinctSealedCycles([{...a,governance:{...a.governance,capital_permission:'1R'}},b],now),false);
 assert.equal(twoDistinctSealedCycles([],now),false);
});
test('V270 requires two independent successful SQL queries over time, not one lucky SELECT',()=>{
 const p=clean();
 assert.equal(twoStableSqlReads(p.management_sql_samples,now),true);
 assert.equal(assessDatabaseRecovery(p,now).ready_for_operator_final_qa,true);
 for(const change of [
  [],
  [p.management_sql_samples[0]],
  [p.management_sql_samples[1],p.management_sql_samples[1]],
  [p.management_sql_samples[0],{...p.management_sql_samples[1],
   probe_id:'probe-01'}],
  [p.management_sql_samples[0],{...p.management_sql_samples[1],
   observed_at:new Date(Date.parse(p.management_sql_samples[0].observed_at)+59_999).toISOString(),
   database_time:new Date(Date.parse(p.management_sql_samples[0].observed_at)+59_999).toISOString()}],
  [p.management_sql_samples[0],{...p.management_sql_samples[1],
   database_time:new Date(now-15*60_000).toISOString()}],
  [p.management_sql_samples[0],{...p.management_sql_samples[1],
   source:'UNVERIFIED'}],
  [p.management_sql_samples[0],{...p.management_sql_samples[1],
   check:'SELECT_ALL_CUSTOMERS'}],
  [p.management_sql_samples[0],{...p.management_sql_samples[1],
   ok:false,error:'Connection terminated due to connection timeout'}],
  [p.management_sql_samples[0],{...p.management_sql_samples[1],
   observed_at:new Date(now-12*60_000).toISOString()}]
 ]){
  const data=clean();data.management_sql_samples=change;
  assert.equal(twoStableSqlReads(change,now),false);
  const verdict=assessDatabaseRecovery(data,now);
  assert.equal(verdict.state,'LAUNCH_HOLD');
  assert.ok(verdict.blockers.includes('MANAGEMENT_SQL_STABILITY_NOT_VERIFIED'));
  assert.equal(verdict.governance.automatic_checkout_unlock,false);
  assert.equal(verdict.governance.real_orders,false);
 }
});
test('V270 rejected SQL failures cannot be overwritten by a later success',()=>{
 const p=clean(),bad={probe_id:'failed-03',source:'SUPABASE_MANAGEMENT_SQL',
  check:'SELECT_NOW',ok:false,observed_at:recent,database_time:recent,
  error:'Management connection timeout'};
 p.management_sql_samples.push(bad);
 assert.equal(twoStableSqlReads(p.management_sql_samples,now),false);
 assert.equal(assessDatabaseRecovery(p,now).state,'LAUNCH_HOLD');
});
test('V270 identical delivery replay is allowed only alongside another actual SQL probe',()=>{
 const p=clean(),[a,b]=p.management_sql_samples;
 assert.equal(twoStableSqlReads([a,a,b],now),true);
 assert.equal(twoStableSqlReads([a,a],now),false);
 assert.equal(twoStableSqlReads([a,b,{...a,observed_at:recent,
  database_time:recent}],now),false);
 const delayed=[{...a,observed_at:new Date(now-9*60_000).toISOString(),
  database_time:new Date(now-9*60_000).toISOString()},
  {...b,observed_at:new Date(now-6*60_000).toISOString(),
   database_time:new Date(now-6*60_000).toISOString()}];
 assert.equal(twoStableSqlReads(delayed,now),false,
  'missing recent successful query cannot certify recovery');
 assert.equal(twoStableSqlReads(new Array(65).fill(a),now),false);
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
 assert.ok(verdict.blockers.includes('MANAGEMENT_SQL_STABILITY_NOT_VERIFIED'));
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
