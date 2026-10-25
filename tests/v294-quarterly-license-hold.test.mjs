import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import handler,{observeQuarterlyRanges} from '../api/public-quarterly-zones.js';
import {enforcePublicQuarterlyRights,PUBLIC_BTC_QUARTERLY_RIGHTS} from '../src/v294-public-quarterly-rights.mjs';
import {verifyQuarterlyPacket} from '../src/quarterly-liquidity-core.mjs';
const NOW=Date.parse('2026-10-25T08:20:00.000Z');
function yahooGold(){
 const timestamp=[],high=[],low=[];
 for(let t=Date.UTC(2026,6,1,12);t<=Date.UTC(2026,9,23,12);t+=86400000){
  const d=new Date(t).getUTCDay();
  if(d===0||d===6)continue;
  timestamp.push(t/1000);high.push(4070+(timestamp.length%9));low.push(3990+(timestamp.length%9));
 }
 return {chart:{error:null,result:[{
  meta:{symbol:'GC=F',exchangeName:'CMX',instrumentType:'FUTURE',
    currency:'USD',regularMarketPrice:4050,regularMarketTime:Date.UTC(2026,9,23,20)/1000,
    shortName:'Gold futures'},
  timestamp,indicators:{quote:[{high,low}]}
 }]}}};
test('V294 quarterly production reader makes exactly eight Yahoo calls and zero Coinbase reads',async()=>{
 const urls=[];
 const packet=await observeQuarterlyRanges({now:()=>NOW,read:async url=>{
  urls.push(url);if(url.includes('/GC%3DF?'))return yahooGold();
  throw Error('mocked upstream absent');
 }});
 assert.equal(urls.length,8);
 assert.equal(urls.some(x=>/coinbase/i.test(x)),false);
 assert.equal(urls.every(x=>x.startsWith('https://query1.finance.yahoo.com/v8/finance/chart/')),true);
 assert.equal(packet.ok,true);
 assert.ok(packet.assets.gold);
 assert.equal(packet.assets.bitcoin,null);
 assert.equal(packet.source_count,1);
 assert.equal(packet.expected_assets,9);
 assert.equal(packet.governance.capital_permission,'0R');
 assert.equal(packet.commercial_data_license_verified,false);
 assert.equal(packet.source_rights.bitcoin.public_quarterly_range_allowed,false);
 assert.equal(packet.source_rights.bitcoin.derived_analytics_redistribution_approved,false);
 const classified=verifyQuarterlyPacket(packet,NOW);
 assert.ok(classified.gold);
 assert.equal(classified.bitcoin,undefined);
});
test('V294 unlicensed and tampered Bitcoin range never enters public response',()=>{
 for(const input of [null,[],{bitcoin:{asset:'bitcoin',price:80000}},
  {gold:{safe:true},bitcoin:{asset:'bitcoin'},constructor:{evil:true}}]){
  const result=enforcePublicQuarterlyRights(input);
  assert.equal(result.bitcoin,null);
  assert.equal(Object.getPrototypeOf(result),Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(result,'constructor'),false);
 }
 assert.equal(Object.isFrozen(PUBLIC_BTC_QUARTERLY_RIGHTS),true);
 assert.equal(PUBLIC_BTC_QUARTERLY_RIGHTS.display_rights,'UNVERIFIED');
});
test('V294 a provider outage cannot produce synthetic quarterly BTC candles',async()=>{
 const packet=await observeQuarterlyRanges({read:async()=>{throw Error('provider down')},now:()=>NOW});
 assert.equal(packet.ok,false);
 assert.equal(packet.assets.bitcoin,null);
 assert.equal(packet.source_count,0);
 assert.equal(packet.governance.live_order_submission_enabled,false);
});
test('V294 public route is GET-only and sets explicit BTC quarterly hold header',async()=>{
 const headers={},res={setHeader(k,v){headers[k]=v;},
  status(s){this.code=s;return this},json(b){this.body=b;return this}};
 await handler({method:'POST'},res);
 assert.equal(res.code,405);
 assert.equal(headers['X-TFA-BTC-Quarterly'],'LICENSE_HOLD');
 assert.equal(res.body.governance.capital_permission,'0R');
});
test('V294 actual source and UI never claim a licensed BTC derived-range quote',()=>{
 const api=readFileSync(new URL('../api/public-quarterly-zones.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../src/quarterly-observatory.mjs',import.meta.url),'utf8');
 const view=readFileSync(new URL('../market-observatory/index.html',import.meta.url),'utf8');
 const visual=readFileSync(new URL('../src/market-observatory.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(api,/api\.exchange\.coinbase\.com|parseCoinbaseQuarterBars|sources\.push\(\{asset:'bitcoin'/);
 assert.match(api,/enforcePublicQuarterlyRights/);
 assert.match(ui,/Bitcoin quarterly ranges withheld/);
 assert.match(view,/Bitcoin spot and derived historical ranges are withheld/);
 assert.match(visual,/Bitcoin live and derived reference display withheld/);
 const checkout=readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8');
 assert.match(checkout,/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
});
