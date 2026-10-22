import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPrivateStateHandler,usablePrivateState,PRIVATE_STATE_DEADLINE_MS} from '../src/private-state-bridge.mjs';
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(b){this.body=b;return this;}};}
const req={method:'GET',url:'/api/autonomous-state'};
const handler=(fetchImpl,getToken=async()=>'test-identity')=>createPrivateStateHandler({fetchImpl,getToken});
test('HTTP 200 load shedding remains unavailable, uncacheable and WAIT/0R',async()=>{
 const res=response();
 await handler(async()=>({ok:true,json:async()=>({ok:false,usable:false,state:'LOAD_SHED_DB_RECOVERY'})}))(req,res);
 assert.equal(res.code,503);assert.equal(res.body.state,'LOAD_SHED_DB_RECOVERY');
 assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(res.headers['Retry-After'],'60');
 assert.equal(res.body.governance.action_permitted,'WAIT');assert.equal(res.body.capital_permission,'0R');
 assert.equal(res.body.live_order_submission_enabled,false);
});
test('missing identity never calls private service',async()=>{
 let calls=0;const res=response();await handler(async()=>{calls++;},async()=>{throw Error('identity failure');})(req,res);
 assert.equal(calls,0);assert.equal(res.code,503);
});
test('malformed JSON, arrays, null and unusable packets cannot become healthy',async()=>{
 for(const body of [[],null,{},'text',{ok:true,usable:false}]){
  const res=response();await handler(async()=>({ok:true,json:async()=>body}))(req,res);assert.equal(res.code,503);
 }
 const res=response();await handler(async()=>({ok:true,json:async()=>{throw Error('bad json');}}))(req,res);assert.equal(res.code,503);
});
test('transport errors and upstream failures expose no diagnostic secrets',async()=>{
 for(const fetcher of [async()=>{throw Error('secret-token');},async()=>({ok:false,json:async()=>({ok:true,detail:'secret-token'})})]){
  const res=response();await handler(fetcher)(req,res);assert.equal(res.code,503);assert.doesNotMatch(JSON.stringify(res.body),/secret-token/);
 }
});
test('failure does not poison recovery; a new healthy observation passes unchanged',async()=>{
 let count=0;const good={ok:true,generated_at:new Date().toISOString(),mode:'RESEARCH_ONLY'};
 const serve=handler(async(url,options)=>{
  assert.equal(url.hostname,'mpcelmjiycjpdyyflisn.supabase.co');assert.equal(options.cache,'no-store');
  assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer test-identity');
  assert.ok(options.signal instanceof AbortSignal);
  return {ok:true,json:async()=>++count===1?{ok:false}:good};
 });
 const first=response(),second=response();await serve(req,first);await serve(req,second);
 assert.equal(first.code,503);assert.equal(second.code,200);assert.deepEqual(second.body,good);
 assert.equal(second.headers['Cache-Control'],'no-store');assert.equal(count,2);
});
test('non-read methods cannot invoke identity or runtime',async()=>{
 const res=response();await handler(async()=>{throw Error('must not fetch');},async()=>{throw Error('must not authenticate');})({...req,method:'POST'},res);
 assert.equal(res.code,405);assert.equal(res.headers.Allow,'GET');
});
test('request deadline covers body consumption',async()=>{
 const serve=createPrivateStateHandler({getToken:async()=>'test',deadlineMs:15,fetchImpl:async(_url,{signal})=>({ok:true,json:()=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))})});
 const keepAlive=setTimeout(()=>{},1000);
 try{const res=response();await serve(req,res);assert.equal(res.code,503);}finally{clearTimeout(keepAlive);}
 assert.equal(PRIVATE_STATE_DEADLINE_MS,8000);
});
test('browser rejects false success, clears former healthy observations and bounds waiting',()=>{
 const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
 assert.match(main,/if \(!usablePrivateState\(state\)\) throw/);
 assert.match(main,/signal: AbortSignal.timeout\(10_000\)/);
 assert.match(main,/setAutonomyText\('autonomyScore', '--'\)/);
 assert.match(main,/setAutonomyText\('autonomyTest', 'NOT CERTIFIED'\)/);
 assert.doesNotMatch(main,/Internal attribution continues database-side/);
 assert.match(main,/INCIDENT STATUS UNVERIFIED/);
 assert.match(main,/RECOVERY STATUS UNVERIFIED/);
 assert.equal(usablePrivateState({ok:false}),false);
});
