import test from 'node:test';
import assert from 'node:assert/strict';
import {createResearchTransport} from '../src/research-transport.mjs';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const response=(body={ok:true,value:42},status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
function fixture(options={}){
 let time=0,visible=true;
 const requests=[];
 const transport=createResearchTransport({now:()=>time,isVisible:()=>visible,
  fetchImpl:(path,{signal})=>new Promise((resolve,reject)=>{
   requests.push({path,signal,resolve,reject});
   signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
  }),...options});
 return {transport,requests,setTime:t=>{time=t;},hide:()=>{visible=false;transport.pause();},show:()=>{visible=true;transport.resume();}};
}
test('fifty initial research reads have bounded concurrency and reserve room for the broker price',async()=>{
 const f=fixture();
 const jobs=Array.from({length:50},(_,i)=>f.transport.request('/api/research-'+i));
 await turn();assert.equal(f.requests.length,2);
 const broker=f.transport.request('/api/gold-live-price');await turn();
 assert.equal(f.requests.length,3);assert.equal(f.requests[2].path,'/api/gold-live-price');
 assert.equal(f.transport.snapshot().peak_active,3);
 f.hide();await Promise.all([...jobs,broker]);
 assert.equal(f.transport.snapshot().queued,0);
});
test('duplicate consumers receive independently readable bodies from one network request',async()=>{
 const f=fixture();const a=f.transport.request('/api/gold-live-price'),b=f.transport.request('/api/gold-live-price');
 await turn();assert.equal(f.requests.length,1);
 f.requests[0].resolve(response({ok:true,quote:{mid:4060,observed_at:'immutable'}}));
 const [ra,rb]=await Promise.all([a,b]);
 assert.deepEqual(await ra.json(),await rb.json());assert.equal(f.transport.snapshot().coalesced,1);
 const c=f.transport.request('/api/gold-live-price');await turn();assert.equal(f.requests.length,2,'completed success must not be cached');
 f.requests[1].resolve(response());await c;
});
test('an aborted duplicate consumer cannot cancel another consumer of the same observation',async()=>{
 const f=fixture(),controller=new AbortController();
 const a=f.transport.request('/api/gold-live-price',{signal:controller.signal});
 const b=f.transport.request('/api/gold-live-price');await turn();controller.abort();
 assert.equal((await a).status,503);assert.equal(f.requests[0].signal.aborted,false);
 f.requests[0].resolve(response());assert.equal((await b).status,200);
});
test('three dependency failures drain a large diagnostics queue and suppress later polls',async()=>{
 let calls=0;
 const f=fixture({fetchImpl:async()=>{calls++;return response({ok:false},503);}});
 const results=await Promise.all(Array.from({length:54},(_,i)=>f.transport.request('/api/engine-'+i)));
 assert.ok(calls<=4,`only the small admission window may reach the backend, got ${calls}`);
 assert.ok(results.every(r=>r.status===503));assert.equal(f.transport.snapshot().state,'OPEN');
 const before=calls;
 for(let i=0;i<100;i++)assert.equal((await f.transport.request('/api/gold-live-price')).status,503);
 assert.equal(calls,before);assert.equal(f.transport.snapshot().retry_in_seconds,30);
});
test('recovery admits one probe, reopens on failure with longer delay, then closes on real success',async()=>{
 let healthy=false;
 const f=fixture({failureThreshold:1,fetchImpl:async()=>response({ok:healthy},healthy?200:503)});
 await f.transport.request('/api/first');assert.equal(f.transport.snapshot().state,'OPEN');
 f.setTime(30000);
 const a=f.transport.request('/api/probe'),b=f.transport.request('/api/other');
 assert.equal((await b).status,503);await a;
 assert.equal(f.transport.snapshot().state,'OPEN');assert.equal(f.transport.snapshot().retry_in_seconds,60);
 healthy=true;f.setTime(90000);
 assert.equal((await f.transport.request('/api/recovered')).status,200);
 assert.equal(f.transport.snapshot().state,'CLOSED');assert.equal(f.transport.snapshot().retry_in_seconds,0);
 assert.equal((await f.transport.request('/api/next')).status,200);
});
test('hidden pages cancel active and queued work without poisoning later recovery',async()=>{
 const f=fixture();const a=f.transport.request('/api/one'),b=f.transport.request('/api/two'),c=f.transport.request('/api/three');
 await turn();f.hide();await Promise.all([a,b,c]);
 assert.equal(f.transport.snapshot().state,'PAUSED');assert.equal(f.requests.length,2);
 assert.equal((await f.transport.request('/api/hidden')).status,503);
 f.show();const d=f.transport.request('/api/back');await turn();
 f.requests.at(-1).resolve(response());assert.equal((await d).status,200);
 assert.equal(f.transport.snapshot().state,'CLOSED');
});
test('queue cancellation removes abandoned work before the backend is contacted',async()=>{
 const f=fixture(),controller=new AbortController();
 const a=f.transport.request('/api/one'),b=f.transport.request('/api/two');await turn();
 const c=f.transport.request('/api/queued',{signal:controller.signal});controller.abort();
 assert.equal((await c).status,503);assert.equal(f.transport.snapshot().queued,0);
 f.hide();await Promise.all([a,b]);assert.equal(f.requests.some(r=>r.path==='/api/queued'),false);
});
test('unavailable routes, methods and absolute foreign URLs cannot start research work',async()=>{
 const f=fixture();
 for(const [url,options] of [['https://evil.test/api/state',{}],['/api/state',{method:'POST'}],['/api/public-market-reference',{}],['/owner/',{}]])
  assert.equal((await f.transport.request(url,options)).status,503);
 assert.equal(f.requests.length,0);
});
test('endpoint authorization failures stay local and missing JSON never becomes a success',async()=>{
 let calls=0;
 const f=fixture({failureThreshold:1,fetchImpl:async()=>{calls++;return calls===1?response({ok:false},403):new Response('<html>not JSON</html>');}});
 assert.equal((await f.transport.request('/api/forbidden')).status,403);assert.equal(f.transport.snapshot().state,'CLOSED');
 assert.equal((await f.transport.request('/api/forbidden')).status,503);assert.equal(calls,1);
 assert.equal((await f.transport.request('/api/html')).status,503);assert.equal(f.transport.snapshot().state,'OPEN');
});
test('network and response-body deadlines stay bounded even when a provider ignores abort',async()=>{
 for(const fetchImpl of [()=>new Promise(()=>{}),async()=>({ok:true,status:200,clone:()=>({json:()=>new Promise(()=>{})})})]){
  const keepAlive=setTimeout(()=>{},1000);
  try{
   const f=fixture({failureThreshold:1,deadlineMs:15,fetchImpl});
   const result=await f.transport.request('/api/stalled');
   assert.equal(result.status,503);assert.equal(f.transport.snapshot().state,'OPEN');
  }finally{clearTimeout(keepAlive);}
 }
});
