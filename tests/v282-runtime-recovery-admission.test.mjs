import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectRuntimeRecovery} from '../api/runtime-recovery.js';
import {RECOVERY_ORIGIN,RECOVERY_PATHS,
 assessRecoveryPreflight,assessRecoveryDiagnostics} from '../src/runtime-recovery-guard.mjs';
const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const now=Date.parse('2026-10-24T11:56:00.000Z'),iso=x=>new Date(x).toISOString();
const release=()=>({ok:true,state:'PRODUCTION_SOURCE_VERIFIED',environment:'production',
 git_branch:'the-father-analytics-deploy',git_commit_sha:'29c5356b3f5f8428494a15a0370f65eb5172b83b',
 governance:{capital_permission:'0R'}});
const triage=(incident=true)=>({ok:true,generated_at:iso(now-1000),
 state:incident?'DATABASE INCIDENT REPORTED':'PRIVATE CERTIFICATION NOT ESTABLISHED',
 checks:{readiness_source_current:true,database_incident_reported:incident,
  auth_http:{transport_reachable:!incident,state:incident?'TIMEOUT':'HTTP RESPONDED',http_status:incident?0:200},
  postgrest_http:{transport_reachable:true,state:'HTTP ERROR',http_status:401}},
 governance:{action_permitted:'WAIT',capital_permission:'0R',commercial_launch_certified:false}});
const quota=()=>({ok:true,restricted:false,upstream_status:200,canonical_upstream_ok:true});
const edge=()=>({ok:true,state:'EXTERNAL_EDGE_PATH_VERIFIED',summary:{rate_limited:0,server_errors:0}});
const state=()=>({ok:true,blockers:[],health:{edge_runtime:'HEALTHY',
 production_smoke:{state:'FRESH'}}});
const qa=()=>({ok:true,state:'PASS',summary:{total:28,passed:28,failed:0}});
const packages=(inc=true)=>({
 [RECOVERY_PATHS.triage]:triage(inc),
 [RECOVERY_PATHS.release]:release(),
 [RECOVERY_PATHS.quota]:quota(),[RECOVERY_PATHS.edge]:edge(),
 [RECOVERY_PATHS.state]:state(),[RECOVERY_PATHS.qa]:qa()
});
function harness(p,override={}){
 const visits=[];const headers=[];
 const fetcher=async(url,opts)=>{
  visits.push(String(url));headers.push(opts);
  const path=new URL(url).pathname;
  const body=Object.hasOwn(override,path)?override[path]:p[path];
  if(body instanceof Error)throw body;
  if(body===undefined)return {ok:false,status:503,headers:{get:()=>null},
    body:{cancel:async()=>{}},text:async()=>''};
  return {ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify(body)};
 };
 return {visits,headers,fetcher};
}
test('active Supabase incident makes only two cheap public calls, never state/QA',async()=>{
 const h=harness(packages(true));
 const r=await collectRuntimeRecovery({fetcher:h.fetcher,now:()=>now});
 assert.equal(r.state,'RECOVERY_BLOCKED');
 assert.equal(r.admission.reason,'DATABASE_INCIDENT_ACTIVE');
 assert.equal(r.diagnostics.requests_sent,2);
 assert.equal(r.diagnostics.expensive_private_requests_sent,0);
 assert.equal(r.diagnostics.expensive_private_probes_deferred,true);
 assert.deepEqual(h.visits.sort(),[
  RECOVERY_ORIGIN+RECOVERY_PATHS.release,RECOVERY_ORIGIN+RECOVERY_PATHS.triage
 ].sort());
 assert.equal(r.governance.capital_permission,'0R');
 assert.equal(r.readiness.commercial_launch_certified,false);
 assert.equal(r.evidence.live_quota_probe.clear,false);
 assert.equal(r.evidence.external_edge_acceptance.verified,false);
 assert.equal(r.evidence.canonical_state.ok,false);
});
test('stale/missing/invalid triage cannot trigger any private read',async()=>{
 for(const patch of [{generated_at:iso(now-250_000)},{checks:{database_incident_reported:false}},
  {governance:{action_permitted:'BUY',capital_permission:'1R'}},{state:'FULL_ACCEPTANCE_READY'}]){
  const p=packages(false);Object.assign(p[RECOVERY_PATHS.triage],patch);
  const h=harness(p);const r=await collectRuntimeRecovery({fetcher:h.fetcher,now:()=>now});
  assert.equal(r.state,'RECOVERY_BLOCKED');
  assert.equal(h.visits.length,2);
  assert.equal(r.readiness.private_kernel_certified,false);
 }
});
test('forged or missing production release SHA blocks all further checks',async()=>{
 for(const patch of [{git_commit_sha:'deadbeef'},{environment:'preview'},
  {git_branch:'main'},{governance:{capital_permission:'1R'}}]){
  const p=packages(false);Object.assign(p[RECOVERY_PATHS.release],patch);
  const h=harness(p);const r=await collectRuntimeRecovery({fetcher:h.fetcher,now:()=>now});
  assert.equal(r.state,'RECOVERY_BLOCKED');
  assert.equal(r.admission.reason,'RELEASE_PROVENANCE_UNVERIFIED');
  assert.equal(h.visits.length,2);
 }
});
test('when release and transport respond but quota fails, state and private QA stay deferred',async()=>{
 const p=packages(false);p[RECOVERY_PATHS.quota].restricted=true;
 const h=harness(p);const r=await collectRuntimeRecovery({fetcher:h.fetcher,now:()=>now});
 assert.equal(r.state,'PROVIDER_REACHABILITY_UNVERIFIED');
 assert.equal(h.visits.length,4);
 assert.equal(r.diagnostics.expensive_private_requests_sent,0);
 assert.equal(r.evidence.quota.clear,false);
 assert.equal(r.evidence.edge.verified,true);
});
test('private canonical state is requested only after BOTH quota and edge pass',async()=>{
 const p=packages(false);p[RECOVERY_PATHS.edge].summary.server_errors=2;
 const h=harness(p);const r=await collectRuntimeRecovery({fetcher:h.fetcher,now:()=>now});
 assert.equal(h.visits.length,4);
 assert.equal(r.diagnostics.expensive_private_requests_sent,0);
});
test('unhealthy private state or active private DB incident defers expensive QA',async()=>{
 for(const patch of [{blockers:['EDGE_QUOTA_RESTRICTED']},
  {health:{edge_runtime:'HEALTHY',production_smoke:{state:'STALE'}}},
  {database_incident:{active:true}}]){
  const p=packages(false);Object.assign(p[RECOVERY_PATHS.state],patch);
  const h=harness(p);const r=await collectRuntimeRecovery({fetcher:h.fetcher,now:()=>now});
  assert.equal(h.visits.length,5);
  assert.equal(r.diagnostics.expensive_private_requests_sent,1);
  assert.equal(r.evidence.qa.pass,false);
  assert.equal(r.state,'PRIVATE_STATE_OR_SMOKE_UNVERIFIED');
 }
});
test('passing all SIX diagnostics never certifies kernel, account, payment, DB recovery or trading',async()=>{
 const h=harness(packages(false));
 const r=await collectRuntimeRecovery({fetcher:h.fetcher,now:()=>now});
 assert.equal(h.visits.length,6);
 assert.equal(r.state,'DIAGNOSTICS_PASSED_PRIVATE_CERTIFICATION_PENDING');
 assert.equal(r.evidence.qa.pass,true);
 assert.equal(r.recovery_score,80);
 assert.equal(r.evidence.live_quota_probe.clear,true);
 assert.equal(r.evidence.external_edge_acceptance.verified,true);
 assert.equal(r.evidence.canonical_state.smoke_state,'FRESH');
 assert.equal(r.evidence.qa.state,'PASS');
 for(const key of ['private_kernel_certified','authenticated_login_certified',
   'provider_payment_verified','commercial_launch_certified',
   'database_recovered_certified','broker_quote_certified'])
  assert.equal(r.readiness[key],false,key);
 assert.equal(r.governance.commerce_permitted,false);
 assert.equal(r.governance.capital_permission,'0R');
 assert.equal(r.diagnostics.database_write_count,0);
 assert.equal(r.diagnostics.cron_changes,0);
});
test('all requests use fixed HTTPS same-site paths, no cookies, no redirects or SSRF',async()=>{
 const h=harness(packages(false));
 await collectRuntimeRecovery({fetcher:h.fetcher,now:()=>now});
 assert.equal(RECOVERY_ORIGIN,'https://thefatheranalytics.com');
 assert.deepEqual(new Set(h.visits.map(u=>new URL(u).origin)),new Set([RECOVERY_ORIGIN]));
 assert.equal(h.visits.length,6);
 for(const opts of h.headers){
  assert.equal(opts.method,'GET');assert.equal(opts.credentials,'omit');
  assert.equal(opts.redirect,'error');assert.equal(opts.cache,'no-store');
  assert.equal(opts.referrerPolicy,'no-referrer');
  assert.equal(opts.headers.Authorization,undefined);
  assert.ok(opts.signal);
 }
 const src=get('api/runtime-recovery.js');
 assert.doesNotMatch(src,/x-forwarded-host|x-forwarded-proto|req\.headers\.host|VERCEL_URL/);
 assert.doesNotMatch(src,/new URL\(.*req\./);
 assert.match(src,/RECOVERY_ORIGIN\+path/);
 assert.match(src,/Cache-Control','private, no-store'/);
 assert.match(src,/X-TFA-Recovery','V282-ANONYMOUS-STAGED-HOLD'/);
});
test('transport error details never expose raw upstream error or token strings',async()=>{
 const p=packages(false),h=harness(p,{
  [RECOVERY_PATHS.triage]:Error('database-key-secret-should-never-display')
 });
 const r=await collectRuntimeRecovery({fetcher:h.fetcher,now:()=>now});
 assert.equal(r.state,'RECOVERY_BLOCKED');
 assert.doesNotMatch(JSON.stringify(r),/database-key-secret|service_role|bearer /i);
 assert.equal(h.visits.length,2);
});
test('upstream raw response cannot set arbitrary actions or blocker text',async()=>{
 const p=packages(false);p[RECOVERY_PATHS.state].blockers=['PASSWORD_DO_NOT_ECHO','unsafe'];
 const h=harness(p);
 const r=await collectRuntimeRecovery({fetcher:h.fetcher,now:()=>now});
 assert.equal(r.state,'PRIVATE_STATE_OR_SMOKE_UNVERIFIED');
 assert.doesNotMatch(JSON.stringify(r),/PASSWORD_DO_NOT_ECHO|unsafe/);
 assert.equal(r.evidence.state.blockers.length,0);
});
test('operator hold and protected checkout remain intact',()=>{
 assert.match(get('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(get('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
 const api=get('api/runtime-recovery.js');
 assert.doesNotMatch(api,/execute_sql|createClient\(|\.rpc\(|INSERT INTO|UPDATE public/);
 const code=get('src/runtime-recovery-guard.mjs');
 assert.doesNotMatch(code,/RECOVERY_VERIFIED|commercial_launch_certified:true/);
 const cfg=JSON.parse(get('vercel.json'));
 const apiHeaders=cfg.headers.find(h=>h.source==='/api/(.*)');
 assert.ok(apiHeaders.headers.some(h=>h.key==='X-Robots-Tag'));
});
