import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';

const frontend=await readFile(new URL('../src/public-surfaces.ts',import.meta.url),'utf8');
const start=frontend.indexOf('async function read(');
const source=stripTypeScriptTypes(frontend.slice(start,frontend.indexOf('\nasync function readLocal(',start)));

function fixture({latency=7000,status=200,body={ok:true,market_status:'DELAYED_LIVE'}}={}) {
  let clock=0, calls=0; const events=[];
  const AbortSignal={timeout(ms){
    const controller=new AbortController();
    events.push({at:clock+ms,run:()=>controller.abort(new Error('timeout'))});
    return controller.signal;
  }};
  const fetch=async (url,{signal}) => {
    calls++;
    return new Promise((resolve,reject)=>{
      signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
      events.push({at:clock+latency,run:()=>resolve({ok:status===200,json:async()=>body})});
    });
  };
  const read=new Function('fetch','AbortSignal',`${source}\nreturn read;`)(fetch,AbortSignal);
  return {read,calls:()=>calls,advance(ms){
    const until=clock+ms;
    events.sort((a,b)=>a.at-b.at);
    while(events.length && events[0].at<=until){const event=events.shift();clock=event.at;event.run();}
    clock=until;
  }};
}

test('a healthy seven-second public bridge response survives the old short browser deadlines', async () => {
  for(const timeout of [3500,4500,5000,6500,10000]){
    const ctx=fixture(); const pending=ctx.read('public-live-markets-api',timeout);
    ctx.advance(7000);
    assert.deepEqual(await pending,{ok:true,market_status:'DELAYED_LIVE'});
    assert.equal(ctx.calls(),1);
  }
});
test('an unavailable public bridge response cannot become a healthy market observation', async () => {
  const ctx=fixture({status:503,body:{ok:false,state:'UNAVAILABLE'}});
  const pending=ctx.read('public-live-markets-api',4500); ctx.advance(7000);
  assert.deepEqual(await pending,{ok:false,state:'UNAVAILABLE'}); assert.equal(ctx.calls(),1);
});
test('the browser deadline still fails closed without a retry or retained data', async () => {
  const ctx=fixture({latency:15000});
  const pending=ctx.read('public-live-markets-api',4500); ctx.advance(12000);
  assert.deepEqual(await pending,{ok:false,state:'UNAVAILABLE',error:'transport_unavailable'});
  assert.equal(ctx.calls(),1);
});
