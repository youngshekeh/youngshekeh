import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {readGoldWithinBudget,BROKER_BUDGET_MS,REFERENCE_BUDGET_MS} from '../src/gold-read-budget.mjs';
import {curatePublicGold} from '../src/public-gold-curation.mjs';
import {verifyPublicGoldQuote} from '../src/public-gold-evidence.mjs';
const NOW=Date.parse('2026-10-21T09:40:00Z'),at=new Date(NOW-1000).toISOString();
const broker=()=>({httpOk:true,data:{ok:true,live_broker:{state:'BROKER_LIVE',
quote:{observed_at:at,age_seconds:1,bid:4200,mid:4200.5,ask:4201}}}});
const reference=()=>({httpOk:true,data:{ok:true,feed:{gold_spot:{
symbol:'XAUUSD',currency:'USD',quote_type:'spot_indicative',
price:4200,market_time:at,source:'Public research reference'}}}});
test('fresh MT5 read-only quote means no secondary provider request',async()=>{
 const calls=[];const r=await readGoldWithinBudget({read:async(slug,ms)=>{calls.push([slug,ms]);return broker()},curate:curatePublicGold,now:()=>NOW});
 assert.equal(r.market_status,'BROKER_LIVE');
 assert.deepEqual(calls,[['public-gold-live-xauusd',BROKER_BUDGET_MS]]);
 assert.equal(r.governance.live_order_submission_enabled,false);
});
test('failed broker triggers exactly one sequential indicative attempt',async()=>{
 const calls=[];const r=await readGoldWithinBudget({read:async(slug,ms)=>{calls.push([slug,ms]);return calls.length===1?{httpOk:false}:reference()},curate:curatePublicGold,now:()=>NOW});
 assert.deepEqual(calls,[['public-gold-live-xauusd',BROKER_BUDGET_MS],['public-gold-live-api',REFERENCE_BUDGET_MS]]);
 assert.equal(r.market_status,'INDICATIVE_RESEARCH');assert.equal(r.live_broker.state,'NOT_VERIFIED');
});
test('both unavailable: no false green, combined deadline budget under 6s',async()=>{
 assert.ok(BROKER_BUDGET_MS+REFERENCE_BUDGET_MS<6000);
 const r=await readGoldWithinBudget({read:async()=>{throw Error('timeout')},curate:curatePublicGold,now:()=>NOW});
 assert.equal(r.ok,false);assert.equal(r.governance.capital_permission,'0R');
});
test('upstream HTTP failure cannot turn research quote positive',async()=>{
 const r=await readGoldWithinBudget({read:async slug=>slug==='public-gold-live-api'?{...reference(),httpOk:false}:{httpOk:false},curate:curatePublicGold,now:()=>NOW});
 assert.equal(r.ok,false);
});
test('browser shares strict V222 proof and public route shortens response time',()=>{
 const browser=readFileSync(new URL('../src/public-gold-launch.mjs',import.meta.url),'utf8');
 const api=readFileSync(new URL('../api/public-gold-read.js',import.meta.url),'utf8');
 assert.match(browser,/verifyPublicGoldQuote\(\{response:\{ok:response.ok\},data\}\)/);
 assert.match(browser,/AbortSignal.timeout\(7500\)/);
 assert.match(api,/readGoldWithinBudget/);assert.doesNotMatch(api,/11500|9500/);
 assert.equal(verifyPublicGoldQuote({response:{ok:true},data:{ok:true,live_broker:{state:'BROKER_LIVE',
 quote:{observed_at:at,age_seconds:'0',bid:4200,mid:4200.5,ask:4201}}}},NOW).verified,false);
});
test('checkout remains hard locked, no DB cron or billing mutations',()=>{
 const src=readFileSync(new URL('../src/gold-read-budget.mjs',import.meta.url),'utf8');
 const checkout=readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8');
 assert.match(checkout,/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.doesNotMatch(src,/cron\.alter_job|pg_terminate_backend|SUPABASE_SERVICE_ROLE_KEY|create-checkout|execute_trade/);
});
