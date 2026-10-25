import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  PUBLIC_BTC_DISPLAY_RIGHTS_VERIFIED,BTC_PUBLIC_DATA_HOLD,
  publiclyDisplayableBitcoin
} from '../src/v293-public-btc-license.mjs';
import {
  classifyAssetSourceTime,SESSION_PROVENANCE_HOLD
} from '../src/v293-market-session-truth.mjs';
import {verifiedPublicReferences} from '../src/v235-reference-integrity.mjs';
const sun=Date.parse('2026-10-25T08:00:00Z');
const oldFriday='2026-10-23T20:55:22.143Z';
test('V293: public BTC display is a hard no until agreement and release review',()=>{
 assert.equal(PUBLIC_BTC_DISPLAY_RIGHTS_VERIFIED,false);
 assert.equal(BTC_PUBLIC_DATA_HOLD.public_quote_allowed,false);
 assert.equal(BTC_PUBLIC_DATA_HOLD.commercial_redistribution_approved,false);
 assert.equal(publiclyDisplayableBitcoin({price:80000}),null);
 const packet={ok:true,reference_only:true,not_for_trade_execution:true,
 governance:{capital_permission:'0R',live_order_submission_enabled:false},
 assets:{bitcoin:{
  symbol:'BTCUSD',currency:'USD',source:'Coinbase',price:80000,
  type:'SPOT_RECEIPT_NOT_SOURCE_TIMESTAMPED',
  observed_at:new Date(sun-1000).toISOString(),
  source_updated_at:null,broker_verified:false,execution_quote:false
 }}};
 const observed=verifiedPublicReferences(packet,sun);
 assert.equal(observed.bitcoin,null);
 assert.equal(observed.count,0);
});
test('V293: mixed Friday cross-asset snapshot cannot be certified as current on Sunday',()=>{
 const btc=classifyAssetSourceTime({key:'bitcoin',price:80474.99,market_time:oldFriday},sun);
 assert.equal(btc.state,'SOURCE_STALE');
 assert.equal(btc.verified_live,false);
 assert.equal(btc.tradeable,false);
 const gold=classifyAssetSourceTime({key:'gold',price:4100,market_time:oldFriday},sun);
 assert.equal(gold.state,'WEEKEND_SESSION_REFERENCE_NOT_LIVE');
 assert.equal(gold.verified_live,false);
 assert.equal(gold.governance.capital_permission,'0R');
});
test('V293: recent sources remain indicative, not execution-grade, even if timing passes',()=>{
 const x=classifyAssetSourceTime({key:'bitcoin',price:80474.99,market_time:'2026-10-25T07:59:59Z'},sun);
 assert.equal(x.state,'SOURCE_RECENT_INDICATIVE');
 assert.equal(x.tradeable,false);
 assert.equal(x.verified_live,false);
 assert.equal(SESSION_PROVENANCE_HOLD.live_order_submission_enabled,false);
 assert.equal(SESSION_PROVENANCE_HOLD.paid_entitlement_certified,false);
});
test('V293: missing, future, negative and unsupported symbols fail closed',()=>{
 const cases=[
 [{key:'bitcoin',price:70000},'SOURCE_TIME_MISSING'],
 [{key:'bitcoin',price:70000,market_time:'2026-10-25T08:00:20Z'},'SOURCE_TIME_IN_FUTURE'],
 [{key:'bitcoin',price:0,market_time:'2026-10-25T07:59:30Z'},'PRICE_INVALID'],
 [{key:'unknown',price:500,market_time:'2026-10-25T07:59:30Z'},'ASSET_NOT_SUPPORTED']
 ];
 for(const [a,expected] of cases){const r=classifyAssetSourceTime(a,sun);assert.equal(r.state,expected);assert.equal(r.verified_live,false)}
});
test('V293: public route cannot call Coinbase and UI marks BTC licensed-source HOLD',()=>{
 const api=readFileSync(new URL('../api/public-market-reference.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../src/public-market-reference.mjs',import.meta.url),'utf8');
 const license=readFileSync(new URL('../src/v293-public-btc-license.mjs',import.meta.url),'utf8');
 const separate=readFileSync(new URL('../src/v292-btc-24h-source.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(api,/api\.coinbase\.com|api\.exchange\.coinbase\.com|readOne\(PROVIDERS\.bitcoin\)/);
 assert.match(api,/bitcoin:publiclyDisplayableBitcoin\(null\)/);
 assert.match(api,/X-TFA-BTC-Display/);
 assert.match(ui,/licensed source required/);
 assert.match(license,/PUBLIC_BTC_DISPLAY_RIGHTS_VERIFIED=false/);
 assert.match(separate,/commercial_redistribution_approved:false/);
 const checkout=readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8');
 assert.match(checkout,/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
});
