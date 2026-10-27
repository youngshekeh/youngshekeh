import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createKernelPressureCircuit,V330_PRESSURE_SCHEMA}
 from '../src/v330-kernel-pressure-circuit.mjs';
const cirText=readFileSync(new URL('../src/v330-kernel-pressure-circuit.mjs',
 import.meta.url),'utf8');
const handlerText=readFileSync(new URL('../api/ops-heartbeat.js',import.meta.url),'utf8');
function circuit(){
 const clock={t:1000000};
 const x=createKernelPressureCircuit({now:()=>clock.t});
 return{clock,x};
}
test('fresh V330 circuit is passive, no trades, no commerce',()=>{
 const {x}=circuit(),r=x.inspect();
 assert.equal(r.schema,V330_PRESSURE_SCHEMA);
 assert.equal(r.state,'NORMAL');
 assert.equal(r.per_isolate_only,true);
 assert.equal(r.global_database_fix_certified,false);
 assert.equal(r.commercial_activation_permitted,false);
 assert.equal(r.live_order_routing,false);
 assert.equal(r.capital_permission,'0R');
});
test('normal invocation is exclusive and duplicate private calls get 503 gate',()=>{
 const {x}=circuit();
 assert.equal(x.acquire().permitted,true);
 let duplicate=x.acquire();
 assert.equal(duplicate.permitted,false);
 assert.equal(duplicate.reason,'PRIVATE_INVOCATION_IN_PROGRESS');
 assert.equal(duplicate.state,'ONE_PRIVATE_CALL_ACTIVE');
 x.release({verified:true});
 assert.equal(x.acquire().permitted,true);
});
test('single transient backend failure never claims kernel success or stops schedule',()=>{
 const {x}=circuit();
 x.acquire();x.release({backend_unavailable:true});
 assert.equal(x.inspect().state,'NORMAL');
 assert.equal(x.inspect().capital_permission,'0R');
 assert.equal(x.acquire().permitted,true);
});
test('two failures within 15 minutes open 10-minute bounded cooldown',()=>{
 const {x,clock}=circuit();
 x.acquire();x.release({backend_unavailable:true});
 clock.t+=5*60000;
 x.acquire();x.release({backend_unavailable:true});
 const blocked=x.acquire();
 assert.equal(blocked.permitted,false);
 assert.equal(blocked.reason,'DATABASE_PRESSURE_COOLDOWN');
 assert.equal(blocked.state,'COOLDOWN');
 assert.equal(blocked.retry_after_seconds,600);
});
test('far-apart failures do not count as outage burst',()=>{
 const {x,clock}=circuit();
 x.acquire();x.release({backend_unavailable:true});
 clock.t+=16*60000;
 x.acquire();x.release({backend_unavailable:true});
 assert.equal(x.inspect().state,'NORMAL');
});
test('cooldown expiry admits exactly one cautious recovery probe',()=>{
 const {x,clock}=circuit();
 x.acquire();x.release({backend_unavailable:true});
 x.acquire();x.release({backend_unavailable:true});
 clock.t+=10*60000;
 const admitted=x.acquire();
 assert.equal(admitted.permitted,true);
 assert.equal(admitted.reason,'BOUNDED_RECOVERY_PROBE');
 assert.equal(x.acquire().permitted,false);
});
test('half-open HTTP ok without sealed receipt must NOT clear hold',()=>{
 const {x,clock}=circuit();
 x.acquire();x.release({backend_unavailable:true});
 x.acquire();x.release({backend_unavailable:true});
 clock.t+=10*60000;
 x.acquire();x.release({verified:false,backend_unavailable:false});
 assert.equal(x.inspect().state,'COOLDOWN');
 assert.ok(x.inspect().retry_after_seconds>=600);
});
test('failure during half-open reopens with bounded longer cooldown',()=>{
 const {x,clock}=circuit();
 x.acquire();x.release({backend_unavailable:true});
 x.acquire();x.release({backend_unavailable:true});
 clock.t+=10*60000;
 x.acquire();x.release({backend_unavailable:true});
 assert.equal(x.inspect().state,'COOLDOWN');
 assert.equal(x.inspect().retry_after_seconds,1200);
});
test('a verified receipt clears the circuit completely',()=>{
 const {x,clock}=circuit();
 x.acquire();x.release({backend_unavailable:true});
 x.acquire();x.release({backend_unavailable:true});
 clock.t+=10*60000;
 x.acquire();x.release({verified:true});
 assert.equal(x.inspect().state,'NORMAL');
 assert.equal(x.inspect().retry_after_seconds,0);
 assert.equal(x.acquire().permitted,true);
});
test('unverified no-backend-error outcome releases lock without manufacturing recovery',()=>{
 const {x}=circuit();
 x.acquire();x.release({verified:false,backend_unavailable:false});
 assert.equal(x.acquire().permitted,true);
});
test('circuit configuration rejects dangerous zero threshold and zero cooldown',()=>{
 assert.throws(()=>createKernelPressureCircuit({threshold:1}),/invalid_circuit_config/);
 assert.throws(()=>createKernelPressureCircuit({cooldownMs:0}),/invalid_circuit_config/);
});
test('duplicate release cannot alter active recovery state',()=>{
 const {x}=circuit();
 x.acquire();x.release({backend_unavailable:true});
 assert.equal(x.release({backend_unavailable:true}).state,'NORMAL');
 assert.equal(x.acquire().permitted,true);
});
function harness(){
 const time={t:1_000_000};
 let serverStatus=503,verified=false,fetchCalls=0,pending=null,privateCallStarted=null;
 const FastDate=class extends Date{static now(){return time.t;}};
 const ctx={
  Date:FastDate,Number,String,Object,Array,Math,Set,Promise,AbortSignal,
  Response,JSON,process:{env:{CRON_SECRET:'correct'}},
  console:{log(){},warn(){},error(){}},
  getVercelOidcToken:async()=>'test-oidc-token',
  classifyV231KernelIncident:()=>({state:'TEST_INCIDENT'}),
  checkHeartbeatIncident:async()=>({defer_private_kernel:false}),
  certifyKernelReceipt:(body)=>body?.verified===true?
   {verified:true,counts:{owners:1,successful_runs:1}}:
   {verified:false,reason:'NO_SEALED_RECEIPT',counts:{}},
  fetch:async()=>{
   fetchCalls++;
   if(pending)await pending;
   return new Response(JSON.stringify({
     ok:serverStatus===200,verified:verified,runs:[],
     generated_at:new Date().toISOString(),
     seal:{sealed:verified},governance:{
      action_permitted:'WAIT',capital_permission:'0R',trades_sent:false,
      funds_moved:false}
   }),{status:serverStatus,headers:{'content-type':'application/json'}});
  }
 };
 const code=cirText.replace(/^export /gm,'')+'\n'+handlerText
  .replace(/^import .*;\r?\n/gm,'')
  .replace('export const config','const config')
  .replace('export default async function handler','async function handler')+
  '\n;handler';
 const handler=runInNewContext(code,ctx,{timeout:3000});
 function res(){
  return{headers:{},code:0,data:null,
   setHeader(k,v){this.headers[k]=v;},
   status(s){this.code=s;return this;},
   json(x){this.data=x;return x;}};
 }
 return{time,
  invoke:async(secret='correct')=>{
   const response=res();await handler({
    method:'GET',
    headers:{authorization:'Bearer '+secret}
   },response);return response;},
  status(s,ok=false){serverStatus=s;verified=ok;},
  pending(waitPromise){pending=waitPromise;},
  calls(){return fetchCalls;}
 };
}
test('real heartbeat rejects unauthorized cron before any private attempt',async()=>{
 const h=harness(),r=await h.invoke('wrong');
 assert.equal(r.code,401);
 assert.equal(h.calls(),0);
 assert.equal(r.data.governance.capital_permission,'0R');
});
test('real heartbeat skips expensive kernel on third outage and returns retry signal',async()=>{
 const h=harness();
 assert.equal((await h.invoke()).code,503);
 h.time.t+=5*60000;
 assert.equal((await h.invoke()).code,503);
 assert.equal(h.calls(),2);
 h.time.t+=5*60000;
 const r=await h.invoke();
 assert.equal(r.code,503);
 assert.equal(h.calls(),2);
 assert.equal(r.data.state,'PRIVATE_KERNEL_PRESSURE_COOLDOWN');
 assert.equal(r.headers['Retry-After'],'300');
 assert.equal(r.data.stages.kernel.attempted,false);
 assert.equal(r.data.governance.trades_sent,false);
});
test('real heartbeat can only recover after genuine sealed receipt',async()=>{
 const h=harness();
 await h.invoke();await h.invoke();
 assert.equal(h.calls(),2);
 h.time.t+=10*60000;
 h.status(200,false);
 assert.equal((await h.invoke()).code,503);
 const stillHeld=await h.invoke();
 assert.equal(stillHeld.data.state,'PRIVATE_KERNEL_PRESSURE_COOLDOWN');
 assert.equal(h.calls(),3);
 h.time.t+=10*60000;
 h.status(200,true);
 const ok=await h.invoke();
 assert.equal(ok.code,200);
 assert.equal(ok.data.state,'CONTINUOUS_KERNEL_ACTIVE');
 assert.equal(ok.data.governance.capital_permission,'0R');
 const ok2=await h.invoke();
 assert.equal(ok2.code,200);
});
test('real handler allows only one private invocation during overlap',async()=>{
 const h=harness();
 let release;
 const stall=new Promise(resolve=>release=resolve);
 h.pending(stall);
 const first=h.invoke();
 await Promise.resolve();
 await Promise.resolve();
 const second=await h.invoke();
 assert.equal(second.code,503);
 assert.equal(second.data.state,'PRIVATE_KERNEL_PRESSURE_COOLDOWN');
 release();
 await first;
 assert.equal(h.calls(),1);
});
test('source retains CRON_SECRET and OIDC hard lock and no cron edits',()=>{
 assert.match(handlerText,/CRON_SECRET/);
 assert.match(handlerText,/getVercelOidcToken\(\)/);
 assert.match(handlerText,/pressureCircuit\.release\(/);
 assert.match(handlerText,/pressureCircuit\.acquire\(/);
 assert.match(handlerText,/privateVerified=true/);
 assert.doesNotMatch(handlerText,/cron\.unschedule|ALTER SYSTEM|ALTER ROLE/i);
 assert.doesNotMatch(cirText,/\bfetch\(|cron\.|pool_size|grant |DELETE FROM/i);
});
