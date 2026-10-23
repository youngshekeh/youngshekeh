import test from 'node:test';
import assert from 'node:assert/strict';
import {readGoldWithinBudget} from '../src/gold-read-budget.mjs';
import {curatePublicGold} from '../src/public-gold-curation.mjs';
const NOW=Date.parse('2026-10-23T12:00:00Z');
const spot={httpOk:true,data:{ok:true,feed:{gold_spot:{symbol:'XAUUSD',currency:'USD',price:4200,market_time:new Date(NOW-1000).toISOString(),quote_type:'spot_indicative',source:'Fixed reference'}}}};
test('stalled broker starts fallback during grace, not after timeout',async()=>{
 const calls=[];let finishBroker;
 const broker=new Promise(resolve=>{finishBroker=resolve});
 const result=readGoldWithinBudget({read:async slug=>{calls.push(slug);return slug==='public-gold-live-xauusd'?broker:spot},curate:curatePublicGold,now:()=>NOW,brokerGraceMs:10});
 await new Promise(resolve=>setTimeout(resolve,35));
 assert.deepEqual(calls,['public-gold-live-xauusd','public-gold-live-api']);
 finishBroker({httpOk:false});
 const body=await result;
 assert.equal(body.market_status,'INDICATIVE_RESEARCH');assert.equal(body.governance.capital_permission,'0R');
});
test('fast authenticated broker does not call fallback',async()=>{
 const calls=[];
 const body=await readGoldWithinBudget({read:async slug=>{calls.push(slug);return {httpOk:true,data:{ok:true,live_broker:{state:'BROKER_LIVE',quote:{observed_at:new Date(NOW-1000).toISOString(),age_seconds:1,bid:4199,mid:4200,ask:4201}}}}},curate:curatePublicGold,now:()=>NOW,brokerGraceMs:20});
 assert.equal(body.market_status,'BROKER_LIVE');
 await new Promise(resolve=>setTimeout(resolve,35));
 assert.deepEqual(calls,['public-gold-live-xauusd']);
});
