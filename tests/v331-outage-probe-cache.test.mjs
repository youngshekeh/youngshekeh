import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {chooseRecoveryProbeCacheV331,currentCachedTriageV331,
 V331_NORMAL_CACHE_MS,V331_INCIDENT_CACHE_MS}
 from '../src/v331-outage-probe-cache.mjs';
const source=readFileSync(new URL('../api/public-recovery-triage.js',import.meta.url),'utf8');
const policy=readFileSync(new URL('../src/v331-outage-probe-cache.mjs',import.meta.url),'utf8');
const incident=(current=true)=>({
 state:'DATABASE INCIDENT REPORTED',
 checks:{readiness_source_current:current,database_incident_reported:true,
  auth_http:{state:'DEFERRED_BY_DATABASE_INCIDENT'},
  postgrest_http:{state:'DEFERRED_BY_DATABASE_INCIDENT'}},
 governance:{action_permitted:'WAIT',capital_permission:'0R',commercial_launch_certified:false}
});
const healthy=()=>({
 state:'PRIVATE CERTIFICATION NOT ESTABLISHED',
 checks:{readiness_source_current:true,database_incident_reported:false,
  auth_http:{state:'HTTP RESPONDED'},
  postgrest_http:{state:'HTTP RESPONDED'}},
 governance:{action_permitted:'WAIT',capital_permission:'0R',commercial_launch_certified:false}
});
test('normal probe cache stays at original 90 seconds',()=>{
 assert.equal(V331_NORMAL_CACHE_MS,90000);
 assert.equal(chooseRecoveryProbeCacheV331(healthy()).ttl_ms,90000);
});
test('verified incident cache retains truthful HOLD for 180 seconds',()=>{
 const p=chooseRecoveryProbeCacheV331(incident());
 assert.equal(p.ttl_ms,180000);
 assert.equal(p.cache_may_unlock_launch,false);
 assert.equal(p.capital_permission,'0R');
});
test('missing readiness source also receives short negative cache',()=>{
 const r=healthy();r.checks.readiness_source_current=false;
 assert.equal(chooseRecoveryProbeCacheV331(r).ttl_ms,180000);
});
test('source is fresh but REST timeout triggers bounded negative cache',()=>{
 const r=healthy();r.checks.postgrest_http.state='TIMEOUT';
 assert.equal(chooseRecoveryProbeCacheV331(r).ttl_ms,180000);
});
test('cache age, future timestamp and malformed policy all fail closed',()=>{
 const p=chooseRecoveryProbeCacheV331(incident());
 const x={cached:incident(),stored_at:1000,policy:p};
 assert.equal(currentCachedTriageV331({...x,now:180999}),true);
 assert.equal(currentCachedTriageV331({...x,now:181000}),false);
 assert.equal(currentCachedTriageV331({...x,now:0}),false);
 assert.equal(currentCachedTriageV331({...x,now:1001,policy:{ttl_ms:86400000}}),false);
 assert.equal(currentCachedTriageV331({...x,cached:null,now:1001}),false);
});
function mockApp(){
 const tick={t:1_000_000},calls=[];
 let mode='normal',deferred=null;
 const Clock=class extends Date {static now(){return tick.t;}};
 const ctx={
   Date:Clock,Number,String,Object,Math,Promise,Set,Array,JSON,
   URL,Response,AbortSignal,
   assessRecoveryTriage:({readiness,auth,rest})=>{
     const current=readiness?.data?.ok===true&&readiness?.status===200;
     const active=readiness?.data?.database_incident?.active===true;
     const isIncident=current&&active;
     return{
       ok:true,state:isIncident?'DATABASE INCIDENT REPORTED':
         current?'PRIVATE CERTIFICATION NOT ESTABLISHED':'PRIVATE READINESS UNVERIFIED',
       generated_at:new Date(tick.t).toISOString(),
       checks:{readiness_source_current:current,database_incident_reported:isIncident,
         auth_http:{state:auth?.transport==='TIMEOUT'?'TIMEOUT':'HTTP RESPONDED'},
         postgrest_http:{state:rest?.transport==='TIMEOUT'?'TIMEOUT':'HTTP RESPONDED'}},
       governance:{action_permitted:'WAIT',capital_permission:'0R',
         live_order_submission_enabled:false,commercial_launch_certified:false},
       private_actions_executed:0,database_jobs_modified:0
     };
   },
   fetch:async (url)=>{
     calls.push(new URL(url).pathname);
     if(deferred)await deferred;
     if(mode==='outage')throw new Error('synthetic read-only source unavailable');
     const isReadiness=url.includes('public-final-readiness');
     const data=isReadiness?{
       ok:true,database_incident:{active:mode==='incident'}
     }:{ok:true,upstream:'fixture'};
     return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
   }
 };
 const executable=policy.replace(/^export /gm,'')+'\n'+source
  .replace(/^import .*;\r?\n/gm,'')
  .replace('export const recoveryProbeDeadline','const recoveryProbeDeadline')
  .replace('export async function collectRecoveryTriage','async function collectRecoveryTriage')
  .replace('export default async function handler','async function handler')+
  '\n;handler';
 const route=runInNewContext(executable,ctx,{timeout:2000});
 function res(){return{
  code:0,payload:null,headers:{},
  setHeader(k,v){this.headers[k]=v;},
  status(code){this.code=code;return this;},
  json(p){this.payload=p;return p;}
 }}
 return{
  tick,calls,mode(m){mode=m;},hold(p){deferred=p;},
  invoke:async(method='GET')=>{
    const r=res();await route({method},r);return r;
  }
 };
}
test('real API retains early rejection for mutating requests',async()=>{
 const a=mockApp();
 const r=await a.invoke('POST');
 assert.equal(r.code,405);
 assert.equal(a.calls.length,0);
 assert.equal(r.payload.governance.capital_permission,'0R');
});
test('real API responds to incident with one upstream read only',async()=>{
 const a=mockApp();a.mode('incident');
 const first=await a.invoke();
 assert.equal(first.code,200);
 assert.equal(first.payload.state,'DATABASE INCIDENT REPORTED');
 assert.deepEqual(a.calls,['/functions/v1/public-final-readiness']);
 assert.equal(first.payload.private_actions_executed,0);
 assert.equal(first.payload.database_jobs_modified,0);
});
test('real API reuses verified-incident HOLD across many requests for 3min',async()=>{
 const a=mockApp();a.mode('incident');
 await a.invoke();
 for(let i=0;i<20;i++){a.tick.t+=5000;await a.invoke()}
 assert.equal(a.calls.length,1);
 assert.equal((await a.invoke()).payload.governance.capital_permission,'0R');
 a.tick.t=1_000_000+180001;
 await a.invoke();
 assert.equal(a.calls.length,2);
});
test('real API reuses normal monitoring result for only 90s',async()=>{
 const a=mockApp();await a.invoke();
 assert.equal(a.calls.length,3);
 a.tick.t+=89999;await a.invoke();
 assert.equal(a.calls.length,3);
 a.tick.t+=2;await a.invoke();
 assert.equal(a.calls.length,6);
});
test('a source outage produces HOLD and no invented public health success',async()=>{
 const a=mockApp();a.mode('outage');
 const result=await a.invoke();
 assert.equal(result.payload.state,'PRIVATE READINESS UNVERIFIED');
 assert.equal(result.payload.governance.commercial_launch_certified,false);
 const firstCount=a.calls.length;
 a.tick.t+=100000;await a.invoke();
 assert.equal(a.calls.length,firstCount);
});
test('concurrent HTTP requests share one source probe and do not amplify provider pressure',async()=>{
 const a=mockApp();let resume;
 a.hold(new Promise(resolve=>resume=resolve));
 const p=a.invoke();
 await Promise.resolve();
 const p2=a.invoke();
 await Promise.resolve();
 resume();
 const rs=await Promise.all([p,p2]);
 assert.equal(rs[0].code,200);assert.equal(rs[1].code,200);
 assert.equal(a.calls.length,3);
});
test('source remains pinned to fixed Supabase URL and never runs SQL or CRON writes',()=>{
 assert.match(source,/CACHE_MS=90000/);
 assert.match(source,/chooseRecoveryProbeCacheV331\(v\)/);
 assert.match(source,/currentCachedTriageV331/);
 assert.match(source,/redirect:'error'/);
 assert.match(source,/req.method!=='GET'/);
 assert.doesNotMatch(source+policy,/supabase\.from\(|ALTER SYSTEM|pg_terminate_backend|\\.insert\(|cron\\.schedule/i);
});
