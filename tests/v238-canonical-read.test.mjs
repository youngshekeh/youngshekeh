import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadOnlyState,classifyState,STATE_TTL_MS,STATE_RPC_CACHE_MS} from '../supabase/functions/runtime-v70-autonomous-state/read-only-state.mjs';
import {createPrivateStateHandler} from '../src/private-state-bridge.mjs';
const NOW=Date.parse('2026-10-22T09:00:00Z');
const canonical=()=>({ok:true,generated_at:new Date(NOW).toISOString(),mode:'EVIDENCE_RECOVERY',
  system_score:65,health:{database:'ONLINE',private_owner:'secret-owner',connectors:{healthy:7,required:8}},
  governance:{action_permitted:'WAIT',capital_permission:'0R',can_self_promote:false},
  blockers:['CONNECTORS_STALE'],secret:'must-not-leak'});
const request=()=>new Request('https://private.example/?rpc=evil',{headers:{Authorization:'Bearer test-identity'}});
const json=(body,status=200)=>Response.json(body,{status});
function setup({body=canonical(),auth=true,clock=()=>NOW,read}={}){
 const calls=[];
 const handler=createReadOnlyState({base:'https://fixed.example',serviceKey:'private-service-key',now:clock,
   fetchImpl:async(url,options)=>{calls.push({url,options});
     if(url.endsWith('oidc-probe'))return json({ok:auth,state:auth?'VERCEL_WORKLOAD_VERIFIED':'DENIED'});
     return read?await read(options):json(body);
   }});
 return {handler,calls};
}
test('unauthorized and write callers never reach database',async()=>{
 const f=setup();assert.equal((await f.handler(new Request('https://test'))).status,401);assert.equal(f.calls.length,0);
 assert.equal((await f.handler(new Request('https://test',{method:'POST'}))).status,405);assert.equal(f.calls.length,0);
 const denied=setup({auth:false});assert.equal((await denied.handler(request())).status,401);assert.equal(denied.calls.length,1);
});
test('one authenticated fixed RPC, no caller parameters, no private fields or execution permission',async()=>{
 const f=setup();const r=await f.handler(request()),b=await r.json();
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal(f.calls[1].url,'https://fixed.example/rest/v1/rpc/get_v70_autonomous_state');
 assert.equal(f.calls[1].options.body,'{}');assert.equal(f.calls[1].options.method,'POST');
 assert.equal(f.calls[1].options.headers.Authorization,'Bearer private-service-key');
 assert.doesNotMatch(JSON.stringify(b),/secret|must-not-leak|private-service-key/);
 assert.equal(b.governance.capital_permission,'0R');assert.equal(b.continuous_kernel_certified,false);assert.equal(b.checkout_certified,false);
});
test('stale, future, missing timestamps and governance drift fail closed',async()=>{
 for(const mutate of [b=>b.generated_at=new Date(NOW-STATE_TTL_MS-1).toISOString(),b=>b.generated_at=new Date(NOW+6000).toISOString(),b=>delete b.generated_at,b=>b.governance.capital_permission='1R',b=>b.ok=false]){
   const b=canonical();mutate(b);const r=await setup({body:b}).handler(request());assert.equal(r.status,503);assert.equal((await r.json()).usable,false);
 }
 assert.equal(classifyState(canonical(),NOW),'CURRENT_RESEARCH_OBSERVATION');
});
test('cache shares concurrent reads but authenticates each caller and expires timestamps on every use',async()=>{
 let clock=NOW;let release;const gate=new Promise(resolve=>{release=resolve;});
 const f=setup({clock:()=>clock,read:async()=>{await gate;return json(canonical());}});
 const first=f.handler(request()),second=f.handler(request());await new Promise(resolve=>setImmediate(resolve));release();
 assert.equal((await first).status,200);assert.equal((await second).status,200);
 assert.equal(f.calls.filter(x=>x.url.endsWith('get_v70_autonomous_state')).length,1);
 await f.handler(request());assert.equal(f.calls.filter(x=>x.url.endsWith('oidc-probe')).length,3);
 clock=NOW+STATE_TTL_MS+1;assert.equal((await f.handler(request())).status,503);
});
test('database failure has no stale success fallback and does not poison later recovery',async()=>{
 let clock=NOW,broken=false;const f=setup({clock:()=>clock,read:async()=>{if(broken)throw Error('postgres://secret');return json({...canonical(),generated_at:new Date(clock).toISOString()});}});
 assert.equal((await f.handler(request())).status,200);clock+=STATE_RPC_CACHE_MS+1000;broken=true;
 const fail=await f.handler(request());assert.equal(fail.status,503);assert.doesNotMatch(await fail.text(),/postgres|secret/);
 const calls=f.calls.length;
 broken=false;assert.equal((await f.handler(request())).status,503);
 assert.equal(f.calls.length,calls+1); // Caller is verified; database is not retried.
 clock+=30001;assert.equal((await f.handler(request())).status,200);
});
test('aborted body consumption is bounded and cannot leak credentials',async()=>{
 const handler=createReadOnlyState({base:'https://fixed.example',serviceKey:'private',readDeadline:10,
   fetchImpl:async(url,{signal})=>url.endsWith('oidc-probe')?json({ok:true,state:'VERCEL_WORKLOAD_VERIFIED'}):
     {ok:true,json:()=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))}});
 const keepAlive=setTimeout(()=>{},500);
 try{assert.equal((await handler(request())).status,503);}finally{clearTimeout(keepAlive);}
});
test('mission-brief false success reaches the existing offline UI branch instead of clearing preserved desks',async()=>{
 let target;const serve=createPrivateStateHandler({getToken:async()=>'test',functionSlug:'runtime-v115-mission-brief',fetchImpl:async url=>{target=String(url);return {ok:true,json:async()=>({ok:false})};}});
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(b){this.body=b;return this;}};
 await serve({method:'GET',url:'/api/mission-brief'},res);
 assert.equal(res.code,503);assert.equal(res.headers['Cache-Control'],'no-store');
 assert.equal(target,'https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v115-mission-brief');
 assert.throws(()=>createPrivateStateHandler({functionSlug:'evil'}),/invalid_private_read_target/);
});
