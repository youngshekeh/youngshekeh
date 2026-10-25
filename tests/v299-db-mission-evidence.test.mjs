import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectSignedMissionDb,validateDbEvidence} from '../src/v299-db-evidence-gate.mjs';
const NOW=Date.parse('2026-10-25T09:15:00Z');
const TOKEN='header.'+'x'.repeat(70)+'.signature';
const URI='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v299-mission-evidence';
const triage=()=>({ok:true,version:'v258-readonly-recovery-triage-v1',
 generated_at:new Date(NOW-1000).toISOString(),state:'PRIVATE CERTIFICATION NOT ESTABLISHED',
 checks:{database_incident_reported:false,readiness_source_current:true,
  auth_http:{transport_reachable:true,state:'HTTP RESPONDED',http_status:200},
  postgrest_http:{transport_reachable:true,state:'HTTP ERROR',http_status:401}},
 governance:{action_permitted:'WAIT',capital_permission:'0R',
  live_order_submission_enabled:false,commercial_launch_certified:false},
 private_actions_executed:0,database_jobs_modified:0});
const evidence=()=>({ok:true,usable:false,version:'v299-signed-db-evidence-v1',
 state:'SIGNED_DATABASE_EVIDENCE_OBSERVED',workload_identity_verified:true,
 database_snapshot_observed:true,snapshot_at:new Date(NOW-90000).toISOString(),
 database_state:'ONLINE',machine_mode:'RECERTIFICATION',system_score:77,
 smoke_state:'STALE',edge_runtime_state:'AVAILABLE_OR_UNVERIFIED',
 mission_restored:false,engine_registry_certified:false,
 capital_permission:'0R',action_permitted:'WAIT',
 live_order_submission_enabled:false,commercial_launch_certified:false});
function fake({health=triage(),body=evidence(),code=200}={}){
 const calls=[];
 const fetcher=async(url,init)=>{
  calls.push({url,init});
  if(url==='https://thefatheranalytics.com/api/public-recovery-triage')
   return {ok:true,status:200,json:async()=>health};
  if(url===URI)return {ok:code===200,status:code,json:async()=>body};
  throw Error('not_allowed');
 };
 return {fetcher,calls};
}
test('V299 after healthy read-only admission, one scoped signed DB evidence request succeeds but mission stays locked',async()=>{
 const f=fake();
 const x=await inspectSignedMissionDb({fetcher:f.fetcher,getToken:async()=>TOKEN,now:()=>NOW});
 assert.equal(x.ok,true);assert.equal(x.state,'SIGNED_DB_SNAPSHOT_OBSERVED_NOT_MISSION_RESTORED');
 assert.equal(x.database_snapshot_observed,true);assert.equal(x.workload_identity_verified,true);
 assert.equal(x.mission_restored,false);assert.equal(x.engine_registry_certified,false);
 assert.equal(x.commercial_launch_certified,false);assert.equal(x.live_order_submission_enabled,false);
 assert.equal(x.capital_permission,'0R');assert.equal(x.action_permitted,'WAIT');
 assert.equal(x.market_data_redistribution_approved,false);assert.equal(x.usable,false);
 assert.equal(f.calls.length,2);
 assert.equal(f.calls[0].init.headers.Authorization,undefined);
 assert.equal(f.calls[1].url,URI);
 assert.equal(f.calls[1].init.method,'GET');
 assert.equal(f.calls[1].init.headers.Authorization,'Bearer '+TOKEN);
 assert.equal(f.calls[1].init.redirect,'error');
 assert.equal(f.calls[1].init.credentials,'omit');
 assert.equal(f.calls[1].init.cache,'no-store');
 assert.doesNotMatch(JSON.stringify(x),/signature|header\.|api_key|service_role/i);
});
test('V299 stale health, incident, wrong risk or missing token cannot cause a private query',async()=>{
 for(const health of [
  {...triage(),generated_at:'2020-01-01T00:00:00Z'},
  {...triage(),checks:{database_incident_reported:true}},
  {...triage(),governance:{...triage().governance,capital_permission:'1R'}}
 ]){
  let tokens=0;const f=fake({health});
  const result=await inspectSignedMissionDb({fetcher:f.fetcher,now:()=>NOW,getToken:async()=>{tokens++;return TOKEN}});
  assert.equal(result.ok,false);assert.equal(result.mission_restored,false);
  assert.equal(tokens,0);assert.equal(f.calls.length,1);
 }
 const f=fake();
 const x=await inspectSignedMissionDb({fetcher:f.fetcher,now:()=>NOW,getToken:async()=>''});
 assert.equal(x.state,'WORKLOAD_IDENTITY_UNAVAILABLE');assert.equal(f.calls.length,1);
});
test('V299 rejects maliciously asserted engine readiness, stale/counterfeit DB evidence and loss of governance',()=>{
 const base=evidence();
 for(const changed of [
  {mission_restored:true},{engine_registry_certified:true},
  {capital_permission:'1R'},{action_permitted:'EXECUTE'},
  {live_order_submission_enabled:true},{commercial_launch_certified:true},
  {workload_identity_verified:false},{database_snapshot_observed:false},
  {database_state:'RECOVERING'}, {state:'READY'},
  {snapshot_at:'2026-10-23T21:00:00Z'}, {snapshot_at:'not-a-time'},
  {usable:true}
 ]){
  const result=validateDbEvidence({status:200,body:{...base,...changed},now:NOW});
  assert.equal(result.ok,false);assert.equal(result.mission_restored,false);
  assert.equal(result.capital_permission,'0R');
 }
 assert.equal(validateDbEvidence({status:503,body:base,now:NOW}).ok,false);
});
test('V299 Edge reader authorizes before bounded one-table query, and cannot return secret or market prices',()=>{
 const root=new URL('../',import.meta.url);
 const e=readFileSync(new URL('supabase/functions/runtime-v299-mission-evidence/index.ts',root),'utf8');
 const api=readFileSync(new URL('api/mission-db-evidence.js',root),'utf8');
 const config=JSON.parse(readFileSync(new URL('vercel.json',root),'utf8'));
 const old=readFileSync(new URL('supabase/functions/runtime-v115-mission-brief/index.ts',root),'utf8');
 assert.equal(config.functions['api/mission-db-evidence.js'].maxDuration,20);
 assert.equal((e.match(/fetch\(url,init\)/g)||[]).length,1);
 assert.equal((e.match(/getJson\(/g)||[]).length,3);
 assert.ok(e.indexOf('if(!verified)')<e.indexOf('Deno.env.get(\'SUPABASE_SERVICE_ROLE_KEY\')'));
 assert.match(e,/id=eq\.1&select=updated_at,mode,system_score/);
 assert.match(e,/&limit=1/);
 assert.match(e,/Authorization:'Bearer '\+secret/);
 assert.match(e,/age>600000/);
 assert.match(e,/final_permission!=='0R'/);
 assert.doesNotMatch(e,/POST|PATCH|DELETE|upsert|\.insert\(|rpc\/|Coinbase|Yahoo|api\.gold-api\.com/);
 assert.match(api,/getVercelOidcToken/);assert.match(api,/until=Date\.now\(\)\+90000/);
 assert.match(api,/if\(req\.method!=='GET'\)/);
 assert.match(old,/MARKET_ASSETS/); // Original archived engine is still unchanged.
 assert.match(readFileSync(new URL('src/checkout.ts',root),'utf8'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(readFileSync(new URL('supabase/functions/create-checkout/index.ts',root),'utf8'),/V272_CHARGES_ENABLED=false/);
});
