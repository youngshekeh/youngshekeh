// V284: real Chrome rendering of local production build, MOCKED account
// assertions ONLY. Never sends password to Supabase or creates an account.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const HOME='http://127.0.0.1:4173';
const EDGE='https://mpcelmjiycjpdyyflisn.supabase.co/';
const memberRoot={ok:true,version:'member-session-v12-strict-paid-term',
 user:{id:'00000000-0000-0000-0000-000000000012'},
 is_owner:false,access_state:'limited',
 subscription:{plan_id:'free',plan_name:'Free',status:'inactive',period_valid:true,current_period_end:null}};
const jwt='v284_synthetic_token_not_valid_in_any_real_system_123456';
let state='reject',tokenRequests=0,memberRequests=0,unexpected=[],errors=[];
async function previewReady(){
 for(let i=0;i<50;i++){
  try{if((await fetch(HOME+'/member/')).ok)return}catch{}
  await new Promise(r=>setTimeout(r,300));
 }
 throw Error('V284 preview did not start');
}
await previewReady();
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1160,height:850}});
 const page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 await page.route(EDGE+'**',async route=>{
  const req=route.request(),url=new URL(req.url()),slug=url.pathname.split('/').at(-1);
  const reply=body=>route.fulfill({status:200,contentType:'application/json',
   headers:{'access-control-allow-origin':'*','access-control-allow-headers':'apikey,authorization,content-type'},
   body:JSON.stringify(body)});
  if(url.pathname==='/auth/v1/token'){
   tokenRequests++;
   assert.equal(req.method(),'POST');
   assert.equal(url.searchParams.get('grant_type'),'password');
   return reply({access_token:jwt,refresh_token:'v284_fake_refresh'});
  }
  if(slug==='member-session'){
   memberRequests++;
   assert.equal(req.method(),'GET');
   assert.equal(req.headers().authorization,'Bearer '+jwt);
   if(state==='reject')return reply({ok:false,error:'member_session_not_verified'});
   if(state==='limited')return reply(memberRoot);
   if(state==='paid')return reply({...memberRoot,access_state:'granted',
    subscription:{plan_id:'pro',plan_name:'Pro',status:'active',period_valid:true,
     current_period_end:new Date(Date.now()+14*86400000).toISOString()}});
  }
  if(slug==='public-auth-runtime-check'){
   return reply({ok:true,state:'PASSWORD_AUTH_READY',
    auth_health:{ok:true},auth_settings:{email_password:true},
    provider_rate_limit:{status:'UNVERIFIED_EXTERNALLY'}});
  }
  unexpected.push({path:url.pathname,method:req.method()});
  return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'});
 });
 await page.route(HOME+'/api/**',route=>route.fulfill({
  status:503,contentType:'application/json',body:'{"ok":false}'
 }));
 assert.equal((await page.goto(HOME+'/',{waitUntil:'domcontentloaded'}))?.status(),200);
 assert.equal(await page.locator('#institutional-lens').isVisible(),true);
 await page.locator('[data-lens-horizon="quarterly"]').click();
 assert.equal(await page.locator('[data-lens-horizon="quarterly"]').getAttribute('aria-pressed'),'true');
 assert.match(await page.locator('#lens-horizon-title').innerText(),/Quarterly/);
 assert.equal(await page.locator('[data-source-row]').count(),4);
 assert.equal((await page.goto(HOME+'/access/',{waitUntil:'domcontentloaded'}))?.status(),200);
 await page.waitForFunction(()=>document.getElementById('state')?.textContent==='READY');
 assert.equal((await page.goto(HOME+'/member/',{waitUntil:'domcontentloaded'}))?.status(),200);
 assert.equal(await page.locator('#session').isHidden(),true);
 await page.locator('#signin').click();
 assert.match(await page.locator('#result').innerText(),/Email and password are required/);
 assert.equal(tokenRequests,0);
 await page.locator('#email').fill('test-user@example.invalid');
 await page.locator('#password').fill('v284-only-fake-password');
 await page.locator('#signin').click();
 await page.waitForFunction(()=>document.getElementById('result')?.textContent?.includes('AUTH REJECTED'));
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('tfa_session')),null);
 assert.equal(await page.locator('#session').isHidden(),true);
 assert.equal(tokenRequests,1);assert.equal(memberRequests,1);
 state='limited';
 await page.locator('#password').fill('v284-only-fake-password');
 await page.locator('#signin').click();
 await page.waitForFunction(()=>document.getElementById('result')?.textContent?.includes('SIGNED IN · LIMITED ACCESS'));
 assert.equal(await page.locator('#access').innerText(),'LIMITED / FREE');
 assert.match(await page.locator('#sessionDetail').innerText(),/No paid research entitlement/);
 assert.ok((await page.evaluate(()=>sessionStorage.getItem('tfa_session')))?.includes(jwt));
 state='paid';
 await page.locator('#password').fill('v284-only-fake-password');
 await page.locator('#signin').click();
 await page.waitForFunction(()=>document.getElementById('result')?.textContent?.includes('verified paid/owner access'));
 assert.equal(await page.locator('#access').innerText(),'MEMBER · PAID');
 await page.locator('#signout').click();
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('tfa_session')),null);
 assert.equal(await page.locator('#session').isHidden(),true);
 assert.equal((await page.goto(HOME+'/owner/',{waitUntil:'domcontentloaded'}))?.status(),200);
 assert.equal(await page.locator('#mfa').isHidden(),true);
 assert.equal(await page.locator('#paperQuoteIntake').isHidden(),true);
 assert.equal(await page.locator('#sandboxReceiptIntake').isHidden(),true);
 assert.equal((await page.goto(HOME+'/checkout/?plan=pro',{waitUntil:'domcontentloaded'}))?.status(),200);
 assert.equal(await page.locator('#start-checkout').isDisabled(),true);
 await page.locator('#verify-checkout').click();
 assert.equal(await page.locator('#start-checkout').isDisabled(),true);
 assert.match(await page.locator('#checkout-state').innerText(),/PAYMENT HOLD/);
 assert.deepEqual(unexpected,[],'NO browser should dispatch unknown live Supabase endpoints');
 assert.deepEqual(errors,[],'no uncaught browser exception');
 console.log('V284 CHROMIUM PASS | public institutional lens, access, rejected Auth, limited free, paid mock, session clear, locked owner/MFA and checkout');
 console.log(JSON.stringify({version:'v284-local-mocked-auth-browser-v1',
  result:'PASS',tokenRequests,memberRequests,live_supabase_users_created:0,
  real_credentials_submitted:false,real_oauth_tested:false,checkout_intents_created:0,
  private_kernel_certified:false,trading:'WAIT / 0R'}));
}finally{await browser.close()}
