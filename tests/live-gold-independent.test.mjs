import test from 'node:test';
import assert from 'node:assert/strict';
import {composeGoldRead,readIndependentGold} from '../src/public-gold-independent.mjs';
import {goldDisplay} from '../src/public-gold-display.mjs';
import {verifyPublicGoldQuote} from '../src/public-gold-evidence.mjs';
const now=Date.UTC(2026,9,23,12);
const ref=()=>({symbol:'XAU',currency:'USD',price:4000,updatedAt:new Date(now-1000).toISOString()});
const broker=()=>({ok:true,live_broker:{state:'BROKER_LIVE',quote:{mid:4010,bid:4009,ask:4011,age_seconds:1,observed_at:new Date(now-1000).toISOString()}},governance:{capital_permission:'0R',live_order_submission_enabled:false}});
test('independent source survives database failure without becoming broker proof',()=>{
 const p=composeGoldRead(null,ref(),now);assert.equal(p.ok,true);assert.equal(p.feed.gold_spot.price,4000);assert.equal(p.data_lane,'INDEPENDENT_PUBLIC_REFERENCE');assert.equal(goldDisplay(p,now).mode,'INDICATIVE_REFERENCE');assert.equal(verifyPublicGoldQuote({response:{ok:true},data:p},now).verified,false);assert.equal(p.governance.live_order_submission_enabled,false);
});
test('fresh authenticated broker retains priority, stale broker never retains live status',()=>{
 assert.equal(composeGoldRead(broker(),ref(),now).live_broker.state,'BROKER_LIVE');const b=broker();b.live_broker.quote.observed_at=new Date(now-6000).toISOString();assert.equal(composeGoldRead(b,ref(),now).live_broker.state,'NOT_VERIFIED');
});
test('missing, stale, future, wrong-symbol and nonpositive references are withheld',()=>{
 for(const change of [r=>r.updatedAt=new Date(now-120001).toISOString(),r=>r.updatedAt=new Date(now+6000).toISOString(),r=>r.symbol='BTC',r=>r.currency='EUR',r=>r.price=0,r=>delete r.updatedAt]){const r=ref();change(r);assert.equal(composeGoldRead(null,r,now).ok,false);}
});
test('display clears at freshness deadline even without another network response',()=>{
 const p=composeGoldRead(null,ref(),now);assert.equal(goldDisplay(p,now+120001).mode,'UNAVAILABLE');assert.equal(goldDisplay(broker(),now+5001).mode,'UNAVAILABLE');assert.equal(goldDisplay({...p,governance:{capital_permission:'1R',live_order_submission_enabled:true}},now).mode,'UNAVAILABLE');
});
test('fixed independent provider handles HTTP errors and transport outages',async()=>{
 assert.equal(await readIndependentGold(async()=>new Response('',{status:503})),null);assert.equal(await readIndependentGold(async()=>{throw Error()}),null);let url;await readIndependentGold(async u=>{url=u;return new Response(JSON.stringify(ref()));});assert.equal(url,'https://api.gold-api.com/price/XAU');
});
