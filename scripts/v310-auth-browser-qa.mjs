// Chromium against a LOCAL production build and synthetic, intercepted Auth.
// These assertions never certify a real production account or provider login.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const HOME='http://127.0.0.1:4173';
const EDGE='https://mpcelmjiycjpdyyflisn.supabase.co';
const token='v310_synthetic_only_not_a_real_access_token_123456789';
const owner={ok:true,version:'member-session-v12-strict-paid-term',
  user:{id:'00000000-0000-0000-0000-000000000012'},is_owner:true,access_state:'owner'};
const free={...owner,is_owner:false,access_state:'limited'};
let mode='member-rejected',requests=[],unexpected=[],errors=[],releasePending=null;
for(let i=0;i<50;i++){
  try{if((await fetch(HOME+'/member/')).ok)break}catch{}
  if(i===49)throw Error('V310 local preview unavailable');
  await new Promise(r=>setTimeout(r,300));
}
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
    if(new URL(route.request().url()).origin===HOME)return route.continue();
    unexpected.push(new URL(route.request().url()).pathname);return route.abort();
  });
  await page.route(EDGE+'/**',async route=>{
    const req=route.request(),url=new URL(req.url());
    requests.push({path:url.pathname,method:req.method()});
    const reply=async(data,status=200)=>{
      try{await route.fulfill({status,contentType:'application/json',
        headers:{'access-control-allow-origin':'*','access-control-allow-headers':'apikey,authorization,content-type'},
        body:JSON.stringify(data)})}catch{
        // A browser request intentionally cancelled by clear-session has no consumer.
      }
    };
    if(url.pathname==='/auth/v1/token'){
      assert.equal(req.method(),'POST');assert.equal(url.searchParams.get('grant_type'),'password');
      if(mode==='member-delayed-token'){
        await new Promise(r=>{releasePending=r});return reply({access_token:token});
      }
      return reply({access_token:token});
    }
    if(url.pathname==='/functions/v1/member-session'){
      assert.equal(req.headers().authorization,'Bearer '+token);
      if(mode==='member-delayed-proof'){
        await new Promise(r=>{releasePending=r});return reply(free);
      }
      return reply(mode.startsWith('member')?(mode==='member-rejected'?{ok:false}:free):
        mode==='owner-invalid-proof'?{...owner,ok:false}:owner);
    }
    if(url.pathname==='/functions/v1/owner-mfa-actions'){
      assert.equal(req.headers().authorization,'Bearer '+token);
      const input=req.postDataJSON();
      if(input.action==='verify'){
        assert.equal(mode,'owner-delayed-mfa');
        await new Promise(r=>{releasePending=r});
        return reply({ok:true,verified:true,session:{access_token:token+'_upgraded'}});
      }
      return reply({ok:true,owner:true,mfa_enrolled:true,aal:'aal1',
        aal2:mode==='owner-inconsistent-mfa',factors:[{id:'synthetic-factor'}]});
    }
    unexpected.push(url.pathname);return reply({ok:false},503);
  });
  const login=async()=>{
    await page.locator('#email').fill('fixture@example.invalid');
    await page.locator('#password').fill('synthetic-password-only');
    await page.locator('#signin').click();
  };
  const pending=async()=>{
    await page.waitForFunction(()=>document.getElementById('signin')?.disabled===true);
    for(let i=0;i<100&&!releasePending;i++)await new Promise(r=>setTimeout(r,20));
    assert.ok(releasePending,'intercepted auth request was actually reached');
  };
  await page.goto(HOME+'/member/',{waitUntil:'domcontentloaded'});
  assert.equal(await page.getByLabel('Email',{exact:true}).count(),1);
  assert.equal(await page.getByLabel('Password',{exact:true}).count(),1);
  await login();
  await page.waitForFunction(()=>document.getElementById('result')?.textContent?.includes('AUTH REJECTED'));
  assert.equal(await page.locator('#password').inputValue(),'');
  for(const delayed of ['member-delayed-token','member-delayed-proof']){
    mode=delayed;releasePending=null;const before=requests.length;
    await login();await pending();
    assert.equal(await page.locator('#signin').isDisabled(),true);
    await page.locator('#signout').click();releasePending();
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('tfa_session')),null);
    assert.equal(await page.locator('#session').isHidden(),true);
    assert.equal(await page.locator('#result').innerText(),'Session cleared.');
    assert.equal(requests.length-before,delayed==='member-delayed-token'?1:2);
  }
  mode='member-free';await login();
  await page.waitForFunction(()=>document.getElementById('access')?.textContent==='LIMITED / FREE');
  assert.ok(await page.evaluate(()=>sessionStorage.getItem('tfa_session')));
  // Member navigation must retain its verified token for checkout verification.
  await page.goto(HOME+'/owner/',{waitUntil:'domcontentloaded'});
  assert.ok(await page.evaluate(()=>sessionStorage.getItem('tfa_session')));
  mode='owner-invalid-proof';let before=requests.length;await login();
  await page.waitForFunction(()=>document.getElementById('result')?.textContent?.includes('OWNER ACCESS CHECK'));
  assert.equal(requests.length-before,2);assert.equal(await page.locator('#mfa').isHidden(),true);
  mode='owner-inconsistent-mfa';await login();
  await page.waitForFunction(()=>document.getElementById('mfaState')?.textContent==='MFA REQUIRED');
  assert.equal(await page.locator('#paperQuoteIntake').isHidden(),true);
  await page.locator('#signout').click();
  mode='owner-delayed-mfa';await login();
  await page.waitForFunction(()=>document.getElementById('mfaState')?.textContent==='MFA REQUIRED');
  await page.locator('#code').fill('000000');releasePending=null;before=requests.length;
  await page.locator('#verify').click();
  for(let i=0;i<100&&!releasePending;i++)await new Promise(r=>setTimeout(r,20));
  assert.ok(releasePending);assert.equal(await page.locator('#verify').isDisabled(),true);
  await page.locator('#signout').click();releasePending();await page.waitForTimeout(120);
  assert.equal(requests.length-before,1);
  for(const id of ['mfa','paperQuoteIntake','sandboxReceiptIntake','bridgeControl','liveMarketBridgeControl'])
    assert.equal(await page.locator('#'+id).isHidden(),true,id+' remains locked');
  assert.equal(await page.locator('#result').innerText(),'Owner session cleared on this page.');
  assert.equal(await page.locator('#code').inputValue(),'');
  assert.equal(await page.locator('#signin').isDisabled(),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({version:'v310-local-intercepted-auth-chromium',result:'PASS',
    scenarios:['member semantic denial','cancel password','cancel member proof','member navigation',
      'owner semantic denial','contradictory MFA','cancel MFA','mobile labels and layout'],
    live_credentials_submitted:false,production_auth_certified:false,commercial_launch_certified:false,
    trading:'WAIT / 0R'}));
}finally{releasePending?.();await browser.close()}
