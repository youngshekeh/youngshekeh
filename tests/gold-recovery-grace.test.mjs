import test from 'node:test';
import assert from 'node:assert/strict';
import {readGoldWithinBudget} from '../src/gold-read-budget.mjs';
import {curatePublicGold} from '../src/public-gold-curation.mjs';
const now=Date.parse('2026-10-23T12:00:00Z');
test('healthy broker resolves before grace without calling recovery feed',async()=>{
 const calls=[];const read=async slug=>{calls.push(slug);return {httpOk:true,data:{ok:true,live_broker:{state:'BROKER_LIVE',quote:{observed_at:new Date(now-1000).toISOString(),age_seconds:1,bid:4200,mid:4200.5,ask:4201}}}}};
 const p=await readGoldWithinBudget({read,curate:curatePublicGold,now:()=>now});
 assert.equal(p.market_status,'BROKER_LIVE');assert.deepEqual(calls,['public-gold-live-xauusd']);
});
