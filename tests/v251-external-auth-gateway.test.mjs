import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectAuthGateway,summarizeAuthGateway} from '../src/auth-gateway-observability.mjs';
const KEY='sb_publishable_public-test-key';
const now='2026-10-23T13:48:00.000Z';
const mock=(h,s,body={external:{email:true,google:true}})=>async url=>{
 if(url.endsWith('/health'))return{ok:h>=200&&h<300,status:h,json:async()=>({status:'ok'})};
 return{ok:s>=200&&s<300,status:s,json:async()=>body};
};
test('two successful real HTTP observations report reachability, NEVER sign-in or commercial certification',async()=>{
 const r=await collectAuthGateway({fetcher:mock(200,200),key:KEY,now:()=>now});
 assert.equal(r.ok,true);
 assert.equal(r.generated_at,now);
 assert.equal(r.state,'AUTH_ENDPOINTS_RESPONDING');
 assert.equal(r.truth.auth_endpoint_reachable,true);
 assert.equal(r.advertised_providers.email,'ENABLED_REPORTED');
 assert.equal(r.truth.browser_sign_in_verified,false);
 assert.equal(r.truth.database_incident_resolved,false);
 assert.equal(r.truth.commercial_launch_certified,false);
 assert.equal(r.governance.capital_permission,'0R');
 assert.equal(r.governance.live_order_submission_enabled,false);
});
test('unauthorized 401 and 503 upstream cannot fabricate a ready login',async()=>{
 const r=await collectAuthGateway({fetcher:mock(401,503),key:KEY,now:()=>now});
 assert.equal(r.state,'AUTH_ENDPOINTS_UNAVAILABLE');
 assert.equal(r.checks.health.status,401);
 assert.equal(r.checks.settings.status,503);
 assert.equal(r.advertised_providers.email,'UNVERIFIED');
 assert.equal(r.truth.browser_sign_in_verified,false);
});
test('one reachable endpoint does not misrepresent complete auth reachability',async()=>{
 let r=await collectAuthGateway({fetcher:mock(200,503),key:KEY,now:()=>now});
 assert.equal(r.state,'AUTH_HEALTH_ONLY');
 assert.equal(r.truth.auth_endpoint_reachable,false);
 r=await collectAuthGateway({fetcher:mock(503,200),key:KEY,now:()=>now});
 assert.equal(r.state,'AUTH_SETTINGS_ONLY');
 assert.equal(r.truth.auth_endpoint_reachable,false);
});
test('timeout and network failures preserve diagnostic distinction',async()=>{
 const t=await collectAuthGateway({fetcher:async()=>{throw Object.assign(new Error('timeout'),{name:'TimeoutError'})},key:KEY,now:()=>now});
 assert.equal(t.checks.health.transport,'TIMEOUT');
 assert.equal(t.state,'AUTH_ENDPOINTS_UNAVAILABLE');
 const e=await collectAuthGateway({fetcher:async()=>{throw Error('ECONNRESET')},key:KEY,now:()=>now});
 assert.equal(e.checks.settings.transport,'NETWORK_ERROR');
});
test('raw upstream settings, OAuth details and auth secrets never enter output',async()=>{
 const r=await collectAuthGateway({fetcher:mock(200,200,{
  external:{email:true,google:true,other_provider_secret:'do-not-display'},
  smtp_pass:'secret',mailer_autoconfirm:false
 }),key:KEY,now:()=>now});
 assert.doesNotMatch(JSON.stringify(r),/secret|smtp_pass|autoconfirm/i);
});
test('only the fixed endpoint URLs with a public publishable key are allowed',async()=>{
 const visits=[];
 await collectAuthGateway({fetcher:async(url,args)=>{
  visits.push({url,method:args.method,headers:args.headers,redirect:args.redirect});
  return{ok:true,status:200,json:async()=>({external:{email:false}})}
 },key:KEY,now:()=>now});
 assert.deepEqual(visits.map(x=>x.url).sort(),[
  'https://mpcelmjiycjpdyyflisn.supabase.co/auth/v1/health',
  'https://mpcelmjiycjpdyyflisn.supabase.co/auth/v1/settings'
 ]);
 for(const item of visits){assert.equal(item.method,'GET');assert.equal(item.headers.apikey,KEY);assert.equal(item.redirect,'error')}
 await assert.rejects(()=>collectAuthGateway({fetcher:mock(200,200),key:'service_role-secret'}),/public_publishable_key_required/);
 await assert.rejects(()=>collectAuthGateway({fetcher:mock(200,200),key:KEY,base:'https://malicious.example'}),/fixed_supabase_origin_required/);
});
test('missing/invalid observations never certify commerce or private runtime',()=>{
 const r=summarizeAuthGateway({ok:true,status:0},{ok:true,status:200,body:{}},{observedAt:now});
 assert.equal(r.truth.browser_sign_in_verified,false);
 assert.equal(r.truth.signup_verified,false);
 assert.equal(r.truth.private_auth_entitlement_verified,false);
 assert.equal(r.truth.billing_verified,false);
 assert.equal(r.checks.health.ok,false);
 assert.equal(r.state,'AUTH_SETTINGS_ONLY');
});
test('new server route is bounded, cache protected, GET only and separate from launch evaluator',()=>{
 const api=readFileSync(new URL('../api/public-auth-gateway.js',import.meta.url),'utf8');
 const src=readFileSync(new URL('../src/auth-gateway-observability.mjs',import.meta.url),'utf8');
 assert.match(api,/CACHE_TTL_MS=60000/);
 assert.match(api,/req\.method!=='GET'/);
 assert.match(api,/X-TFA-Auth-Probe/);
 assert.match(src,/AbortSignal\.timeout\(deadlineMs\)/);
 assert.doesNotMatch(api+src,/SUPABASE_SERVICE_ROLE|SUPABASE_DB_URL|cron\.schedule|cron\.alter_job|place_order|create_subscription/i);
});
