import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {createAuthLifecycle,requestAuthJson,authFailureMessage,isAuthToken,AUTH_ORIGIN}
  from '../src/auth-session-lifecycle.mjs';
import {authPage,deferred,reply,fakeToken,ownerProof,freeProof,mfaProof}
  from './fixtures/auth-page-harness.mjs';

test('new login and clear invalidate and abort every older auth attempt',()=>{
  const lifecycle=createAuthLifecycle(),first=lifecycle.begin(),second=lifecycle.begin();
  assert.equal(first.signal.aborted,true);assert.equal(first.isCurrent(),false);
  assert.equal(second.isCurrent(),true);lifecycle.clear();
  assert.equal(second.signal.aborted,true);assert.equal(lifecycle.current(),null);
  assert.throws(()=>second.assertCurrent(),/session_changed/);
});
test('auth transport bounds requests and blocks redirects, cookies and foreign credential destinations',async()=>{
  const attempt=createAuthLifecycle().begin();let requests=0;
  const fetchImpl=async(url,options)=>{
    requests++;assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
    assert.equal(options.cache,'no-store');assert.ok(options.signal instanceof AbortSignal);
    return reply({ok:true});
  };
  for(const url of ['https://example.invalid/auth','http://mpcelmjiycjpdyyflisn.supabase.co/auth',
    AUTH_ORIGIN.replace('https://','https://user:password@')+'/auth'])
    await assert.rejects(requestAuthJson(url,{}, {attempt,fetchImpl}),/auth_destination_invalid/);
  await requestAuthJson(AUTH_ORIGIN+'/auth/v1/token',{}, {attempt,fetchImpl});
  assert.equal(requests,1);
});
test('hung auth transport reaches its deadline; late response body cannot survive a session clear',async()=>{
  const lifecycle=createAuthLifecycle(),attempt=lifecycle.begin();
  const request=requestAuthJson(AUTH_ORIGIN+'/auth/v1/token',{}, {attempt,timeoutMs:5,
    fetchImpl:async(_url,{signal})=>new Promise((resolve,reject)=>{
      signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
    })});
  const rejected=assert.rejects(request,{name:'TimeoutError'});
  await delay(20);await rejected;
  const body=deferred(),late=requestAuthJson(AUTH_ORIGIN+'/functions/v1/member-session',{},
    {attempt,fetchImpl:async()=>({ok:true,status:200,json:()=>body.promise})});
  await delay(0);lifecycle.clear();body.resolve(ownerProof);
  await assert.rejects(late,/session_changed/);
});
test('untrusted provider error text and malformed tokens never become access or UI messages',()=>{
  assert.equal(isAuthToken('short'),false);assert.equal(isAuthToken(fakeToken('valid')),true);
  assert.equal(isAuthToken(fakeToken('space')+'\nBearer secret'),false);
  assert.equal(isAuthToken('x'.repeat(16385)),false);
  const message=authFailureMessage(new Error('private payload <img src=x> token=secret'));
  assert.doesNotMatch(message,/secret|private payload|<img/);
  assert.match(authFailureMessage({status:429}),/Too many attempts/);
});
test('member clear while password request is pending never restores storage or starts verification',async()=>{
  const token=deferred();
  const page=authPage('member',()=>token.promise);
  const signing=page.signin();page.clear();token.resolve(reply({access_token:fakeToken('late')}));
  await signing;
  assert.equal(page.requests.length,1);assert.equal(page.requests[0].options.signal.aborted,true);
  assert.equal(page.storage.get('tfa_session'),undefined);
  assert.equal(page.get('session').classList.contains('hidden'),true);
  assert.equal(page.get('result').textContent,'Session cleared.');
});
test('member clear during entitlement response prevents stale paid/member display',async()=>{
  const proof=deferred();
  const page=authPage('member',url=>url.includes('/auth/v1/token')
    ?reply({access_token:fakeToken('pending-proof')}):proof.promise);
  const signing=page.signin();await delay(0);assert.equal(page.requests.length,2);
  page.clear();proof.resolve(reply(ownerProof));await signing;
  assert.equal(page.get('session').classList.contains('hidden'),true);
  assert.equal(page.get('access').textContent,'NOT VERIFIED');
  assert.equal(page.storage.size,0);
});
test('member duplicate click sends once; new account remains current when old login finally returns',async()=>{
  const old=deferred();let authCalls=0;
  const page=authPage('member',url=>url.includes('/auth/v1/token')
    ?(++authCalls===1?old.promise:reply({access_token:fakeToken('new-account')}))
    :reply(freeProof));
  const first=page.signin();await page.signin();assert.equal(authCalls,1);
  page.clear();await page.signin();old.resolve(reply({access_token:fakeToken('old-account')}));
  await first;assert.equal(authCalls,2);
  assert.equal(JSON.parse(page.storage.get('tfa_session')).access_token,fakeToken('new-account'));
  assert.equal(page.get('access').textContent,'LIMITED / FREE');
  assert.equal(page.get('password').value,'');
});
test('navigation aborts pending member work while preserving an already verified checkout session',async()=>{
  const page=authPage('member',url=>reply(url.includes('/auth/v1/token')
    ?{access_token:fakeToken('navigation')}:freeProof));
  await page.signin();page.events.get('pagehide')();
  assert.equal(JSON.parse(page.storage.get('tfa_session')).access_token,fakeToken('navigation'));
  assert.equal(page.requests.every(r=>r.options.signal.aborted),true);
});
test('owner rejects HTTP 200 semantic failure or bare owner flag before requesting MFA',async()=>{
  for(const proof of [{is_owner:true},{...ownerProof,ok:false},{...ownerProof,access_state:'granted'}]){
    const page=authPage('owner',url=>reply(url.includes('/auth/v1/token')
      ?{access_token:fakeToken('owner-unverified')}:proof));
    await page.signin();assert.equal(page.requests.length,2);
    assert.equal(page.get('mfa').classList.contains('hidden'),true);
    assert.equal(page.get('paperQuoteSubmit').disabled,true);
  }
});
test('owner clear during server owner proof discards late success and keeps all private controls locked',async()=>{
  const proof=deferred();
  const page=authPage('owner',url=>url.includes('/auth/v1/token')
    ?reply({access_token:fakeToken('old-owner')}):proof.promise);
  const signing=page.signin();await delay(0);page.clear();proof.resolve(reply(ownerProof));await signing;
  assert.equal(page.requests.length,2);assert.equal(page.get('paperQuoteSubmit').disabled,true);
  assert.equal(page.get('mfa').classList.contains('hidden'),true);
  assert.equal(page.get('result').textContent,'Owner session cleared on this page.');
});
test('owner MFA requires semantic success and consistent server AAL2 evidence',async()=>{
  for(const status of [{...mfaProof,ok:false,aal2:true,aal:'aal2'},
    {...mfaProof,owner:false,aal2:true,aal:'aal2'},
    {...mfaProof,aal2:true,aal:'aal1'},
    {...mfaProof,mfa_enrolled:'true',aal2:true,aal:'aal2'}]) {
    const page=authPage('owner',url=>reply(url.includes('/auth/v1/token')
      ?{access_token:fakeToken('owner-mfa')}:url.endsWith('/member-session')?ownerProof:status));
    await page.signin();assert.equal(page.get('paperQuoteSubmit').disabled,true);
    assert.equal(page.get('bridgeCreate').disabled,true);
  }
});
test('clearing owner during a single MFA verification cannot reinstall an upgraded token',async()=>{
  const upgraded=deferred();let verifies=0;
  const page=authPage('owner',(url,options)=>{
    if(url.includes('/auth/v1/token'))return reply({access_token:fakeToken('owner-aal1')});
    if(url.endsWith('/member-session'))return reply(ownerProof);
    if(JSON.parse(options.body).action==='verify'){verifies++;return upgraded.promise}
    return reply(mfaProof);
  });
  await page.signin();page.get('code').value='000000';
  const first=page.get('verify').onclick();await page.get('verify').onclick();
  assert.equal(verifies,1);page.clear();
  upgraded.resolve(reply({ok:true,verified:true,session:{access_token:fakeToken('owner-aal2')}}));
  await first;assert.equal(page.requests.length,4);
  assert.equal(page.get('code').value,'');assert.equal(page.storage.size,0);
  assert.equal(page.get('paperQuoteSubmit').disabled,true);
  assert.equal(page.get('bridgeConfig').textContent,'No bridge key has been issued in this session.');
});
