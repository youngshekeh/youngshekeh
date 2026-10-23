import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TARGETS,probeRelation,dataPlaneIncident} from '../supabase/functions/public-data-plane-matrix/probes.mjs';
import {INTEGRITY_PATHS,assembleProductionIntegrity,integrityCacheTtl}
 from '../supabase/functions/public-v50-production-integrity/readiness.mjs';
import {READ_BUDGETS,createObservationHandler} from '../supabase/functions/_shared/public-launch-observation.mjs';
const clock=Date.parse('2026-10-23T23:00:00Z'),stamp=at=>new Date(at).toISOString();
const record=body=>({ok:true,http_status:200,latency_ms:10,body:{ok:true,generated_at:stamp(clock),...body}});
function fixture(){return {
 'public-runtime-beacon':record({version:'runtime-beacon-v1',edge_runtime:'ONLINE'}),
 'public-app-config':record({config_version:'app-config-v63-database-incident-shield'}),
 'public-data-plane-matrix':record({state:'ONLINE',total_checks:5,readable_count:5,
  critical:{gold_snapshot_table:true,market_snapshot_table:true,agent_run_ledger:true},
  checks:TARGETS.map(row=>({key:row.key,ok:true,http_status:200,row_sample_count:0}))}),
 'public-v63-structural-core-fabric':record({structure_signals:{market_status:'MARKET_CLOSED'}}),
 'public-v69-database-incident-shield':record({version:'v69-database-incident-shield-v3-dynamic-recovery',
  incident_active:false,current_probe:{ok:true,status:200}})
};}
test('five current independent relation receipts pass platform integrity without certifying live trading',()=>{
 const result=assembleProductionIntegrity(fixture(),clock);
 assert.equal(result.state,'RUNTIME_READY');assert.deepEqual(result.unresolved,[]);
 assert.equal(result.core.market_core_state,'MARKET_CLOSED');
 assert.equal(result.core.auth_state,'UNVERIFIED_IN_SAFE_MODE');
 assert.equal(result.governance.capital_permission,'0R');
 assert.equal(result.governance.live_order_submission_enabled,false);
 assert.ok(integrityCacheTtl(result)<=120000);
});
test('ONLINE without the complete relation receipts cannot pass the data plane',()=>{
 for(const patch of [{checks:[]},{readable_count:4},{total_checks:4},{critical:{}},
  {checks:fixture()['public-data-plane-matrix'].body.checks.map(row=>({...row,row_sample_count:null}))},
  {checks:[...fixture()['public-data-plane-matrix'].body.checks.slice(0,4),{key:'profiles',ok:false,http_status:503}]}]){
  const records=fixture();Object.assign(records['public-data-plane-matrix'].body,patch);
  const result=assembleProductionIntegrity(records,clock);
  assert.equal(result.state,'RUNTIME_DEGRADED_DATA_PLANE');assert.ok(result.unresolved.includes('data_plane'));
 }
});
test('data-plane unavailability cannot be softened into only a market-data warning',()=>{
 const records=fixture();records['public-v63-structural-core-fabric'].body.structure_signals.market_status='UNAVAILABLE';
 records['public-data-plane-matrix']={ok:false,http_status:503,body:null};
 assert.equal(assembleProductionIntegrity(records,clock).state,'RUNTIME_DEGRADED_DATA_PLANE');
});
test('market-data semantic degradation stays separate when the actual data plane passes',()=>{
 for(const status of ['UNAVAILABLE','STALE','UNKNOWN','']){
  const records=fixture();records['public-v63-structural-core-fabric'].body.structure_signals.market_status=status;
  const result=assembleProductionIntegrity(records,clock);
  assert.equal(result.state,'RUNTIME_DEGRADED_MARKET_DATA');assert.equal(result.core.data_plane_state,'ONLINE');
 }
});
test('missing, stale or failed incident evidence is an integrity hold, never clear',()=>{
 for(const replacement of [undefined,record({}),{ok:false,http_status:503,body:null},
  record({...fixture()['public-v69-database-incident-shield'].body,generated_at:stamp(clock-120001)})]){
  const records=fixture();records['public-v69-database-incident-shield']=replacement;
  const result=assembleProductionIntegrity(records,clock);
  assert.equal(result.state,'DATABASE_INCIDENT_UNVERIFIED');assert.equal(result.database_incident.active,null);
 }
});
test('stale core, beacon, config or data-plane receipts cannot be republished as ready',()=>{
 for(const path of INTEGRITY_PATHS.filter(path=>!path.includes('incident-shield'))){
  const records=fixture();records[path].body.generated_at=stamp(clock-600001);
  assert.notEqual(assembleProductionIntegrity(records,clock).state,'RUNTIME_READY',path);
 }
});
test('bounded relation reads keep the same five tables, minimum fields and server authentication',async()=>{
 const base='https://mpcelmjiycjpdyyflisn.supabase.co',key='server-test-key';let calls=0;
 for(const target of TARGETS){
  const result=await probeRelation(base,key,target,async(url,options)=>{
   calls++;assert.equal(url.origin,base);assert.equal(url.pathname,'/rest/v1/'+target.table);
   assert.equal(url.searchParams.get('limit'),'1');assert.equal(url.searchParams.get('select'),target.select);
   assert.equal(url.searchParams.size,2);assert.equal(options.method,'GET');
   assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
   assert.equal(options.headers.apikey,key);assert.equal(options.headers.Authorization,'Bearer '+key);
   return Response.json([{id:'fake-customer-id'}]);
  });
  assert.equal(result.ok,true);assert.equal(result.row_sample_count,1);
  assert.doesNotMatch(JSON.stringify(result),/fake-customer-id|server-test-key/);
 }
 assert.equal(calls,5);assert.equal(TARGETS.length,5);
});
test('empty relations are readable while HTML, object and HTTP failure replies fail closed',async()=>{
 const base='https://mpcelmjiycjpdyyflisn.supabase.co';
 assert.equal((await probeRelation(base,'dummy',TARGETS[0],async()=>Response.json([]))).ok,true);
 for(const response of [()=>new Response('HTML'),()=>Response.json({}),()=>Response.json(null),
  ()=>Response.json([],{status:401})]){
  const result=await probeRelation(base,'dummy',TARGETS[0],async()=>response());assert.equal(result.ok,false);
 }
});
test('relation probe cannot expand to arbitrary hosts, targets or larger deadlines',async()=>{
 let calls=0;const fetchImpl=()=>{calls++;};
 for(const [base,key,target,ms] of [
  ['https://evil.test','dummy',TARGETS[0],2500],
  ['https://mpcelmjiycjpdyyflisn.supabase.co','dummy',{key:'extra',table:'subscriptions',select:'*'},2500],
  ['https://mpcelmjiycjpdyyflisn.supabase.co','',TARGETS[0],2500],
  ['https://mpcelmjiycjpdyyflisn.supabase.co','dummy',TARGETS[0],2501]
 ])await assert.rejects(()=>probeRelation(base,key,target,fetchImpl,ms),/probe_config_invalid/);
 assert.equal(calls,0);
});
test('relation fetch and response body remain bounded even if cancellation is ignored',async()=>{
 const keepAlive=setTimeout(()=>{},150);
 try{
  for(const fetchImpl of [()=>new Promise(()=>{}),async()=>({ok:true,status:200,json:()=>new Promise(()=>{})})]){
   const result=await probeRelation('https://mpcelmjiycjpdyyflisn.supabase.co','dummy',TARGETS[0],fetchImpl,15);
   assert.equal(result.ok,false);assert.equal(result.error,'timeout_or_transport');
  }
 }finally{clearTimeout(keepAlive);}
});
test('matrix shield wrapper requires an explicit current successful probe before allowing relation reads',async()=>{
 for(const body of [null,{ok:true,generated_at:stamp(clock),incident_active:false},
  {...fixture()['public-v69-database-incident-shield'].body,current_probe:{ok:false}}]){
  const result=await dataPlaneIncident(async()=>Response.json(body),()=>clock);
  assert.equal(result.active,true);assert.equal(result.ok,false);
 }
 const result=await dataPlaneIncident(async()=>Response.json(fixture()['public-v69-database-incident-shield'].body),()=>clock);
 assert.equal(result.active,false);assert.equal(result.ok,true);
});
test('all data-plane parent budgets enclose the shield and relation phases',()=>{
 assert.ok(READ_BUDGETS['public-data-plane-matrix']>READ_BUDGETS['public-v69-database-incident-shield']+2500);
 assert.ok(READ_BUDGETS['public-v50-production-integrity']>READ_BUDGETS['public-data-plane-matrix']);
 assert.throws(()=>createObservationHandler({paths:['public-app-config'],assemble:()=>({}),ttlFor:()=>1,
  readTimeouts:{'public-app-config':18001}}),/config_invalid/);
});
test('manual recovery authorization and the incident circuit remain unchanged in the deployed entrypoint',()=>{
 const current=readFileSync(new URL('../supabase/functions/public-data-plane-matrix/index.ts',import.meta.url),'utf8');
 const original=readFileSync(new URL('../supabase/recovery/v262-public-data-plane-matrix-rollback/index.ts',import.meta.url),'utf8');
 const auth=source=>source.slice(source.indexOf('function recoveryProbeAuthorized('),source.indexOf('async function incidentState('));
 assert.equal(auth(current),auth(original));
 assert.match(current,/probeRequested&&!recoveryProbeAuthorized\(req\)/);
 assert.match(current,/recovery_probe_unauthorized/);assert.match(current,/status:403/);
 assert.match(current,/if\(incident.active\)return Response.json/);
 assert.match(current,/HEALTHY_TTL=120_000, DEGRADED_TTL=300_000/);
});
