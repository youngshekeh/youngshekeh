// V315 public Chromium acceptance: deterministic fixtures, no credentials or trades.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const ORIGIN=process.env.V315_BASE_URL || 'http://127.0.0.1:4173';
const fakeGold=()=>({
  ok:true,reference_only:true,not_for_trade_execution:true,
  governance:{action_permitted:'WAIT',capital_permission:'0R',
    live_order_submission_enabled:false},
  assets:{
    gold:{symbol:'XAUUSD',currency:'USD',type:'INDICATIVE_SPOT',
      source:'Gold API',broker_verified:false,execution_quote:false,
      price:4321.12,source_updated_at:new Date().toISOString()},
    bitcoin:{symbol:'BTCUSD',price:80000,
      source_updated_at:new Date().toISOString()}
  }
});
const fakeMarkets=(status='STALE')=>({
  ok:true,generated_at:new Date().toISOString(),market_status:status,
  regime:{state:'DATA_GATED'},decision:{action:'WAIT',capital_permission:'0R'},
  assets:[
    {key:'gold',label:'Gold Futures',price:4999.99,market_time:new Date().toISOString(),state:'OBSERVED'},
    {key:'dxy',label:'DXY',price:105.2,market_time:new Date().toISOString(),state:'OBSERVED'},
    {key:'brent',label:'Brent',price:120.5,market_time:new Date().toISOString(),state:'OBSERVED'}
  ]
});
let browser;
test.before(async()=>{browser=await chromium.launch({headless:true,args:['--no-sandbox']});});
test.after(async()=>{await browser?.close();});
async function open(target,{viewport={width:1280,height:800},reference=null,markets=null}={}){
  const context=await browser.newContext({viewport,reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.route('**/api/**',async route=>{
    const u=new URL(route.request().url());
    let payload={ok:false,state:'UNAVAILABLE',error:'V315_TEST_ONLY_FAIL_CLOSED'};
    if(u.pathname==='/api/public-market-reference'&&reference!==null)payload=reference;
    if(u.pathname==='/api/market-feed' &&
      u.searchParams.get('feed')==='public-live-markets-api'&&markets!==null)
      payload=markets;
    try{await route.fulfill({status:200,contentType:'application/json',
      headers:{'Cache-Control':'no-store'},body:JSON.stringify(payload)});}
    catch{/* page may have navigated away */ }
  });
  const response=await page.goto(ORIGIN+target,{waitUntil:'domcontentloaded',timeout:35000});
  assert.equal(response?.status(),200,'Public route must render: '+target);
  return {page,context};
}
test('homepage with unavailable sources does not fabricate Gold or Bitcoin prices',async()=>{
  const {page,context}=await open('/');
  try{
    assert.match(await page.title(),/THE FATHER ANALYTICS/);
    await page.waitForFunction(()=>{
      const n=document.getElementById('pmr-status');
      return n?.textContent?.includes('NO FRESH REFERENCE');
    },null,{timeout:20000});
    assert.match(await page.locator('#pmr-gold').innerText(),/Unavailable/i);
    assert.match(await page.locator('#pmr-btc').innerText(),/Unavailable/i);
    assert.match(await page.locator('#pmr-btc-info').innerText(),/licensed source required/i);
  }finally{await context.close();}
});
test('fresh Gold API spot reference is labelled, never promoted to broker live',async()=>{
  const {page,context}=await open('/',{reference:fakeGold()});
  try{
    await page.waitForFunction(
      ()=>document.querySelector('#pmr-gold')?.textContent?.includes('4,321.12'),
      null,{timeout:20000});
    assert.match(await page.locator('#pmr-gold-info').innerText(),/Indicative USD/i);
    assert.match(await page.locator('#pmr-gold-info').innerText(),/Gold API/);
    assert.match(await page.locator('#pmr-btc').innerText(),/Unavailable/i);
    assert.doesNotMatch(await page.locator('#pmr-status').innerText(),/2 SOURCES RESPONDING/i);
  }finally{await context.close();}
});
test('market dashboard hides stale Gold/DXY/Brent prices, preserves WAIT/0R',async()=>{
  const {page,context}=await open('/live-markets/',{markets:fakeMarkets('STALE')});
  try{
    await page.waitForFunction(()=>document.getElementById('market-status')?.textContent?.includes('STALE')&&
      document.querySelectorAll('#asset-grid .asset-card').length===3,null,{timeout:25000});
    const cards=await page.locator('#asset-grid').innerText();
    assert.match(cards,/Gold Futures/i);
    assert.equal((cards.match(/WITHHELD/g)||[]).length,3);
    for(const value of ['4999.99','105.2','120.5'])
      assert.ok(!cards.includes(value),'Stale source price leaked: '+value);
    assert.equal((await page.locator('#gold-action').innerText()).trim(),'WAIT');
    assert.equal((await page.locator('#gold-capital').innerText()).trim(),'0R');
  }finally{await context.close();}
});
test('closed market cannot be mislabeled as an open trading session',async()=>{
  const {page,context}=await open('/live-markets/',{markets:fakeMarkets('MARKET_CLOSED')});
  try{
    await page.waitForFunction(
      ()=>document.getElementById('market-status')?.textContent?.includes('MARKET_CLOSED'),
      null,{timeout:25000});
    assert.match(await page.locator('#asset-grid').innerText(),/MARKET_CLOSED/);
    assert.equal((await page.locator('#gold-action').innerText()).trim(),'WAIT');
    assert.equal((await page.locator('#gold-capital').innerText()).trim(),'0R');
  }finally{await context.close();}
});
test('public mobile layout has no critical horizontal overflow',async()=>{
  for(const path of ['/','/live-markets/']){
    const {page,context}=await open(path,{viewport:{width:390,height:844}});
    try{
      await page.waitForTimeout(800);
      const dims=await page.evaluate(()=>({
        inner:window.innerWidth,
        doc:document.documentElement.scrollWidth,
        body:document.body.scrollWidth
      }));
      assert.ok(dims.doc<=dims.inner+4,path+' mobile overflow: '+JSON.stringify(dims));
    }finally{await context.close();}
  }
});
