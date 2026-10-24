import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFeedPressureGate,GOLD_FEED,PAPER_FEED,MAX_FAILURE_COOLDOWN_MS,GOLD_MAX_FAILURE_COOLDOWN_MS,PAPER_MAX_FAILURE_COOLDOWN_MS} from '../src/public-feed-pressure.mjs';
const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('generic failing reads exponentially back off up to 60s, reset on a valid recovery',async()=>{
 let time=10000,calls=0,failed=true;
 const gate=createFeedPressureGate({now:()=>time,read:async()=>{calls++;if(failed)throw Error('transient upstream');return{ok:true,seq:calls}}});
 assert.equal(MAX_FAILURE_COOLDOWN_MS,60000);
 for(const delay of [4000,8000,16000,32000,60000,60000]){
  const error=await gate.observe('latest-global-markets');
  assert.equal(error.mode,'UPSTREAM_UNAVAILABLE');
  assert.equal(error.retry_after_seconds,delay/1000);
  assert.equal((await gate.observe('latest-global-markets')).mode,'FAILURE_COOLDOWN');
  const before=calls;time+=delay-100;
  const held=await gate.observe('latest-global-markets');
  assert.equal(held.mode,'FAILURE_COOLDOWN');
  assert.equal(calls,before);
  time+=100;
 }
 failed=false;assert.equal((await gate.observe('latest-global-markets')).ok,true);
 time+=15000;failed=true;
 const firstAfterRecovery=await gate.observe('latest-global-markets');
 assert.equal(firstAfterRecovery.mode,'UPSTREAM_UNAVAILABLE');
 assert.equal(firstAfterRecovery.retry_after_seconds,4);
});
test('Gold failure cooldown is capped at 12s and a failed read cannot return stale quote',async()=>{
 let time=1000,calls=0,failed=true;
 const gate=createFeedPressureGate({now:()=>time,read:async()=>{calls++;if(failed)throw Error('no gold');return{ok:true,quote:calls}}});
 assert.equal(GOLD_MAX_FAILURE_COOLDOWN_MS,12000);
 for(const delay of [4000,8000,12000,12000,12000]){
  const r=await gate.observe(GOLD_FEED);
  assert.equal(r.ok,false);assert.equal(r.retry_after_seconds,delay/1000);time+=delay;
 }
 failed=false;
 assert.equal((await gate.observe(GOLD_FEED)).ok,true);
 time+=1000;failed=true;
 const unavailable=await gate.observe(GOLD_FEED);
 assert.equal(unavailable.ok,false);
 assert.equal(unavailable.body,undefined);
 assert.equal(unavailable.retry_after_seconds,4);
});
test('paper broker quote is not cached or delayed beyond original 4s guard',async()=>{
 let time=1000,calls=0,failed=true;
 const gate=createFeedPressureGate({now:()=>time,read:async()=>{calls++;if(failed)throw Error('no broker');return{ok:true,quote:calls}}});
 assert.equal(PAPER_MAX_FAILURE_COOLDOWN_MS,4000);
 for(let i=0;i<6;i++){
  const r=await gate.observe(PAPER_FEED);
  assert.equal(r.mode,'UPSTREAM_UNAVAILABLE');assert.equal(r.retry_after_seconds,4);time+=4000;
 }
 failed=false;
 assert.equal((await gate.observe(PAPER_FEED)).body.quote,7);
 assert.equal((await gate.observe(PAPER_FEED)).body.quote,8);
});
test('failures are isolated by route and healthy simultaneous GETs stay coalesced',async()=>{
 let calls=0,release;
 const gate=createFeedPressureGate({now:()=>1000,read:async key=>{
  if(key==='failure')throw Error('down');
  calls++;return new Promise(resolve=>{release=resolve});
 }});
 assert.equal((await gate.observe('failure')).mode,'UPSTREAM_UNAVAILABLE');
 const one=gate.observe('success'),two=gate.observe('success');
 assert.equal(calls,1);
 release({ok:true,seq:1});
 assert.equal((await one).body.seq,1);
 assert.equal((await two).body.seq,1);
 assert.equal((await gate.observe('failure')).mode,'FAILURE_COOLDOWN');
});
test('HTTP 503 returns bounded Retry-After and never promotes failed quote or charges',()=>{
 const market=get('api/market-feed.js'),gold=get('api/public-gold-read.js'),checkout=get('src/checkout.ts');
 assert.match(market,/X-TFA-Feed-Pressure-Version','V281'/);
 assert.match(market,/Retry-After/);
 assert.match(gold,/Retry-After/);
 assert.match(market,/res.status\(503\)/);
 assert.match(gold,/res.status\(503\)/);
 assert.match(market,/FEEDS.has\(feed\)/);
 assert.match(checkout,/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(get('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
 assert.throws(()=>createFeedPressureGate({read:()=>{},maxFailureCooldownMs:0}),RangeError);
 assert.throws(()=>createFeedPressureGate({read:()=>{},maxFailureCooldownMs:65000}),RangeError);
});
