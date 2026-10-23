import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {READ_BUDGETS,sourceCurrent,incidentObservation,readObservation,createObservationHandler}
 from '../supabase/functions/_shared/public-launch-observation.mjs';
import {FINAL_PATHS,assembleFinalReadiness,finalCacheTtl}
 from '../supabase/functions/public-final-readiness/readiness.mjs';
import {RUNTIME_PATHS,assembleRuntimeObservatory,runtimeCacheTtl}
 from '../supabase/functions/public-v66-runtime-observatory/readiness.mjs';
import {publicAcceptanceDeadline} from '../src/public-acceptance-connection.mjs';
import {assessStatusDependencyAdmission} from '../src/status-dependency-admission.mjs';
const clock=Date.parse('2026-10-23T22:50:00Z'),stamp=at=>new Date(at).toISOString();
const record=(body,at=clock)=>({ok:true,http_status:200,latency_ms:10,body:{ok:true,generated_at:stamp(at),...body}});
const db=()=>record({version:'v69-database-incident-shield-v3-dynamic-recovery',incident_active:false,current_probe:{ok:true,status:200}});
function finalFixture(){return {
 'public-auth-runtime-check':record({state:'PASSWORD_AUTH_READY',auth_health:{ok:true},auth_settings:{ok:true,email_password:true,google_provider:true}}),
 'public-access-readiness':record({routing:{direct_edge_ready:true,canonical_ready:true}}),
 'public-v66-runtime-observatory':record({certification_state:'BASELINE_READY'}),
 'public-billing-acceptance':record({version:'billing-acceptance-v1',state:'LIVE_FLOW_VERIFIED',ready_for_checkout:true,live_flow_verified:true,
  gates:{merchant_credentials:'PASS',provider_plan_parity:'PASS',signed_payment_evidence:'PASS',paid_checkout_evidence:'PASS',active_entitlement_evidence:'PASS'}}),
 'public-v69-database-incident-shield':db()
};}
function runtimeFixture(){return {
 'public-v50-production-integrity':record({version:'v50-production-integrity',state:'RUNTIME_READY'}),
 'public-app-config':record({config_version:'app-config-v63-database-incident-shield',app:{mission_control_version:'21.20'},
  runtime_safety:{mode:'CONTROLLED_LOAD',high_frequency_polling:false,production_smoke_mode:'RATE_SAFE',
   cache_busting_on_core_aggregators:false,cache_busting_on_browser_surfaces:false}}),
 'public-v65-model-evidence-fabric':record({version:'v65-model-evidence-fabric',calibration:{performance_state:'SAMPLE_BUILDING',sample_size:0}}),
 'public-v69-database-incident-shield':db()
};}
const gate=(body,key)=>body.gates.find(row=>row.key===key);
const finalHandler=(fetchImpl,now)=>createObservationHandler({paths:FINAL_PATHS,
 assemble:assembleFinalReadiness,ttlFor:finalCacheTtl,allowHead:true,fetchImpl,now});
const request=(method='GET')=>new Request('https://example.test/readiness',{method});

test('missing, malformed, stale and failed incident sources cannot clear the database gate',()=>{
 for(const replacement of [undefined,{ok:false,http_status:503,body:db().body},record({}),
  {...db(),http_status:500},record({...db().body,incident_active:'false'}),
  record({...db().body,current_probe:{ok:false}}),
  record({...db().body,generated_at:stamp(clock-120001)}),
  record({...db().body,generated_at:stamp(clock+60001)})]){
  const records=finalFixture();records['public-v69-database-incident-shield']=replacement;
  const value=assembleFinalReadiness(records,clock);
  assert.equal(value.database_incident.active,null);
  assert.equal(gate(value,'database_incident').passed,false);
  assert.equal(value.state,'BUILD_HOLD');
 }
});
test('an explicit current database failure stays active, distinct from unavailable evidence',()=>{
 const records=finalFixture();records['public-v69-database-incident-shield']=record({...db().body,
  incident_active:true,incident_code:'POSTGREST_RUNTIME_UNAVAILABLE',current_probe:{ok:false}});
 const value=assembleFinalReadiness(records,clock);
 assert.equal(value.database_incident.active,true);
 assert.equal(gate(value,'database_incident').state,'POSTGREST_RUNTIME_UNAVAILABLE');
});
test('fresh sources pass internal gates but cannot fabricate external provider verification',()=>{
 const value=assembleFinalReadiness(finalFixture(),clock);
 assert.deepEqual(value.hard_blockers,[]);assert.deepEqual(value.acceptance_pending,[]);
 assert.equal(value.state,'BUILD_READY_EXTERNAL_VERIFICATION_PENDING');
 assert.deepEqual(value.external_unknowns,['provider_rate_limit']);
 assert.equal(value.database_incident.active,false);
 assert.equal(value.governance.capital_permission,'0R');
 assert.equal(value.governance.grants_entitlement,false);
});
test('historical paid receipts do not pass current entitlement or live-flow acceptance',()=>{
 const records=finalFixture(),billing=records['public-billing-acceptance'].body;
 billing.state='READY_FOR_CONTROLLED_LIVE_TEST';billing.live_flow_verified=false;
 billing.gates.active_entitlement_evidence='WITHHELD';
 const value=assembleFinalReadiness(records,clock);
 assert.equal(gate(value,'billing_preflight').passed,true);
 assert.equal(value.commercial.ready,true);
 assert.equal(value.commercial.live_transaction_verified,false);
 assert.deepEqual(value.acceptance_pending,['live_payment','active_entitlement']);
 assert.equal(value.state,'BUILD_READY_ACCEPTANCE_PENDING');
 assert.equal(value.commercial.source,'public-billing-acceptance');
});
test('legacy payment booleans and contradictory commercial gates cannot establish acceptance',()=>{
 for(const patch of [{version:'billing-status-v8-v69-gated',ready:true,live_transaction_verified:true},
  {gates:{}},{live_flow_verified:false},{state:'READY_FOR_CONTROLLED_LIVE_TEST'}]){
  const records=finalFixture();Object.assign(records['public-billing-acceptance'].body,patch);
  assert.equal(gate(assembleFinalReadiness(records,clock),'live_payment').passed,false);
 }
});
test('a fresh envelope cannot refresh old auth, access, runtime or billing evidence',()=>{
 for(const path of FINAL_PATHS.filter(path=>!path.includes('incident-shield'))){
  const records=finalFixture();records[path].body.generated_at=stamp(clock-600001);
  const value=assembleFinalReadiness(records,clock);
  assert.equal(value.generated_at,stamp(clock));assert.equal(value.state,'BUILD_HOLD',path);
  assert.equal(value.source_evidence[path].source_generated_at,stamp(clock-600001));
 }
});
test('password enabled does not pass authentication when the settings probe failed',()=>{
 const records=finalFixture();records['public-auth-runtime-check'].body.auth_settings.ok=false;
 assert.equal(gate(assembleFinalReadiness(records,clock),'auth_runtime').passed,false);
});
test('a zero-sample but readable model ledger is a baseline observation, not calibrated accuracy',()=>{
 const value=assembleRuntimeObservatory(runtimeFixture(),clock);
 assert.equal(value.certification_state,'BASELINE_READY');assert.deepEqual(value.failed_gates,[]);
 assert.equal(value.runtime_observations.model_evidence.sample_size,0);
 assert.equal(value.governance.capital_permission,'0R');
 assert.equal(value.provider_confirmation.confirmed,false);
});
test('missing integrity is unverified market data and a hard runtime hold',()=>{
 const records=runtimeFixture();records['public-v50-production-integrity']={ok:false,http_status:503,body:null};
 const value=assembleRuntimeObservatory(records,clock);
 assert.equal(value.certification_state,'HOLD');
 assert.equal(gate(value,'market_data_semantics').state,'UNVERIFIED');
 assert.equal(gate(value,'market_data_semantics').passed,false);
});
test('real semantic market degradation remains a soft PARTIAL with trading disabled',()=>{
 const records=runtimeFixture();records['public-v50-production-integrity'].body.state='RUNTIME_DEGRADED_MARKET_DATA';
 const value=assembleRuntimeObservatory(records,clock);
 assert.equal(value.certification_state,'PARTIAL');
 assert.deepEqual(value.failed_gates,['market_data_semantics']);
 assert.equal(value.governance.live_order_submission_enabled,false);
});
test('missing or old model evidence cannot silently pass the evidence gate',()=>{
 for(const replacement of [record({version:'v65-model-evidence-fabric'}),
  record({version:'v65-model-evidence-fabric',calibration:{performance_state:'EVIDENCE_STORE_UNAVAILABLE'}}),
  {...runtimeFixture()['public-v65-model-evidence-fabric'],ok:false},
  record({...runtimeFixture()['public-v65-model-evidence-fabric'].body,generated_at:stamp(clock-1200001)})]){
  const records=runtimeFixture();records['public-v65-model-evidence-fabric']=replacement;
  const value=assembleRuntimeObservatory(records,clock);
  assert.equal(value.certification_state,'PARTIAL');assert.equal(gate(value,'model_evidence').passed,false);
 }
});
test('stale integrity and unsafe release configuration remain hard holds',()=>{
 const records=runtimeFixture();records['public-v50-production-integrity'].body.generated_at=stamp(clock-600001);
 assert.equal(assembleRuntimeObservatory(records,clock).certification_state,'HOLD');
 const unsafe=runtimeFixture();unsafe['public-app-config'].body.runtime_safety.high_frequency_polling=true;
 assert.equal(assembleRuntimeObservatory(unsafe,clock).certification_state,'HOLD');
});
test('observation transport is a fixed credentialless GET without retries or cache busting',async()=>{
 let calls=0;
 const observed=await readObservation('public-auth-runtime-check',{now:()=>clock,fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-auth-runtime-check');
  assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');
  assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
  assert.deepEqual(options.headers,{Accept:'application/json'});
  return Response.json(finalFixture()['public-auth-runtime-check'].body);
 }});
 assert.equal(observed.ok,true);assert.equal(calls,1);
 for(const path of ['https://evil.test','../member-session','public-billing-status','public-auth-runtime-check?probe=1'])
  await assert.rejects(()=>readObservation(path,{fetchImpl:()=>{calls++;}}),/route_or_budget_invalid/);
 assert.equal(calls,1);
});
test('HTML, missing JSON, array and error bodies remain unavailable observations',async()=>{
 for(const reply of [()=>new Response('<html>error</html>'),()=>Response.json(null),
  ()=>Response.json([]),()=>Response.json({generated_at:stamp(clock)}),
  ()=>Response.json({ok:false}),()=>Response.json({ok:true},{status:503})]){
  const value=await readObservation('public-auth-runtime-check',{fetchImpl:async()=>reply()});
  assert.equal(value.ok,false);
 }
});
test('deadline bounds a provider or JSON body that ignores cancellation',async()=>{
 const keepAlive=setTimeout(()=>{},150);
 try{
  for(const fetchImpl of [()=>new Promise(()=>{}),async()=>({ok:true,status:200,json:()=>new Promise(()=>{})})]){
   const value=await readObservation('public-auth-runtime-check',{fetchImpl,timeoutMs:15});
   assert.equal(value.ok,false);assert.equal(value.error,'dependency_unavailable');
  }
 }finally{clearTimeout(keepAlive);}
});
test('concurrent launch reads share one bounded evaluation and preserve source dates',async()=>{
 const fixtures=finalFixture();let calls=0,release;
 const wait=new Promise(resolve=>{release=resolve});
 const handler=finalHandler(async url=>{calls++;await wait;return Response.json(fixtures[url.split('/').at(-1)].body);},()=>clock);
 const first=handler(request()),second=handler(request());assert.equal(calls,5);release();
 const [a,b]=await Promise.all([first,second]);assert.deepEqual(await a.json(),await b.json());
 const third=await handler(request());assert.equal(calls,5);
 assert.equal((await third.json()).generated_at,stamp(clock));
 assert.equal(third.headers.get('cache-control'),'no-store');
 assert.equal(third.headers.get('cdn-cache-control'),'no-store');
});
test('a failed snapshot refreshes after one minute and cannot be re-dated within the cache',async()=>{
 let now=clock,down=true,calls=0;
 const handler=finalHandler(async url=>{calls++;const path=url.split('/').at(-1);
  if(down&&path.includes('incident-shield'))return Response.json({ok:false},{status:503});
  const body=finalFixture()[path].body;body.generated_at=stamp(now);return Response.json(body);
 },()=>now);
 assert.equal((await(await handler(request())).json()).state,'BUILD_HOLD');
 now+=59000;assert.equal((await(await handler(request())).json()).generated_at,stamp(clock));assert.equal(calls,5);
 down=false;now+=1001;
 assert.deepEqual((await(await handler(request())).json()).hard_blockers,[]);assert.equal(calls,10);
});
test('cached passes expire when their oldest source expires',async()=>{
 let now=clock,calls=0;
 const fixtures=finalFixture();fixtures['public-v69-database-incident-shield'].body.generated_at=stamp(clock-119000);
 const handler=finalHandler(async url=>{calls++;return Response.json(fixtures[url.split('/').at(-1)].body);},()=>now);
 const first=await(await handler(request())).json();assert.equal(first.database_incident.active,false);
 assert.equal(finalCacheTtl(first),1000);now+=1001;
 const next=await(await handler(request())).json();assert.equal(next.database_incident.active,null);assert.equal(calls,10);
});
test('OPTIONS and denied mutations do no dependency work; HEAD shares the safe GET contract',async()=>{
 let calls=0;const fixtures=finalFixture();
 const handler=finalHandler(async url=>{calls++;return Response.json(fixtures[url.split('/').at(-1)].body);},()=>clock);
 assert.equal((await handler(request('OPTIONS'))).status,204);
 for(const method of ['POST','PUT','DELETE'])assert.equal((await handler(request(method))).status,405);
 assert.equal(calls,0);const head=await handler(request('HEAD'));
 assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(calls,5);
});
test('expired, missing, typed-string and future source dates do not become current',()=>{
 for(const value of [null,undefined,'bad',clock,stamp(clock-600001),stamp(clock+60001)])
  assert.equal(sourceCurrent(record({generated_at:value}),clock),false);
 assert.equal(sourceCurrent(record({},clock-600000),clock),true);
 assert.equal(incidentObservation(db(),clock).active,false);
});
test('an unknown incident is deferred without labeling it an observed active incident',()=>{
 for(const active of [null,undefined,'false']){
  const verdict=assessStatusDependencyAdmission({response:{ok:true},data:{ok:true,
   generated_at:stamp(clock),database_incident:{active}}},clock);
  assert.equal(verdict.admitted,false);assert.equal(verdict.reason,'DATABASE_INCIDENT_NOT_VERIFIED');
 }
});
test('database child, runtime parent and browser deadlines are ordered without changing other reads',()=>{
 assert.ok(2500<READ_BUDGETS['public-v69-database-incident-shield']);
 assert.ok(READ_BUDGETS['public-v50-production-integrity']<READ_BUDGETS['public-v66-runtime-observatory']);
 assert.ok(READ_BUDGETS['public-v66-runtime-observatory']<publicAcceptanceDeadline('public-final-readiness'));
 for(const path of ['public-auth-runtime-check','public-billing-acceptance'])assert.equal(publicAcceptanceDeadline(path),18000);
 assert.ok(runtimeCacheTtl(assembleRuntimeObservatory(runtimeFixture(),clock))<=120000);
 const checkout=readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8');
 assert.match(checkout,/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.ok(FINAL_PATHS.includes('public-billing-acceptance'));
 assert.ok(!FINAL_PATHS.includes('public-billing-status'));assert.equal(RUNTIME_PATHS.length,4);
});
