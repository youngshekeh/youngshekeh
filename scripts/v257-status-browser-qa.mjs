// V257 real Chromium status-page acceptance. Public market fixtures, never real prices.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {QUARTER_ASSETS,quarterBounds,quarterlyPacket} from '../src/quarterly-liquidity-core.mjs';
import {curatePublicReferences} from '../src/public-market-reference-data.mjs';
import {curateMacroPacket} from '../src/public-macro-reference-data.mjs';

const HOST='http://127.0.0.1:4173';
const now=Date.now(),q=quarterBounds(now),at=n=>new Date(n).toISOString();
const G={action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false};
const zones={};
for(const [asset,c] of Object.entries(QUARTER_ASSETS)){
 zones[asset]={
  asset,label:c.label,symbol:c.symbol,exchange:c.exchange,
  previous_quarter:q.previous_label,current_quarter:q.current_label,
  previous_start:q.previous_start,previous_low:90,previous_high:110,
  buy_side_proxy:[109.6,110],sell_side_proxy:[90,90.4],
  source_last_daily_bar:at(now).slice(0,10),
  zone_method:'PRIOR_COMPLETED_QUARTER_OHLC_RANGE_2PCT_INNER_BANDS',
  source_rights:'COMMERCIAL_REDISTRIBUTION_NOT_VERIFIED',
  is_actual_orderbook_liquidity:false,governance:G
 };
}
const quarter=quarterlyPacket(zones,now);
// A fixture receipt must begin at response delivery, as a real API receipt
// does; browser startup time is not the age of an unserved observation.
const spot=()=>curatePublicReferences({
 gold:{symbol:'XAUUSD',currency:'USD',type:'INDICATIVE_SPOT',
  source:'Gold API',price:4000,source_updated_at:at(Date.now()-4000),
  broker_verified:false,execution_quote:false},
 bitcoin:{symbol:'BTCUSD',currency:'USD',type:'SPOT_RECEIPT_NOT_SOURCE_TIMESTAMPED',
  source:'Coinbase',price:80000,source_updated_at:null,observed_at:at(Date.now()-3000),
  broker_verified:false,execution_quote:false}
},Date.now());
function macro(){
 const mk=id=>({
  symbol:id==='wti'?'CL=F':'DXY',
  provider_symbol:id==='wti'?'CL=F':'DX-Y.NYB',
  source:'Yahoo Finance',type:'DELAYED_INDICATIVE_MARKET_REFERENCE',
  exchange:id==='wti'?'NYM':'NYB',instrument_type:id==='wti'?'FUTURE':'INDEX',
  currency:'USD',price:101,source_updated_at:at(now-3*60*1000),
  possible_exchange_delay_minutes:30,broker_verified:false,
  execution_quote:false,licensed_commercial_feed_verified:false,
  contract_label:id==='wti'?'Crude Oil Dec 26':null
 });
 return curateMacroPacket({wti:mk('wti'),dxy:mk('dxy')},now);
}
let macroUnavailable=false,requestCount={spot:0,macro:0,quarterly:0,private:0};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();const errors=[];
 page.on('pageerror',error=>errors.push(error.stack||error.message));
 await page.route('**/api/public-market-reference',async route=>{
  requestCount.spot++;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(spot())});
 });
 await page.route('**/api/public-macro-reference',async route=>{
  requestCount.macro++;
  await route.fulfill(macroUnavailable
   ?{status:503,contentType:'application/json',body:'{"ok":false}'}
   :{status:200,contentType:'application/json',body:JSON.stringify(macro())});
 });
 await page.route('**/api/public-quarterly-zones',async route=>{
  requestCount.quarterly++;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(quarter)});
 });
 await page.route('**/functions/v1/**',async route=>{
  requestCount.private++;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   ok:true,generated_at:at(now),state:'BUILD_HOLD',
   database_incident:{active:true,code:'POSTGREST_RUNTIME_UNAVAILABLE'},
   hard_blockers:['database_incident','auth_runtime','billing_preflight'],
   acceptance_pending:[],external_unknowns:[]
  })});
 });
 await page.route('**/api/public-gold-read',async route=>route.fulfill({
  status:503,contentType:'application/json',body:'{"ok":false,"reason":"BROKER_UNVERIFIED"}'
 }));
 const resp=await page.goto(HOST+'/status/',{waitUntil:'domcontentloaded'});
 assert.equal(resp?.status(),200);
 await page.waitForTimeout(1100);
 console.log('V257_TRACE',JSON.stringify({
  macro:await page.locator('#public-macro').innerText(),
  quarterly:await page.locator('#public-quarterly').innerText(),
  spot:await page.locator('#public-reference').innerText(),
  gate:await page.locator('#launch-gate').innerText(),
  macroProof:await page.locator('#public-macro-proof').innerText(),
  requests:requestCount,errors
 }));
 await page.waitForFunction(()=>document.querySelector('#public-macro')?.textContent?.includes('2/2'),null,{timeout:8000});
 await page.waitForFunction(()=>document.querySelector('#public-quarterly')?.textContent?.includes('9/9'));
 await page.waitForFunction(()=>document.querySelector('#public-reference')?.textContent?.includes('TWO CURRENT SOURCES'));
 await page.waitForFunction(()=>document.querySelector('#launch-gate')?.textContent?.includes('HOLD'));
 const initial={
  macro:await page.locator('#public-macro').innerText(),
  quarterly:await page.locator('#public-quarterly').innerText(),
  private:await page.locator('#launch-gate').innerText(),
  oilProof:await page.locator('#public-macro-proof').innerText()
 };
 assert.match(initial.oilProof,/market time valid/i);
 assert.match(initial.oilProof,/No broker certification/);
 assert.equal(initial.private,'LAUNCH HOLD');
 assert.equal(await page.locator('#public-quarterly').getAttribute('class'),'value good');
 assert.equal(await page.locator('#public-macro').getAttribute('class'),'value good');
 macroUnavailable=true;
 await page.locator('#status-refresh').click();
 await page.waitForFunction(()=>document.querySelector('#public-macro')?.textContent==='SOURCE UNAVAILABLE');
 assert.match(await page.locator('#public-quarterly').innerText(),/9\/9/);
 assert.equal(await page.locator('#public-macro').getAttribute('class'),'value wait');
 assert.match(await page.locator('#launch-gate').innerText(),/HOLD/);
 assert.ok(requestCount.macro>=2);
 assert.ok(requestCount.quarterly>=2);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({test:'V257_CHROME_STATUS_MARKET_COVERAGE',
  result:'PASS',assets:9,macro_count_initial:2,macro_outage_safely_degraded:true,
  private_launch:'HOLD',trading:'WAIT / 0R',requests:requestCount,
  limitation:'all source and private responses mocked; no production endpoint certification'}));
}finally{await browser.close()}
