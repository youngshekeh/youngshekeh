import test from 'node:test';
import assert from 'node:assert/strict';
import {readGoldWithinBudget} from '../src/gold-read-budget.mjs';
import {curatePublicGold} from '../src/public-gold-curation.mjs';
const now=Date.parse('2026-10-23T12:00:00Z'),at=new Date(now-1000).toISOString();
const independent=()=>({name:'Gold',symbol:'XAU',currency:'USD',price:4000,updatedAt:at});
const broker=()=>({httpOk:true,data:{ok:true,live_broker:{state:'BROKER_LIVE',quote:{bid:4001,mid:4002,ask:4003,age_seconds:1,observed_at:at}}}});
test('broker and independent reads start concurrently; healthy reference skips secondary database',async()=>{
 let release;const calls=[];const pending=new Promise(r=>release=r);
 const result=readGoldWithinBudget({read:async slug=>{calls.push(slug);return pending;},independent:async()=>{calls.push('independent');return independent();},curate:curatePublicGold,now:()=>now});
 await Promise.resolve();assert.deepEqual(calls,['public-gold-live-xauusd','independent']);
 release({httpOk:false});const body=await result;
 assert.equal(body.ok,true);assert.equal(body.data_lane,'INDEPENDENT_PUBLIC_REFERENCE');assert.equal(body.feed.gold_spot.price,4000);assert.equal(calls.length,2);
 assert.equal(body.governance.live_order_submission_enabled,false);
});
test('concurrent independent success cannot replace a verified broker observation',async()=>{
 const body=await readGoldWithinBudget({read:async()=>broker(),independent:async()=>independent(),curate:curatePublicGold,now:()=>now});
 assert.equal(body.price_class,'BROKER_LIVE_READ_ONLY');assert.equal(body.feed.gold_spot.price,4002);
});
test('secondary database recovery remains available only when primary lanes fail',async()=>{
 const calls=[];const body=await readGoldWithinBudget({read:async slug=>{calls.push(slug);return slug==='public-gold-live-api'?{httpOk:true,data:{ok:true,feed:{gold_spot:{symbol:'XAUUSD',currency:'USD',price:3999,market_time:at,source:'Recovery',quote_type:'spot_indicative'}}}}:{httpOk:false};},independent:async()=>{throw Error('offline');},curate:curatePublicGold,now:()=>now});
 assert.equal(body.feed.gold_spot.price,3999);assert.deepEqual(calls,['public-gold-live-xauusd','public-gold-live-api']);
});
test('stale independent and recovery sources are both withheld',async()=>{
 const old=new Date(now-121000).toISOString();const body=await readGoldWithinBudget({read:async()=>({httpOk:true,data:{ok:true,feed:{gold_spot:{symbol:'XAUUSD',currency:'USD',price:3999,market_time:old,source:'Recovery',quote_type:'spot_indicative'}}}}),independent:async()=>({...independent(),updatedAt:old}),curate:curatePublicGold,now:()=>now});
 assert.equal(body.ok,false);assert.equal(body.governance.capital_permission,'0R');
});
