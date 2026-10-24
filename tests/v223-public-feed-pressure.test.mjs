import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createFeedPressureGate,GOLD_TTL_MS,DEFAULT_TTL_MS,GOLD_FEED,PAPER_FEED} from '../src/public-feed-pressure.mjs';

test('twenty simultaneous requests share one in-flight upstream read per instance',async()=>{
 let time=1000,calls=0,release;
 const gate=createFeedPressureGate({now:()=>time,read:()=>{calls++;return new Promise(r=>{release=r});}});
 const results=Array.from({length:20},()=>gate.observe(GOLD_FEED));
 assert.equal(calls,1);
 release({ok:true,generated_at:'never claim fresh'});
 const answers=await Promise.all(results);
 assert.equal(calls,1);
 assert.ok(answers.every(x=>x.ok&&x.mode==='UPSTREAM'));
});
test('Gold cache is at most one second; generic read remains separately bounded',async()=>{
 let time=10000,calls=0;
 const gate=createFeedPressureGate({now:()=>time,read:async()=>({ok:true,seq:++calls})});
 assert.equal(GOLD_TTL_MS,1000); assert.equal(DEFAULT_TTL_MS,15000);
 assert.equal((await gate.observe(GOLD_FEED)).body.seq,1);
 time+=900;
 assert.equal((await gate.observe(GOLD_FEED)).mode,'FRESH_CACHE');
 time+=101;
 assert.equal((await gate.observe(GOLD_FEED)).body.seq,2);
 assert.equal((await gate.observe('latest-global-markets')).body.seq,3);
 time+=14000;
 assert.equal((await gate.observe('latest-global-markets')).mode,'FRESH_CACHE');
 time+=1001;
 assert.equal((await gate.observe('latest-global-markets')).body.seq,4);
});
test('a failed or non-success response is not promoted to HTTP success',async()=>{
 let time=1000,calls=0;
 const gate=createFeedPressureGate({now:()=>time,read:async()=>{
  calls++;if(calls===1)return {ok:false,error:'PGRST002'};
  if(calls===2)throw Error('provider unavailable');
  return {ok:true,market_status:'UNAVAILABLE'};
 }});
 const first=await gate.observe(GOLD_FEED);
 assert.equal(first.ok,false); assert.equal(first.mode,'UPSTREAM_UNAVAILABLE');
 time+=1000;assert.equal((await gate.observe(GOLD_FEED)).mode,'FAILURE_COOLDOWN');
 assert.equal(calls,1);
 time+=3000;assert.equal((await gate.observe(GOLD_FEED)).ok,false);
 time+=4000;assert.equal((await gate.observe(GOLD_FEED)).mode,'FAILURE_COOLDOWN');
 time+=4000;assert.equal((await gate.observe(GOLD_FEED)).ok,true);
 assert.equal(calls,3);
});
test('no stale cached success survives an upstream error',async()=>{
 let time=1000,calls=0;
 const gate=createFeedPressureGate({now:()=>time,read:async()=>{
  calls++;if(calls===2)throw Error('unavailable');return {ok:true,seq:calls};
 }});
 assert.equal((await gate.observe(GOLD_FEED)).ok,true);
 time+=1000;assert.equal((await gate.observe(GOLD_FEED)).ok,false);
 time+=100;assert.equal((await gate.observe(GOLD_FEED)).mode,'FAILURE_COOLDOWN');
 time+=4000;assert.equal((await gate.observe(GOLD_FEED)).body.seq,3);
});
test('paper intake responses are never cached and invalid cooldowns fail',async()=>{
 let calls=0;
 const gate=createFeedPressureGate({read:async()=>({ok:true,seq:++calls})});
 assert.equal((await gate.observe(PAPER_FEED)).body.seq,1);
 assert.equal((await gate.observe(PAPER_FEED)).body.seq,2);
 assert.throws(()=>createFeedPressureGate({read:()=>{},failureCooldownMs:0}),RangeError);
});
test('API preserves strict allowlist and checkout stays disabled',()=>{
 const source=readFileSync(new URL('../api/market-feed.js',import.meta.url),'utf8');
 const checkout=readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8');
 const gold=readFileSync(new URL('../src/public-gold-evidence.mjs',import.meta.url),'utf8');
 assert.match(source,/new Set\(/);
 assert.match(source,/url.searchParams.getAll\('feed'\).length!==1/);
 assert.match(source,/body.ok===false/);
 assert.match(source,/X-TFA-Feed-Pressure/);
 assert.match(source,/res.status\(503\)/);
 assert.match(checkout,/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(gold,/GOLD_LAUNCH_MAX_AGE_MS = 5_000/);
});
