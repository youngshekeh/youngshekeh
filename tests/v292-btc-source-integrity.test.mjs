import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 assessBtcExchangeTicker,readBtcExchangeResearch,
 BTC_TICKER_SOURCE,BTC_TICKER_MAX_AGE_MS,BTC_RESEARCH_GOVERNANCE
} from '../src/v292-btc-24h-source.mjs';
const clock=Date.parse('2026-10-25T07:10:00Z');
const packet=(time)=>({price:'80474.99',time:time||'2026-10-25T07:09:55.943462270Z',bid:'80474.98',ask:'80474.99'});
test('V292 UTC exchange trade time, not arrival time, proves research source age',()=>{
 const x=assessBtcExchangeTicker(packet(),clock);
 assert.equal(x.ok,true);assert.equal(x.price_usd,80474.99);
 assert.equal(x.source_trade_time,'2026-10-25T07:09:55.943Z');
 assert.equal(x.market_schedule,'24_7');
 assert.equal(x.combined_weekday_snapshot_not_overwritten,true);
 assert.equal(x.licensing,'COMMERCIAL_RIGHTS_NOT_VERIFIED');
 assert.equal(x.governance.action_permitted,'WAIT');
 assert.equal(x.governance.capital_permission,'0R');
 assert.equal(x.governance.commercial_redistribution_approved,false);
});
test('V292 stale, malformed, future, missing and impossible prices all fail closed',()=>{
 const cases=[
 [packet('2026-10-25T07:08:00Z'),'STALE_EXCHANGE_TRADE'],
 [packet('2026-10-25T07:11:00Z'),'SOURCE_TIME_IN_FUTURE'],
 [packet('2026-10-25T07:10:08Z'),'SOURCE_TIME_IN_FUTURE'],
 [packet('2026-10-25T07:09:55+00:00'),'SOURCE_TIMESTAMP_INVALID'],
 [{price:'80474.99'},'SOURCE_TIMESTAMP_INVALID'],
 [{...packet(),price:'NaN'},'PRICE_INVALID'],
 [{...packet(),price:-1},'PRICE_INVALID'],
 [{...packet(),price:null},'PRICE_INVALID'],
 [[], 'TICKER_UNAVAILABLE'],[null,'TICKER_UNAVAILABLE']
 ];
 for(const [value,state] of cases){
  const x=assessBtcExchangeTicker(value,clock);
  assert.equal(x.state,state);
  assert.equal(x.ok,false);assert.equal(x.price_usd,null);
 }
 assert.equal(BTC_TICKER_MAX_AGE_MS,90000);
});
test('V292 network errors and HTTP failures cannot serve cached or fake prices',async()=>{
 for(const f of [async()=>({ok:false,status:429}),async()=>{throw Error('sensitive');},
  async()=>({ok:true,json:async()=>{throw Error('bad response')}})]){
  const result=await readBtcExchangeResearch({fetchImpl:f,now:()=>clock});
  assert.equal(result.ok,false);assert.equal(result.price_usd,null);
  assert.doesNotMatch(JSON.stringify(result),/sensitive/);
 }
});
test('V292 fixed-origin read-only fetch, no user-supplied target, no release permissions',async()=>{
 let seen;
 const result=await readBtcExchangeResearch({
  now:()=>clock,
  fetchImpl:async(url,opts)=>{
    seen={url,opts};
    return {ok:true,json:async()=>packet()};
  }
 });
 assert.equal(result.ok,true);
 assert.equal(seen.url,BTC_TICKER_SOURCE);
 assert.equal(seen.opts.method,'GET');
 assert.equal(seen.opts.cache,'no-store');
 assert.equal(seen.opts.redirect,'error');
 assert.ok(seen.opts.signal instanceof AbortSignal);
 assert.equal(BTC_RESEARCH_GOVERNANCE.live_order_submission_enabled,false);
 const prices=readFileSync(new URL('../supabase/functions/capture-live-markets-snapshot/index.ts',import.meta.url),'utf8');
 assert.match(prices,/public-market-freshness-gate/);
 const checkout=readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8');
 assert.match(checkout,/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
});
