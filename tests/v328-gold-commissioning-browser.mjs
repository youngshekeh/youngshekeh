// V328 real Chromium UI acceptance. Fully synthetic broker evidence.
// Browser receives no live broker quote/account, owner token or provider key.
import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const ORIGIN=process.env.V315_BASE_URL || 'http://127.0.0.1:4173';
const ENDPOINT='**/functions/v1/public-gold-bridge-readiness-v195';
const fake=(legacy=false)=>{
 const data={
   ok:true,
   version:legacy?'v195-gold-bridge-readiness-v1':
     'v326-gold-bridge-first-tick-truth-review',
   state:'BROKER_LIVE',
   gates:{
    bridge_enrolled:{pass:true,count:1},
    bridge_authenticated:{pass:true},
    first_tick_received:{
      pass:true,observed_at:new Date().toISOString(),
      proof:legacy?'BRIDGE_CREDENTIAL_USE':'PERSISTED_TICK_NOT_CREDENTIAL_USE'
    },
    quote_fresh:{pass:true},
    broker_live:{pass:true}
   },
   public_counts:{active_bridges:1},
   governance:{automatic_execution:false,machine_execution_allowed:false,
     live_order_submission_enabled:false,capital_permission:'0R'}
 };
 // Private broker/owner details must never render even if old backend
 // sends unsafe values in JSON.
 data.live_market={mid:9999.99,bid:9998.88,
   account_number:'12345678',owner_id:'private-fixture-id'};
 return data;
};
let browser;
test.before(async()=>{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
});
test.after(async()=>{await browser?.close();});
async function open(data,width=1280){
 const context=await browser.newContext({
  viewport:{width,height:850},reducedMotion:'reduce'
 });
 const page=await context.newPage();
 // Existing Gold page has many other read-only data fetches; isolate them.
 await page.route('**/functions/v1/**',async route=>{
  await route.fulfill({
    status:503,contentType:'application/json',
    body:'{"ok":false,"state":"UNAVAILABLE"}'
  });
 });
 await page.route(ENDPOINT,async route=>{
  await route.fulfill({
    status:data===null?503:200,
    contentType:'application/json',
    headers:{'Cache-Control':'no-store'},
    body:JSON.stringify(data===null?{ok:false,error:'NO_UPSTREAM'}:data)
  });
 });
 await page.route('**/api/**',async route=>{
  await route.fulfill({
    status:503,contentType:'application/json',
    body:'{"ok":false,"state":"UNAVAILABLE"}'
  });
 });
 const response=await page.goto(ORIGIN+'/gold-live/',{
  waitUntil:'domcontentloaded',timeout:35000});
 assert.equal(response?.status(),200);
 await page.waitForSelector('#v328-broker-commissioning',{timeout:20000});
 const tab=page.getByRole('tab',{name:/Broker data/i});
 await tab.click();
 return {page,context};
}
test('legacy v195 backend cannot fake accepted tick or leak broker identity',async()=>{
 const {page,context}=await open(fake(true));
 try{
  await page.waitForFunction(()=>
   document.querySelector('#v328-broker-commissioning .bc-state')
     ?.textContent==='Waiting for verified receiver evidence',
   null,{timeout:10000});
  const desk=await page.locator('#v328-broker-commissioning').innerText();
  assert.match(desk,/Waiting for verified receiver evidence/);
  assert.match(desk,/NOT VERIFIED/);
  assert.match(desk,/EXECUTION LOCKED/);
  assert.match(desk,/WAIT \/ 0R/);
  for(const privateText of ['9999.99','9998.88','12345678',
    'private-fixture-id'])
   assert.ok(!desk.includes(privateText),'Broker secret/price leaked');
 }finally{await context.close();}
});
test('confirmed persisted read-only quote shows data milestone but NEVER trade permission',async()=>{
 const {page,context}=await open(fake(false));
 try{
  await page.waitForFunction(()=>
   document.querySelector('#v328-broker-commissioning .bc-state')
     ?.textContent==='Read-only broker feed observed',
   null,{timeout:10000});
  const area=page.locator('#v328-broker-commissioning');
  assert.match(await area.innerText(),/RESEARCH-ONLY DATA/);
  assert.match(await area.innerText(),/EXECUTION LOCKED/);
  assert.match(await area.innerText(),/WAIT \/ 0R/);
  assert.match(await area.innerText(),/market-data licensing/i);
  assert.equal(await area.locator('.bc-step[data-state="done"]').count(),4);
  assert.ok(!(await area.innerText()).includes('9999.99'));
  assert.equal(await area.getByRole('button',{name:'Refresh evidence'}).isEnabled(),true);
  const runbook=area.getByRole('link',{name:/Windows MT5 setup guide/});
  assert.match(await runbook.getAttribute('href'),/^https:\/\/github\.com\/youngshekeh\//);
  assert.equal(await runbook.getAttribute('rel'),'noopener noreferrer');
 }finally{await context.close();}
});
test('mobile unavailable broker data is honest and navigation has no overflow',async()=>{
 const {page,context}=await open(null,390);
 try{
  await page.waitForFunction(()=>
   document.querySelector('#v328-broker-commissioning .bc-state')
     ?.textContent==='Evidence unavailable',
   null,{timeout:12000});
  const model=await page.locator('#v328-broker-commissioning').innerText();
  assert.match(model,/NOT TRADE-READY/);
  assert.match(model,/WAIT \/ 0R/);
  const widths=await page.evaluate(()=>({
   inner:innerWidth,
   doc:document.documentElement.scrollWidth,
   console:document.getElementById('v328-broker-commissioning')
     .getBoundingClientRect().width
  }));
  assert.ok(widths.doc<=widths.inner+5,
    'mobile layout overflow: '+JSON.stringify(widths));
  assert.ok(widths.console>200);
 }finally{await context.close();}
});
