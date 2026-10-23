import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const HOST='http://127.0.0.1:4173';
const EDGE='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/';
const at=new Date().toISOString();
const seen=[],unsafe=[],errors=[];
const fixtures={
 'public-final-readiness':{ok:true,generated_at:at,state:'BUILD_HOLD',
  database_incident:{active:false},hard_blockers:['runtime_baseline','billing_preflight'],
  acceptance_pending:['live_payment'],external_unknowns:['provider_rate_limit']},
 'public-auth-runtime-check':{ok:true,generated_at:at,state:'PASSWORD_AUTH_READY',
  auth_health:{ok:true},auth_settings:{email_password:true}},
 'public-billing-acceptance':{ok:true,generated_at:at,state:'READY_FOR_CONTROLLED_LIVE_TEST',
  ready_for_checkout:true,live_flow_verified:false,
  gates:{provider_plan_parity:'PASS',signed_payment_evidence:'PASS',active_entitlement_evidence:'WITHHELD'}}
};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(EDGE+'**',async route=>{
  const req=route.request(),slug=req.url().slice(EDGE.length),headers=req.headers();
  if(!Object.hasOwn(fixtures,slug)){
   unsafe.push(slug);return route.abort();
  }
  seen.push(slug);
  assert.equal(req.method(),'GET');
  assert.equal(headers.apikey,undefined,'no unsupported apikey preflight');
  assert.equal(headers.authorization,undefined,'public read cannot acquire user authority');
  assert.equal(headers.cookie,undefined,'public read cannot forward session cookies');
  return route.fulfill({status:200,contentType:'application/json',
   headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type'},
   body:JSON.stringify(fixtures[slug])});
 });
 await page.route(HOST+'/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(/autonomous-qa|ops-heartbeat|create-checkout/.test(path))unsafe.push(path);
  return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'});
 });
 assert.equal((await page.goto(HOST+'/status/',{waitUntil:'domcontentloaded'}))?.status(),200);
 await page.waitForFunction(()=>document.getElementById('billing')?.textContent?.includes('ENTITLEMENT PENDING'));
 assert.match(await page.locator('#auth').innerText(),/PASSWORD_AUTH_READY/);
 assert.equal(await page.locator('#ready').innerText(),'BUILD_HOLD');
 assert.equal(await page.locator('#launch-gate').innerText(),'LAUNCH HOLD');
 assert.match(await page.locator('#brain').innerText(),/DEFERRED/);
 assert.equal(seen.length,3);
 assert.equal((await page.goto(HOST+'/access/',{waitUntil:'domcontentloaded'}))?.status(),200);
 await page.waitForFunction(()=>document.getElementById('state')?.textContent==='READY');
 assert.equal(seen.filter(x=>x==='public-auth-runtime-check').length,2);
 assert.equal((await page.goto(HOST+'/checkout/?plan=pro',{waitUntil:'domcontentloaded'}))?.status(),200);
 assert.equal(await page.locator('#start-checkout').isDisabled(),true);
 await page.locator('#verify-checkout').click();
 assert.equal(await page.locator('#start-checkout').isDisabled(),true);
 assert.match(await page.locator('#checkout-state').innerText(),/PAYMENT HOLD/);
 assert.equal(seen.length,4,'locked checkout must not trigger network or charge requests');
 assert.deepEqual(unsafe,[]);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({name:'V260_PUBLIC_ACCEPTANCE_CONNECTION',result:'PASS',
  public_requests:seen.length,unsupported_headers:0,private_qa_requests:0,
  payment_requests:0,launch:'HOLD',trading:'OFF',capital:'0R',
  limitation:'controlled public responses; browser sign-in and paid entitlement not certified'}));
}finally{await browser.close()}
