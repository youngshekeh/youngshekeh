import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateV230,createSupportMessage} from '../src/v230-provider-recovery.mjs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sample=JSON.parse(load('docs/operations/evidence/v230-20261021-redacted.json'));
test('historical observed failures preserve commercial launch hold',()=>{
 const r=evaluateV230(sample);
 assert.equal(r.launch,'NOT_CERTIFIED');
 assert.equal(r.counts.cron_startup_timeouts,149);
 assert.equal(r.counts.supavisor_auth_timeouts,20);
 assert.equal(r.counts.sqlstate57014,5);
 assert.equal(r.counts.pgrst002,0);
 assert.equal(r.operator_proof.v180_two_sealed_runs,false);
 assert.equal(r.operator_proof.payment_entitlement_e2e,false);
 assert.equal(r.protected.trading,'WAIT / 0R');
});
test('zero PGRST002 in one partial sample is never a recovery receipt',()=>{
 const r=evaluateV230(sample);
 assert.equal(r.counts.pgrst002,0);
 assert.equal(r.operator_proof.postgrest_stable,false);
 assert.equal(r.incident,'ACTIVE_DATABASE_AND_LIVE_DATA_FAILURE');
});
test('untrusted freeform fields cannot leak secrets into generated escalation',()=>{
 const data=structuredClone(sample);
 data.secret='Bearer private-name@example.test sk-proj-123';
 data.sources.pg_cron.command='DROP TABLE customers';
 const text=createSupportMessage(evaluateV230(data));
 assert.doesNotMatch(text,/private-name|sk-proj-|DROP TABLE|customers/i);
 assert.match(text,/Ticket submission is NOT performed/);
});
test('invalid schema, timestamps, counts or contradictory claims are rejected',()=>{
 for(const fn of [
  x=>{x.project_ref='other';},
  x=>{x.captured_at='not-a-time';},
  x=>{x.window_start='2026-10-22T00:00:00Z';},
  x=>{x.sources.supavisor.authentication_timeouts='20';},
  x=>{x.sources.pg_cron.startup_timeouts=-1;},
  x=>{x.sources.postgrest.latest_event_at='2026-10-20T08:00:00Z';},
  x=>{x.direct_checks.sql.state='HEALTHY';},
  x=>{x.direct_checks.gold.http_status=200;},
  x=>{x.root_cause_verified=true;},
  x=>{x.support_ticket_submitted=true;}
 ]){const data=structuredClone(sample);fn(data);assert.throws(()=>evaluateV230(data));}
});
test('read-only SQL worksheet cannot perform operational changes',()=>{
 const sql=load('supabase/recovery/v230-readonly-diagnostics.sql');
 const uncommented=sql.split('\n').filter(line=>!line.trim().startsWith('--')).join('\n');
 const commands=uncommented.split(';').map(x=>x.trim()).filter(Boolean);
 for(const command of commands){
  assert.match(command,/^(?:BEGIN READ ONLY|SET LOCAL (?:statement_timeout|lock_timeout)|SELECT |ROLLBACK$)/i);
  assert.doesNotMatch(command,/\b(?:ALTER|UPDATE|DELETE|INSERT|CREATE|DROP|TRUNCATE|NOTIFY|GRANT|REVOKE)\b/i);
 }
 assert.equal(commands.filter(x=>x.startsWith('BEGIN READ ONLY')).length,4);
 assert.equal(commands.filter(x=>x==='ROLLBACK').length,4);
});
test('offline CLI never accesses network or changes production data',()=>{
 const cli=load('scripts/v230-provider-escalation.mjs');
 assert.doesNotMatch(cli,/\bfetch\s*\(|execute_sql|pg_terminate_backend|cron\.alter_job|\.supabase\.co/);
 assert.match(load('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(load('api/ops-heartbeat.js'),/preserve_unrelated_cron_jobs/);
});
