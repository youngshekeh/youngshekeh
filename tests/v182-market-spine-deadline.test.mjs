import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../supabase/functions/public-live-markets-api/index.ts',import.meta.url),'utf8');
const begin=source.indexOf('async function gold()');
const goldSource=source.slice(begin,source.indexOf('\nasync function build()',begin));
const body={ok:true,market_status:'DELAYED_LIVE',feed:{gold_futures:{price:4200}},engine:{action:'WAIT',capital_permission:'0R'}};

function fixture({delay=7500,status=200,data=body}={}) {
  const events=[];let calls=0;
  const AbortSignal={timeout(ms){const controller=new AbortController();events.push({at:ms,run:()=>controller.abort(new Error('timeout'))});return controller.signal;}};
  const fetch=(url,{signal})=>{
    calls++;assert.equal(url,'https://example.test/public-gold-live-xauusd');
    return new Promise((resolve,reject)=>{
      signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
      events.push({at:delay,run:()=>resolve({ok:status===200,json:async()=>data})});
    });
  };
  const read=new Function('BASE','fetch','AbortSignal',`${goldSource}\nreturn gold;`)('https://example.test',fetch,AbortSignal);
  return {read,calls:()=>calls,advance(ms){events.sort((a,b)=>a.at-b.at);while(events.length&&events[0].at<=ms)events.shift().run();}};
}

test('the market spine accepts a healthy Gold observation after the former six-second cutoff', async()=>{
  const ctx=fixture(),pending=ctx.read();ctx.advance(7500);
  assert.deepEqual(await pending,body);assert.equal(ctx.calls(),1);
});
test('the market spine still rejects an unavailable or failed upstream response', async()=>{
  for(const options of [{status:503},{data:{ok:false,state:'UNAVAILABLE'}}]){
    const ctx=fixture(options),pending=ctx.read();ctx.advance(7500);
    await assert.rejects(pending,/market_spine_unavailable/);assert.equal(ctx.calls(),1);
  }
});
test('the market spine stops upstream work at 8.5 seconds without retry', async()=>{
  const ctx=fixture({delay:12000}),pending=ctx.read();ctx.advance(8500);
  await assert.rejects(pending,/timeout/);assert.equal(ctx.calls(),1);
});
