// V256: actual Chromium DOM/browser-level Observatory acceptance test.
// Endpoints and quotes below are fixture-only, never sent to production.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {QUARTER_ASSETS,quarterBounds,quarterlyPacket} from '../src/quarterly-liquidity-core.mjs';

const ORIGIN='http://127.0.0.1:4173';
const now=Date.now(),bounds=quarterBounds(now);
const safety=Object.freeze({action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false});
const zoneFixtures={};
for(const [asset,c] of Object.entries(QUARTER_ASSETS)){
 const low=asset==='bitcoin'?60000:90,high=asset==='bitcoin'?100000:110;
 const width=(high-low)*.02;
 zoneFixtures[asset]={
  asset,label:c.label,symbol:c.symbol,unit:c.unit,exchange:c.exchange,instrument_type:c.kind,
  source:asset==='bitcoin'?'Coinbase Exchange':'Yahoo Finance',
  source_last_daily_bar:new Date().toISOString().slice(0,10),
  quote:asset==='bitcoin'?null:{value:101,at:new Date(now-20000).toISOString(),time_type:'provider_market'},
  previous_quarter:bounds.previous_label,current_quarter:bounds.current_label,
  previous_start:bounds.previous_start,previous_end_exclusive:bounds.previous_end,
  sample_days_prev:62,sample_days_qtd:14,previous_low:low,previous_high:high,
  previous_midpoint:(high+low)/2,buy_side_proxy:[high-width,high],
  sell_side_proxy:[low,low+width],current_qtd_low:low+2,current_qtd_high:high-2,
  zone_method:'PRIOR_COMPLETED_QUARTER_OHLC_RANGE_2PCT_INNER_BANDS',
  is_actual_orderbook_liquidity:false,probability:null,
  source_rights:'COMMERCIAL_REDISTRIBUTION_NOT_VERIFIED',
  contract_label:c.kind==='FUTURE'?'Fixture front-month futures':null,
  governance:safety
 };
}
const quarterly=quarterlyPacket(zoneFixtures,Date.now());
const stampA=new Date(Date.now()-11000).toISOString();
let stampB=null,btcStage=0,requests={quarterly:0,spot:0,macro:0};
function spotPacket(){
 const next=btcStage===1;
 return {ok:true,reference_only:true,not_for_trade_execution:true,
  governance:safety,assets:{
   gold:{symbol:'XAUUSD',name:'Gold spot',price:4050,currency:'USD',
    type:'INDICATIVE_SPOT',source:'Gold API',source_updated_at:new Date(Date.now()-1000).toISOString(),
    broker_verified:false,execution_quote:false},
   bitcoin:{symbol:'BTCUSD',name:'Bitcoin spot',price:next?99700:81000,currency:'USD',
    type:'SPOT_RECEIPT_NOT_SOURCE_TIMESTAMPED',source:'Coinbase',source_updated_at:null,
    observed_at:next?stampB:stampA,broker_verified:false,execution_quote:false}
 }};
}
function macroPacket(){
 const assets={};
 for(const [name,symbol,exchange,kind] of [['wti','CL=F','NYM','FUTURE'],['dxy','DXY','NYB','INDEX']]){
  assets[name]={symbol,provider_symbol:name==='wti'?'CL=F':'DX-Y.NYB',name,
   price:101,currency:'USD',instrument_type:kind,source:'Yahoo Finance',
   type:'DELAYED_INDICATIVE_MARKET_REFERENCE',exchange,
   source_updated_at:new Date(now-20000).toISOString(),
   contract_label:name==='wti'?'Crude Oil Dec 26':null,
   possible_exchange_delay_minutes:30,
   broker_verified:false,execution_quote:false,licensed_commercial_feed_verified:false};
 }
 return {ok:true,reference_only:true,not_for_trade_execution:true,
  data_rights:'RESEARCH_EVALUATION_ONLY_COMMERCIAL_LICENSE_NOT_VERIFIED',
  assets,governance:safety};
}
async function ready(){
 for(let i=0;i<40;i++){
  try{const r=await fetch(ORIGIN+'/market-observatory/');if(r.ok)return;}
  catch{}
  await new Promise(resolve=>setTimeout(resolve,300));
 }
 throw new Error('vite_preview_not_ready');
}
await ready();
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({permissions:['notifications']});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  window.__v256NotificationLog=[];
  window.__v256PermissionCalls=0;
  class FakeNotification{
   static permission='default';
   static async requestPermission(){window.__v256PermissionCalls++;return 'granted'}
   constructor(title,options){window.__v256NotificationLog.push({title,body:options?.body,tag:options?.tag})}
  }
  Object.defineProperty(window,'Notification',{configurable:true,value:FakeNotification});
 });
 await page.route('**/api/public-quarterly-zones',async route=>{
  requests.quarterly++;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(quarterly)});
 });
 await page.route('**/api/public-market-reference',async route=>{
  requests.spot++;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(spotPacket())});
 });
 await page.route('**/api/public-macro-reference',async route=>{
  requests.macro++;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(macroPacket())});
 });
 const response=await page.goto(ORIGIN+'/market-observatory/',{waitUntil:'domcontentloaded'});
 assert.equal(response?.status(),200);
 await page.locator('[data-quarter-cards] .ob-quarter-card').first().waitFor();
 await page.waitForFunction(()=>document.querySelector('[data-quarter-cards]')?.querySelectorAll('.ob-quarter-card').length===9);
 await page.waitForFunction(()=>document.querySelector('[data-quarter-feed-spot]')?.textContent?.includes('2/2'));
 await page.waitForFunction(()=>document.querySelector('[data-quarter-feed-macro]')?.textContent?.includes('2/2'));
 await page.waitForFunction(()=>document.querySelector('[data-quarter-status]')?.textContent?.includes('9 / 9'));
 assert.equal(await page.locator('[data-quarter-events] li').count(),0,'no alert at first paint');
 assert.ok((await page.locator('#quarter-zones').innerText()).includes('Gold COMEX futures'));
 assert.ok((await page.locator('#quarter-zones').innerText()).includes('WTI futures'));
 assert.ok((await page.locator('#quarter-zones').innerText()).includes('U.S. Dollar Index'));
 assert.equal(requests.quarterly>=1,true);
 assert.equal(requests.spot>=1,true);
 assert.equal(requests.macro>=1,true);
 await page.locator('[data-quarter-arm]').click();
 assert.equal(await page.locator('[data-quarter-events] li').count(),0,'arming must not replay existing levels');
 await page.locator('[data-quarter-permission]').click();
 assert.equal(await page.evaluate(()=>window.__v256PermissionCalls),1);
 stampB=new Date(Date.now()-1000).toISOString();
 btcStage=1;
 await page.locator('[data-quarter-refresh]').click();
 await page.waitForFunction(()=>document.querySelector('[data-quarter-events]')?.querySelectorAll('li').length===1);
 const eventText=await page.locator('[data-quarter-events] li').first().innerText();
 assert.match(eventText,/Bitcoin spot/i);
 assert.match(eventText,/AT PREVIOUS Q HIGH ZONE/);
 assert.match(eventText,/Coinbase/i);
 const logs=await page.evaluate(()=>window.__v256NotificationLog);
 assert.equal(logs.length,1,'one requested notification delivered to constructor');
 assert.match(logs[0].title,/QUARTERLY WATCH/);
 assert.match(logs[0].body,/Bitcoin spot/);
 await page.locator('[data-quarter-refresh]').click();
 await page.waitForTimeout(350);
 assert.equal(await page.locator('[data-quarter-events] li').count(),1,'same vendor timestamp must not duplicate alert');
 assert.equal((await page.evaluate(()=>window.__v256NotificationLog)).length,1);
 await page.locator('[data-quarter-arm]').click();
 assert.match(await page.locator('[data-quarter-alert-status]').innerText(),/OFF/);
 assert.equal(await page.locator('[data-quarter-events] li').count(),1);
 assert.ok((await page.locator('.ob-permission').innerText()).includes('0R'));
 assert.deepEqual(errors,[],'no uncaught frontend JS exceptions');
 console.log(JSON.stringify({test:'V256_REAL_CHROMIUM_BROWSER_QA',result:'PASS',
  cards:9,feed_requests:requests,alert_records:1,
  browser_notification_constructor_calls:logs.length,
  notification_permission_requests:1,trading:'WAIT / 0R',
  limitations:'mocked API responses and Notification constructor; not an OS push receipt'}));
}finally{
 await browser.close();
}
