import worker from './_worker.js';
import assert from 'node:assert/strict';

const calls=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{
  const url=String(input);
  calls.push({url,init});
  if(url.includes('/auth/v1/token')){
    return new Response(JSON.stringify({access_token:'redacted-test'}),{
      status:200,
      headers:{
        'content-type':'application/json',
        'location':'https://mpcelmjiycjpdyyflisn.supabase.co/auth/v1/verify?token=x',
        'server':'upstream-test'
      }
    });
  }
  throw new Error('unexpected upstream '+url);
};

const env={ASSETS:{fetch:async req=>new Response('<!doctype html><title>asset</title>',{status:200,headers:{'content-type':'text/html'}})}};

try{
  const h=await worker.fetch(new Request('https://thefatheranalytics.com/__tfa/health'),env);
  assert.equal(h.status,200);
  const hj=await h.json();
  assert.equal(hj.ok,true);
  assert.equal(hj.gateway_version,'52.2.0');

  const authReq=new Request('https://thefatheranalytics.com/auth/v1/token?grant_type=password',{
    method:'POST',
    headers:{'content-type':'application/json','cf-ray':'test-ray'},
    body:JSON.stringify({email:'test@example.com',password:'not-a-real-secret'})
  });
  const authRes=await worker.fetch(authReq,env);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://mpcelmjiycjpdyyflisn.supabase.co/auth/v1/token?grant_type=password');
  assert.equal(authRes.headers.get('cache-control'),'no-store, max-age=0');
  assert.equal(authRes.headers.get('server'),null);
  assert.equal(authRes.headers.get('x-tfa-gateway'),'cloudflare-v52.2.0');
  assert.equal(authRes.headers.get('location'),'https://thefatheranalytics.com/auth/v1/verify?token=x');

  const member=await worker.fetch(new Request('https://thefatheranalytics.com/member'),env);
  assert.equal(member.status,200);
  assert.equal(member.headers.get('cache-control'),'no-store, max-age=0');
  const csp=member.headers.get('content-security-policy')||'';
  assert.ok(csp.includes("connect-src 'self'"));
  assert.ok(!csp.includes('mpcelmjiycjpdyyflisn.supabase.co'));

  console.log('WORKER SMOKE PASS: proxy, auth no-store, location rewrite, private cache and CSP verified.');
} finally {
  globalThis.fetch=originalFetch;
}
