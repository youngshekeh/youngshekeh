import test from 'node:test';
import assert from 'node:assert/strict';
import {readGoldWithinBudget} from '../src/gold-read-budget.mjs';
import {curatePublicGold} from '../src/public-gold-curation.mjs';
import {goldDisplay} from '../src/public-gold-display.mjs';
const now=Date.parse('2026-10-23T12:00:00Z'),at=new Date(now-1000).toISOString();
const independent=()=>({name:'Gold',symbol:'XAU',currency:'USD',price:4000,updatedAt:at});
const live=()=>({httpOk:true,data:{ok:true,live_broker:{state:'BROKER_LIVE',quote:{bid:4001,mid:4002,ask:4003,age_seconds:1,observed_at:at}}}});
const run=opts=>readGoldWithinBudget({curate:curatePublicGold,now:()=>now,...opts});
test('a fast authenticated broker does not wait for a stalled independent source',async()=>{
 const body=await run({read:async()=>live(),independent:()=>new Promise(()=>{}),brokerGraceMs:5});
 assert.equal(goldDisplay(body,now).mode,'BROKER_LIVE_READ_ONLY');
});
test('an independent reference does not wait for a stalled broker beyond grace',async()=>{
 const body=await run({read:()=>new Promise(()=>{}),independent:async()=>independent(),brokerGraceMs:5});
 assert.equal(body.data_lane,'INDEPENDENT_PUBLIC_REFERENCE');
 assert.equal(body.governance.capital_permission,'0R');
});
test('broker response within grace outranks independent reference',async()=>{
 let resolveBroker;const pending=new Promise(r=>resolveBroker=r);
 const promise=run({read:()=>pending,independent:async()=>independent(),brokerGraceMs:100});
 await Promise.resolve();await Promise.resolve();
 resolveBroker(live());
 const body=await promise;
 assert.equal(body.price_class,'BROKER_LIVE_READ_ONLY');
});
test('invalid independent quote cannot bypass broker or recovery reads',async()=>{
 const calls=[];
 const body=await run({read:async slug=>{calls.push(slug);return {httpOk:false};},independent:async()=>({...independent(),updatedAt:new Date(now-121000).toISOString()}),brokerGraceMs:5});
 assert.equal(body.ok,false);assert.deepEqual(calls,['public-gold-live-xauusd','public-gold-live-api']);
});
test('invalid broker grace is rejected',async()=>{
 await assert.rejects(()=>run({read:async()=>({httpOk:false}),brokerGraceMs:0}),RangeError);
});
test('an old indicative reference is rejected by both API curation and display',()=>{
 const old=new Date(now-121000).toISOString();
 const body=curatePublicGold({reference:{httpOk:true,data:{ok:true,feed:{gold_spot:{symbol:'XAUUSD',currency:'USD',price:4000,market_time:old,quote_type:'spot_indicative',source:'Test'}}}}},now);
 assert.equal(body.ok,false);assert.equal(goldDisplay(body,now).mode,'UNAVAILABLE');
});
