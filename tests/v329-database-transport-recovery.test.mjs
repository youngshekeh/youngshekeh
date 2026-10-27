import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  assessDatabaseTransportV329,makeRedactedTransportSupportV329,
  TRANSPORT_EVIDENCE_SCHEMA_V329
} from '../src/v329-database-transport-evidence.mjs';
import {
  summarizeIncident,assessDatabaseRecovery,
  DB_INCIDENT_SCHEMA
} from '../src/db-incident-acceptance.mjs';

const now=Date.parse('2026-10-27T08:40:00.000Z');
const stamp=(delta)=>new Date(now-delta).toISOString();
const metrics=()=>({
  postgres_cancelled_57014:0,
  postgres_connection_08006:0,
  postgres_protocol_08P01:0,
  postgrest_timeout_events:0,
  postgrest_pooler_errors:0,
  supavisor_auth_timeouts:0,
  management_sql_connect_timeouts:0
});
const liveSnapshot=()=>({
  window_start:stamp(8*60_000),
  window_end:stamp(60_000),
  collected_at:stamp(30_000),
  sources:['postgres_logs','postgrest_logs','supavisor_logs'],
  log_query_complete:true,redacted:true,metrics:metrics()
});
const sqlProbe=(id,seconds)=>({
  ok:true,source:'SUPABASE_MANAGEMENT_SQL',check:'SELECT_NOW',
  probe_id:id,observed_at:stamp(seconds*1000),
  database_time:stamp(seconds*1000),
  error:null
});
const clean=()=>({
 snapshot:liveSnapshot(),
 management_sql_samples:[sqlProbe('a',170),sqlProbe('b',80)],
 postgrest_probe:{ok:true,schema_cache_ready:true,
  authenticated_read_only:true,observed_at:stamp(30_000)},
 control_plane:{status:'ACTIVE_HEALTHY'}
});
const judge=x=>assessDatabaseTransportV329(x,now);

test('valid sampled transport only enters independent REVIEW, never commercial READY',()=>{
  const x=judge(clean());
  assert.equal(x.schema,TRANSPORT_EVIDENCE_SCHEMA_V329);
  assert.equal(x.state,'TRANSPORT_EVIDENCE_REVIEWABLE');
  assert.equal(x.transport_ready_for_independent_review,true);
  assert.equal(x.governance.billing_activation_permitted,false);
  assert.equal(x.governance.trading_activation_permitted,false);
  assert.equal(x.governance.automatic_release_permitted,false);
  assert.equal(x.governance.capital_permission,'0R');
});
test('ACTIVE_HEALTHY alone cannot clear missing SQL, PostgREST or bad metrics',()=>{
  const x=clean();
  x.management_sql_samples=[];
  x.postgrest_probe={ok:false};
  x.snapshot.metrics.postgrest_timeout_events=13;
  const result=judge(x);
  assert.equal(result.management_status_only,'PROJECT_ACTIVE_HEALTHY');
  assert.equal(result.state,'DATABASE_RECOVERY_HOLD');
  assert.ok(result.blockers.includes('TRANSPORT_ERRORS_IN_WINDOW'));
  assert.ok(result.blockers.includes('TWO_SPACED_MANAGEMENT_SQL_READS_REQUIRED'));
  assert.ok(result.blockers.includes('AUTHENTICATED_POSTGREST_NOT_VERIFIED'));
});
test('repeated PostgREST Warp timeouts block review even when SQL probes pass',()=>{
  const x=clean();x.snapshot.metrics.postgrest_timeout_events=272;
  const r=judge(x);
  assert.equal(r.state,'DATABASE_RECOVERY_HOLD');
  assert.equal(r.observed_metric_totals.postgrest_timeout_events,272);
  assert.deepEqual(Array.from(r.blockers),['TRANSPORT_ERRORS_IN_WINDOW']);
});
test('each explicit transport metric independently blocks recovery',()=>{
  for(const key of Object.keys(metrics())){
    const x=clean();x.snapshot.metrics[key]=1;
    assert.equal(judge(x).state,'DATABASE_RECOVERY_HOLD',key);
    assert.ok(judge(x).blockers.includes('TRANSPORT_ERRORS_IN_WINDOW'));
  }
});
test('unverified and zero counts are distinguishable; null is not zero',()=>{
  const x=clean();
  x.snapshot.metrics.supavisor_auth_timeouts=null;
  const r=judge(x);
  assert.equal(r.state,'DATABASE_RECOVERY_HOLD');
  assert.ok(r.blockers.includes('TRANSPORT_LOG_WINDOW_NOT_VERIFIED'));
  assert.equal(r.observed_metric_totals,null);
  const ticket=makeRedactedTransportSupportV329(x.snapshot,r);
  assert.match(ticket,/supavisor_auth_timeouts: UNVERIFIED/);
  assert.match(ticket,/postgrest_timeout_events: 0/);
});
test('missing log source, incomplete query and duplicate source all fail closed',()=>{
  for(const invalid of [
    ['postgres_logs','postgrest_logs'],
    ['postgres_logs','postgres_logs','postgrest_logs']
  ]){
    const x=clean();x.snapshot.sources=invalid;
    assert.ok(judge(x).blockers.includes('TRANSPORT_LOG_WINDOW_NOT_VERIFIED'));
  }
  const x=clean();x.snapshot.log_query_complete=false;
  assert.ok(judge(x).blockers.includes('TRANSPORT_LOG_WINDOW_NOT_VERIFIED'));
});
test('old hour-long log aggregation cannot falsely certify current resolution',()=>{
  const x=clean();
  x.snapshot.window_start=stamp(85*60_000);
  x.snapshot.window_end=stamp(5*60_000);
  x.snapshot.collected_at=stamp(4*60_000);
  assert.equal(judge(x).state,'DATABASE_RECOVERY_HOLD');
  assert.ok(judge(x).blockers.includes('TRANSPORT_LOG_WINDOW_NOT_VERIFIED'));
});
test('historical V329 real aggregated snapshot stays HOLD even if project healthy',()=>{
  const data=JSON.parse(readFileSync(new URL(
    '../docs/operations/evidence/v329-20261027-redacted-sql-transport.json',
    import.meta.url),'utf8'));
  const r=judge({...clean(),snapshot:data});
  assert.equal(data.metrics.postgres_cancelled_57014,32);
  assert.equal(data.metrics.postgrest_timeout_events,272);
  assert.equal(data.metrics.postgres_connection_08006,4);
  assert.equal(r.state,'DATABASE_RECOVERY_HOLD');
  assert.equal(r.management_status_only,'PROJECT_ACTIVE_HEALTHY');
  assert.ok(r.blockers.includes('TRANSPORT_LOG_WINDOW_NOT_VERIFIED'));
});
test('two copies of one SQL probe do not count as two independent SQL reads',()=>{
  const x=clean();x.management_sql_samples=[
    sqlProbe('same',110),sqlProbe('same',110)
  ];
  assert.ok(judge(x).blockers.includes('TWO_SPACED_MANAGEMENT_SQL_READS_REQUIRED'));
});
test('one SQL success surrounded by a failed probe never certifies stability',()=>{
  const x=clean();x.management_sql_samples.push({
    ...sqlProbe('bad',50),ok:false,error:'Connection terminated due to connection timeout'
  });
  assert.ok(judge(x).blockers.includes('TWO_SPACED_MANAGEMENT_SQL_READS_REQUIRED'));
});
test('public HTTP 200 without authenticated read-only PostgREST proof is insufficient',()=>{
  const x=clean();x.postgrest_probe.authenticated_read_only=false;
  assert.ok(judge(x).blockers.includes('AUTHENTICATED_POSTGREST_NOT_VERIFIED'));
  x.postgrest_probe.authenticated_read_only=true;
  x.postgrest_probe.observed_at=stamp(20*60_000);
  assert.ok(judge(x).blockers.includes('AUTHENTICATED_POSTGREST_NOT_VERIFIED'));
});
test('negative and unsafe log counts fail closed',()=>{
  for(const bad of [-1,1.5,Number.POSITIVE_INFINITY,'0',2_000_000]){
    const x=clean();x.snapshot.metrics.postgres_cancelled_57014=bad;
    assert.ok(judge(x).blockers.includes('TRANSPORT_LOG_WINDOW_NOT_VERIFIED'));
  }
});
test('redacted support output cannot echo supplied passwords/SQL/log payload',()=>{
  const x=clean();
  x.snapshot.raw_query="SELECT * FROM sensitive_customers WHERE password='SECRET'";
  x.snapshot.error_detail="Bearer sk-proj-SENSITIVE raw user email foo@example.com";
  x.snapshot.metrics.postgrest_timeout_events=6;
  const ticket=makeRedactedTransportSupportV329(
    x.snapshot,judge(x));
  for(const forbidden of ['sensitive_customers','password','SECRET',
    'sk-proj-', 'foo@example.com','Bearer'])
    assert.ok(!ticket.includes(forbidden),forbidden);
  assert.match(ticket,/postgrest_timeout_events: 6/);
  assert.match(ticket,/capital|WAIT \/ 0R/);
});
test('legacy recovery classifier catches PostgREST Warp worker and protocol failures',()=>{
  const incident=summarizeIncident([
    {timestamp:stamp(30_000),event_message:'Warp server error: Thread killed by timeout manager'},
    {timestamp:stamp(28_000),event_message:'SQLSTATE 08006 connection failure'},
    {timestamp:stamp(27_000),event_message:'SQLSTATE 08P01 protocol violation'},
    {timestamp:stamp(25_000),event_message:'canceling statement due to statement timeout'},
  ],now);
  assert.equal(incident.schema,DB_INCIDENT_SCHEMA);
  assert.equal(incident.codes.POSTGREST_WARP_TIMEOUT,1);
  assert.equal(incident.codes['08006'],1);
  assert.equal(incident.codes['08P01'],1);
  assert.equal(incident.codes['57014'],1);
});
test('unknown broker and billing status cannot override DB outage',()=>{
  const x=clean();x.snapshot.metrics.postgres_cancelled_57014=32;
  assert.equal(judge(x).governance.billing_activation_permitted,false);
  assert.equal(judge(x).governance.trading_activation_permitted,false);
  assert.equal(judge(x).governance.database_restart_permitted,false);
});
test('legacy enterprise recovery gate still recognizes its old schema and cannot auto-release',()=>{
  const incident=summarizeIncident([
    {timestamp:stamp(30_000),event_message:'Warp server error: Thread killed by timeout manager'}
  ],now);
  const r=assessDatabaseRecovery({
    observed_at:stamp(30_000),incident,
    management_sql:{ok:false},
    management_sql_samples:[],
    postgrest_probe:{ok:false},cron:null,heartbeat_runs:[],payment:null
  },now);
  assert.equal(r.state,'LAUNCH_HOLD');
  assert.ok(r.blockers.includes('RECENT_DATABASE_ERRORS'));
  assert.equal(r.governance.automatic_checkout_unlock,false);
  assert.equal(r.governance.real_orders,false);
});
