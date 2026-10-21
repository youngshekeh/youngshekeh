import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {assessProviderPressure,supportPacket} from '../src/provider-incident-packet.mjs';
const input=JSON.parse(readFileSync(new URL('../docs/operations/evidence/v227-20261021-provider-aggregates.json',import.meta.url),'utf8'));
test('current read-only provider incident stays launch HOLD',()=>{
 const x=assessProviderPressure(input);
 assert.equal(x.commercial_launch,'NOT_CERTIFIED');
 assert.equal(x.status,'PRODUCTION_INCIDENT_ACTIVE');
 assert.equal(x.counts.supavisor_auth_timeouts,20);
 assert.equal(x.counts.supavisor_checkout_failures,5);
 assert.equal(x.counts.cron_startup_timeouts,72);
 assert.equal(x.counts.sqlstate_57014,4);
 assert.equal(x.governance.capital_permission,'0R');
 assert.equal(x.governance.charge_automation,false);
 assert.equal(x.acceptance.v180_two_sealed_success_receipts,false);
});
test('numeric cron job ranking identifies priority without modifying schedules',()=>{
 const x=assessProviderPressure(input);
 assert.equal(x.cron_job_hotspots[0].job_id,13);
 assert.equal(x.cron_job_hotspots[1].job_id,16);
 assert.equal(x.cron_job_hotspots[0].failures,7);
 const report=supportPacket(x);
 assert.match(report,/Job 13: 7/);
 assert.match(report,/Supavisor authentication timeouts: 20/);
 assert.match(report,/Manual operator approval/);
});
test('zero PGRST002 during a sampled period never certifies recovery',()=>{
 const x=assessProviderPressure(input);
 assert.equal(x.counts.pgrst002,0);
 assert.equal(x.acceptance.postgrest_schema_cache_stable,false);
 assert.equal(x.commercial_launch,'NOT_CERTIFIED');
});
test('untrusted raw log text, tokens and customer names never enter the support packet',()=>{
 const evil=structuredClone(input);
 evil.note='Bearer sensitive-secret@example.com SQL password=not-for-report';
 evil.sources.postgrest.message='PGRST002 sensitive-secret@example.com';
 evil.cron_job_hotspots[0].command='DROP TABLE customers; token=secret';
 const report=supportPacket(assessProviderPressure(evil));
 assert.doesNotMatch(report,/sensitive-secret|password=|DROP TABLE|customers/);
 assert.doesNotMatch(JSON.stringify(assessProviderPressure(evil)),/sensitive-secret|DROP TABLE/);
});
test('wrong project, impossible counts, duplicate IDs and invalid times fail closed',()=>{
 for(const mutate of [
   x=>{x.project_ref='other-project';},
   x=>{x.sources.supavisor.auth_timeouts='20';},
   x=>{x.sources.supavisor.auth_timeouts=1000;},
   x=>{x.sources.postgrest.latest_event_at='2026-10-20T05:00:00Z';},
   x=>{x.cron_job_hotspots.push({...x.cron_job_hotspots[0]});},
   x=>{x.other_checks.management_sql.status='HEALTHY';},
   x=>{x.window_end_utc='2026-10-20T05:00:00Z';}
 ]){
   const x=structuredClone(input);mutate(x);
   assert.throws(()=>assessProviderPressure(x));
 }
});
test('no production connections, destructive SQL or charges in diagnostics source',()=>{
 const cli=readFileSync(new URL('../scripts/v227-provider-support.mjs',import.meta.url),'utf8');
 const source=readFileSync(new URL('../src/provider-incident-packet.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(cli,/\bfetch\s*\(|execute_sql|cron\.alter_job|CREATE TABLE|DROP TABLE|flutterwave\.com/);
 assert.doesNotMatch(source,/\bfetch\s*\(|cron\.alter_job|pg_terminate_backend|execute_trade/);
 const checkout=readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8');
 assert.match(checkout,/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
});
