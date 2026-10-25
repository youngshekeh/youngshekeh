import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectPrivateMissionRecovery} from '../src/v298-mission-recovery-canary.mjs';
const AT=Date.parse('2026-10-25T09:10:00Z');
const ROOT='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/';
const TOK='header.'+'x'.repeat(75)+'.signature';
const triage=()=>({ok:true,version:'v258-readonly-recovery-triage-v1',
 generated_at:new Date(AT-1000).toISOString(),
 state:'PRIVATE CERTIFICATION NOT ESTABLISHED',
 checks:{database_incident_reported:false,readiness_source_current:true,
 auth_http:{transport_reachable:true,state:'HTTP RESPONDED',http_status:200},
 postgrest_http:{transport_reachable:true,state:'HTTP ERROR',http_status:401}},
 governance:{action_permitted:'WAIT',capital_permission:'0R',
  live_order_submission_enabled:false,commercial_launch_certified:false},
 private_actions_executed:0,database_jobs_modified:0});
const identity=()=>({ok:true,state:'VERCEL_WORKLOAD_VERIFIED',
 owner:'the-father',project:'the-father-analytics',environment:'production',
 governance:{authentication_only:true,capital_permission:'0R'}});
const mission=()=>({ok:false,usable:false,state:'LOAD_SHED_DB_RECOVERY',
 capital_permission:'0R',live_order_submission_enabled:false,automatic_execution:false});
const reply=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
function factory({triageData=triage(),oidcData=identity(),missionData=mission(),missionStatus=200}={}){
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url:String(url),options});
  if(String(url)==='https://thefatheranalytics.com/api/public-recovery-triage')
   return reply(triageData);
  if(String(url)===ROOT+'runtime-v115-oidc-probe')return reply(oidcData);
  if(String(url)===ROOT+'runtime-v115-mission-brief')return reply(missionData,missionStatus);
  throw Error('unexpected_egress');
 };
 return {fetcher,calls};
}
test('V298 signed private OIDC and existing load-shed observed, never declared engine-ready',async()=>{
 const x=factory(),data=await inspectPrivateMissionRecovery({fetcher:x.fetcher,getToken:async()=>TOK,now:()=>AT});
 assert.equal(data.ok,true);assert.equal(data.state,'SIGNED_LOAD_SHED_OBSERVED');
 assert.equal(data.private_workload_identity_verified,true);
 assert.equal(data.load_shed_observed,true);
 assert.equal(data.private_mission_restored,false);
 assert.equal(data.engine_registry_certified,false);
 assert.equal(data.recovery_certified,false);
 assert.equal(data.customer_login_certified,false);
 assert.equal(data.merchant_certified,false);
 assert.equal(data.capital_permission,'0R');
 assert.equal(data.commercial_launch_allowed,false);
 assert.equal(data.live_order_submission_enabled,false);
 assert.equal(x.calls.length,3);
 assert.equal(x.calls[0].options.method,'GET');
 assert.equal(x.calls[0].options.headers.Authorization,undefined);
 for(const call of x.calls.slice(1)){
  assert.equal(call.options.headers.Authorization,'Bearer '+TOK);
  assert.equal(call.options.method,'GET');
  assert.equal(call.options.redirect,'error');
  assert.equal(call.options.cache,'no-store');
 }
 assert.doesNotMatch(JSON.stringify(data),/header\.|signature|apikey|SUPABASE_SERVICE_ROLE/i);
});
test('V298 incident/stale/contradictory triage prevents acquisition of workload token',async()=>{
 for(const body of [
  {...triage(),checks:{...triage().checks,database_incident_reported:true}},
  {...triage(),generated_at:'2020-01-01T00:00:00Z'},
  {...triage(),governance:{...triage().governance,capital_permission:'1R'}},
  {...triage(),checks:{...triage().checks,postgrest_http:{transport_reachable:false,http_status:503}}}
 ]){
  let calls=0;const x=factory({triageData:body});
  const out=await inspectPrivateMissionRecovery({fetcher:x.fetcher,getToken:async()=>{calls++;return TOK},now:()=>AT});
  assert.equal(out.state,'PREFLIGHT_HOLD');
  assert.equal(out.ok,false);assert.equal(calls,0);assert.equal(x.calls.length,1);
  assert.equal(out.private_workload_identity_verified,false);
 }
});
test('V298 absent identity or invalid signatures cannot be bypassed by healthy-looking mission',async()=>{
 const noToken=factory();
 const x=await inspectPrivateMissionRecovery({fetcher:noToken.fetcher,getToken:async()=>'',now:()=>AT});
 assert.equal(x.state,'OIDC_TOKEN_UNAVAILABLE');
 assert.equal(noToken.calls.length,1);
 for(const wrong of [
  {...identity(),state:'SUPABASE_INTERNAL_SERVICE_ROLE_VERIFIED'},
  {...identity(),owner:'other-owner'},
  {...identity(),environment:'preview'},
  {...identity(),governance:{capital_permission:'1R',authentication_only:true}},
  {...identity(),ok:false}
 ]){
  const z=factory({oidcData:wrong});
  const p=await inspectPrivateMissionRecovery({fetcher:z.fetcher,getToken:async()=>TOK,now:()=>AT});
  assert.equal(p.state,'OIDC_NOT_VERIFIED');assert.equal(p.ok,false);
  assert.equal(p.private_mission_restored,false);
 }
});
test('V298 refuses unknown mission states and a forged healthy response',async()=>{
 for(const [body,status] of [
  [{...mission(),ok:true,usable:true},200],
  [{...mission(),capital_permission:'1R'},200],
  [{...mission(),state:'READY'},200],
  [null,503]
 ]){
  const f=factory({missionData:body,missionStatus:status});
  const r=await inspectPrivateMissionRecovery({fetcher:f.fetcher,getToken:async()=>TOK,now:()=>AT});
  assert.equal(r.state,'MISSION_STATE_NOT_VERIFIED');
  assert.equal(r.ok,false);assert.equal(r.private_mission_restored,false);
  assert.equal(r.engine_registry_certified,false);
 }
});
test('V298 route and hosting are bounded; legacy mission, QA and all monetary locks unmodified',()=>{
 const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const src=read('src/v298-mission-recovery-canary.mjs'),api=read('api/mission-recovery-canary.js');
 const conf=JSON.parse(read('vercel.json'));
 assert.equal(conf.functions['api/mission-recovery-canary.js'].maxDuration,20);
 assert.match(src,/preflightV285QaAdmission/);
 assert.match(src,/AbortSignal.timeout\(deadlineMs\)/);
 assert.match(src,/Promise\.all/);
 assert.match(api,/getVercelOidcToken/);
 assert.match(api,/if\(req\.method!=='GET'\)/);
 assert.match(api,/Cache-Control','no-store'/);
 assert.match(api,/until=Date\.now\(\)\+90000/);
 assert.doesNotMatch(src,/service_role|anon_key|rpc\/|\.insert\(|order_send|cron\.schedule|Yahoo|Coinbase/i);
 assert.match(read('src/private-state-bridge.mjs'),/LOAD_SHED_DB_RECOVERY/);
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(read('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
 assert.match(read('src/status.ts'),/evaluateLaunchReadiness\(\{ auth, readiness, billing, qa, gold \}\)/);
 assert.match(conf.ignoreCommand,/\[deploy\]/);
});
