// V316 read-only browser acceptance for login and commercial HOLD.
// All credentials and provider responses are synthetic test fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const ORIGIN=process.env.V315_BASE_URL||'http://127.0.0.1:4173';
const FAKE_TOKEN='test-only-never-a-real-jwt-token-1234567891011121314';
const FAKE_REFRESH='test-only-refresh-secret-must-never-persist';
const BASE='https://mpcelmjiycjpdyyflisn.supabase.co';
const limited=()=>({
  ok:true,version:'member-session-v12-strict-paid-term',
  user:{id:'10000000-2000-4000-8000-123456789012'},
  is_owner:false,access_state:'limited',
  subscription:{plan_id:'free',status:'inactive',period_valid:false,
    current_period_end:null}
});
let browser;
test.before(async()=>{browser=await chromium.launch({headless:true,args:['--no-sandbox']});});
test.after(async()=>{await browser?.close()});

async function create(target,{authentication='valid',memberResult=limited(),seedSession=false}={}){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  let tokenRequests=0, memberRequests=0, paymentPosts=0;
  if(seedSession){
    await page.addInitScript(({access,refresh})=>sessionStorage.setItem('tfa_session',
      JSON.stringify({access_token:access,refresh_token:refresh})),
      {access:FAKE_TOKEN,refresh:FAKE_REFRESH});
  }
  await page.route('**/*',async route=>{
    const r=route.request(),url=new URL(r.url());
    if(url.pathname.endsWith('/functions/v1/create-checkout')) paymentPosts++;
    if(url.origin!==BASE){await route.continue();return;}
    const headers={'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers':'authorization,apikey,content-type,accept',
      'Cache-Control':'no-store'};
    if(r.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
    if(url.pathname==='/auth/v1/token'){
      tokenRequests++;
      await route.fulfill({status:authentication==='valid'?200:401,headers,
        contentType:'application/json',body:JSON.stringify(authentication==='valid'?
          {access_token:FAKE_TOKEN,refresh_token:FAKE_REFRESH,token_type:'bearer'}:
          {error:'invalid_grant'})});
      return;
    }
    if(url.pathname==='/functions/v1/member-session'){
      memberRequests++;
      await route.fulfill({status:200,headers,contentType:'application/json',
        body:JSON.stringify(memberResult)});
      return;
    }
    await route.fulfill({status:503,headers,contentType:'application/json',
      body:JSON.stringify({ok:false,state:'UNAVAILABLE'})});
  });
  const response=await page.goto(ORIGIN+target,
    {waitUntil:'domcontentloaded',timeout:30000});
  assert.equal(response?.status(),200,'public route must render');
  return{page,context,traffic:()=>({tokenRequests,memberRequests,paymentPosts})};
}
async function attemptSignIn(page){
  await page.locator('#email').fill('fixture@example.invalid');
  await page.locator('#password').fill('synthetic-no-real-password');
  await page.locator('#signin').click();
}
test('limited member login persists only access token, clears on signout',async()=>{
  const {page,context,traffic}=await create('/member/');
  try{
    await attemptSignIn(page);
    await page.waitForFunction(()=>document.getElementById('result')?.textContent?.includes('LIMITED ACCESS'),null,{timeout:15000});
    const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tfa_session')||'{}'));
    assert.equal(saved.access_token,FAKE_TOKEN);
    assert.ok(!Object.hasOwn(saved,'refresh_token'));
    assert.ok(!JSON.stringify(saved).includes(FAKE_REFRESH));
    assert.match(await page.locator('#access').innerText(),/LIMITED/i);
    assert.equal(traffic().tokenRequests,1);
    assert.equal(traffic().memberRequests,1);
    await page.locator('#signout').click();
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('tfa_session')),null);
    assert.equal(await page.locator('#session').isVisible(),false);
  }finally{await context.close()}
});
test('bad credentials never leave a member token or authenticated state',async()=>{
  const {page,context}=await create('/member/',{authentication:'reject'});
  try{
    await attemptSignIn(page);
    await page.waitForFunction(()=>document.getElementById('result')?.textContent?.includes('AUTH REJECTED'),null,{timeout:15000});
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('tfa_session')),null);
    assert.equal(await page.locator('#session').isVisible(),false);
  }finally{await context.close()}
});
test('invalid member-session evidence cannot save a Supabase login token',async()=>{
  const {page,context}=await create('/member/',{
    memberResult:{ok:true,version:'not-the-real-contract',user:{id:'10000000-2000-4000-8000-123456789012'},
      is_owner:false,access_state:'granted'}
  });
  try{
    await attemptSignIn(page);
    await page.waitForFunction(()=>document.getElementById('result')?.textContent?.includes('AUTH REJECTED'),null,{timeout:15000});
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('tfa_session')),null);
  }finally{await context.close()}
});
test('owner cannot unlock MFA or private controls from limited member status',async()=>{
  const {page,context,traffic}=await create('/owner/');
  try{
    await attemptSignIn(page);
    await page.waitForFunction(()=>document.getElementById('result')?.textContent?.includes('OWNER ACCESS CHECK'),null,{timeout:15000});
    assert.equal(await page.locator('#mfa').isVisible(),false);
    assert.equal(await page.locator('#paperQuoteIntake').isVisible(),false);
    assert.equal(await page.locator('#liveMarketBridgeControl').isVisible(),false);
    assert.equal(traffic().memberRequests,1);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('tfa_session')),null);
  }finally{await context.close()}
});
test('forged local session cannot enable payment verification or create a checkout',async()=>{
  const {page,context,traffic}=await create('/checkout/?plan=pro',{seedSession:true});
  try{
    assert.match(await page.locator('#checkout-state').innerText(),/PAYMENT HOLD/);
    assert.equal(await page.locator('#start-checkout').isEnabled(),false);
    await page.locator('#verify-checkout').click();
    assert.match(await page.locator('#checkout-detail').innerText(),/not been confirmed|not yet available|not released/i);
    assert.equal(await page.locator('#start-checkout').isEnabled(),false);
    assert.equal(traffic().paymentPosts,0);
  }finally{await context.close()}
});
test('unknown plan stays blocked without provider interaction',async()=>{
  const {page,context,traffic}=await create('/checkout/?plan=malicious');
  try{
    assert.match(await page.locator('#checkout-state').innerText(),/PAYMENT HOLD/);
    assert.equal(await page.locator('#start-checkout').isEnabled(),false);
    assert.equal(traffic().paymentPosts,0);
  }finally{await context.close()}
});
