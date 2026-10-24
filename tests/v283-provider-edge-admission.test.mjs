import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectProviderEdgeAcceptance} from '../api/provider-edge-acceptance.js';
import {TRIAGE_URL,ACCEPTANCE_PATHS,assessProviderEdgeAdmission} from '../src/v283-provider-edge-admission.mjs';
const at='2026-10-24T12:28:30Z';const now=Date.parse(at);
const triage=(incident=true)=>({ok:true,
 version:'v258-readonly-recovery-triage-v1',generated_at:new Date(now-2000).toISOString(),
 state:incident?'DATABASE INCIDENT REPORTED':'PRIVATE CERTIFICATION NOT ESTABLISHED',
 checks:{database_incident_reported:incident,readiness_source_current:true,
  blockers:incident?['database_incident']:[],
  auth_http:{state:incident?'TIMEOUT':'HTTP RESPONDED',
   transport_reachable:!incident,http_status:incident?0:200},
  postgrest_http:{state:'HTTP ERROR',transport_reachable:true,http_status:401}},
 governance:{action_permitted:'WAIT',capital_permission:'0R',
  live_order_submission_enabled:false,commercial_launch_certified:false},
 private_actions_executed:0,database_jobs_modified:0});
const bodies={
 'public-auth-runtime-check':{ok:true,state:'PASSWORD_AUTH_READY'},
 'public-final-readiness':{ok:true,hard_blockers:[]},
 'public-billing-acceptance':{ok:true,ready_for_checkout:true,live_flow_verified:true}
};
function setup(t,overrides={}){
 const visited=[],calls=[];
 const fetcher=async(url,opts)=>{
  visited.push(url);calls.push(opts);
  const slug=new URL(url).pathname.split('/').at(-1);
  const body=url===TRIAGE_URL?t:overrides[slug]??bodies[slug];
  if(body instanceof Error)throw body;
  if(body===null)return{ok:false,status:503,json:async()=>({})};
  return{ok:true,status:200,json:async()=>body};
 };
 return{visited,calls,fetcher};
}
test('an active real-style Supabase incident makes ZERO expensive provider probes',async()=>{
 const p=setup(triage(true));
 const r=await collectProviderEdgeAcceptance({fetcher:p.fetcher,now:()=>now});
 assert.deepEqual(p.visited,[TRIAGE_URL]);
 assert.equal(r.private_calls_skipped,6);
 assert.equal(r.state,'EXTERNAL_EDGE_PATH_DEFERRED');
 assert.equal(r.admission.reason,'DATABASE_INCIDENT_REPORTED');
 assert.equal(r.commercial_launch_certified,false);
 assert.equal(r.governance.capital_permission,'0R');
 assert.equal(r.summary.total,0);
});
test('missing or stale triage, missing Auth, contradictory security facts fail closed',async()=>{
 for(const patch of [
 {generated_at:'2026-10-24T12:10:00Z'},
 {checks:{database_incident_reported:false,readiness_source_current:true}},
 {governance:{capital_permission:'1R'}},
 {state:'FULL_ACCEPTANCE_READY'},
 {private_actions_executed:1}
 ]){
  const input=Object.assign(triage(false),patch),p=setup(input);
  const r=await collectProviderEdgeAcceptance({fetcher:p.fetcher,now:()=>now});
  assert.equal(p.visited.length,1,JSON.stringify(patch));
  assert.equal(r.ok,false);
  assert.equal(r.commercial_launch_certified,false);
 }
});
test('six genuine provider reads remain available when transport and incident preflight pass',async()=>{
 const p=setup(triage(false));
 const r=await collectProviderEdgeAcceptance({fetcher:p.fetcher,now:()=>now});
 assert.equal(p.visited.length,7);
 assert.equal(r.ok,true);
 assert.equal(r.state,'EXTERNAL_EDGE_PATH_VERIFIED');
 assert.equal(r.summary.total,6);
 assert.equal(r.summary.transport_passed,6);
 assert.equal(r.summary.semantic_passed,6);
 assert.equal(r.governance.new_charges_enabled,false);
 assert.equal(r.admission.postgres_query_verified,false);
 for(const opts of p.calls){
  assert.equal(opts.method,'GET');
  assert.equal(opts.credentials,'omit');
  assert.equal(opts.redirect,'error');
  assert.equal(opts.referrerPolicy,'no-referrer');
  assert.equal(opts.cache,'no-store');
 }
});
test('an upstream network failure stops all subsequent provider calls, never reports ready',async()=>{
 const p=setup(triage(false),{'public-auth-runtime-check':Error('provider unavailable')});
 const r=await collectProviderEdgeAcceptance({fetcher:p.fetcher,now:()=>now});
 assert.equal(p.visited.length,2);
 assert.equal(r.private_calls_skipped,5);
 assert.equal(r.summary.server_errors,1);
 assert.equal(r.state,'EXTERNAL_EDGE_PATH_DEGRADED');
});
test('failing semantic gate remains visible as failure even if HTTP transport is 200',async()=>{
 const p=setup(triage(false),{'public-billing-acceptance':{ok:false,ready_for_checkout:false}});
 const r=await collectProviderEdgeAcceptance({fetcher:p.fetcher,now:()=>now});
 assert.equal(r.ok,true); // This endpoint observes transport, not billing activation.
 assert.equal(r.summary.total,6);
 assert.equal(r.summary.semantic_passed,4);
 assert.equal(r.summary.application_consistency,'SEMANTIC_VARIANCE_OR_DEFERRED');
 assert.equal(r.commercial_launch_certified,false);
});
test('troubleshooting itself never mutates database, trades, cron, billing or account',()=>{
 const api=readFileSync(new URL('../api/provider-edge-acceptance.js',import.meta.url),'utf8');
 const source=readFileSync(new URL('../src/v283-provider-edge-admission.mjs',import.meta.url),'utf8');
 assert.deepEqual(ACCEPTANCE_PATHS,[
 'public-auth-runtime-check','public-final-readiness','public-billing-acceptance']);
 assert.equal(TRIAGE_URL,'https://thefatheranalytics.com/api/public-recovery-triage');
 assert.doesNotMatch(api,/req\.headers\.host|req\.headers\['x-forwarded-host'\]|new URL\(req\./);
 assert.doesNotMatch(api,/service_role|Authorization:|\.rpc\(|INSERT INTO|UPDATE public|DELETE FROM|cron\.alter_job/);
 assert.match(api,/Retry-After/);
 assert.match(api,/TTL_MS=60_000/);
 assert.match(source,/commerce_permitted:false/);
 assert.match(readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(readFileSync(new URL('../supabase/functions/create-checkout/index.ts',import.meta.url),'utf8'),/V272_CHARGES_ENABLED=false/);
});
