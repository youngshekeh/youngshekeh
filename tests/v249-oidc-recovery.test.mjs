import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyOidcError,verifyOidcProbeWithBoundedRetry,selectVercelSigningKey}
 from '../supabase/functions/runtime-v115-oidc-probe/v249-oidc-policy.mjs';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
test('JWKS network outage is different from an invalid JWT and remains unverified',()=>{
 for(const error of ['jwks_unavailable','jwks_transport_timeout','jwks_bad_response']){
  const verdict=classifyOidcError(Error(error));
  assert.deepEqual(verdict,{state:'AUTH_VERIFIER_UNAVAILABLE',status:503,
    reason:'JWKS_TRANSPORT_UNAVAILABLE',verified:false});
 }
});
test('invalid signature, wrong audience, missing kid or expired claims never become transient success',()=>{
 for(const error of ['signature_invalid','issuer_mismatch','audience_mismatch',
 'subject_mismatch','owner_mismatch','project_mismatch','environment_mismatch',
 'token_expired','token_not_yet_valid','signing_key_missing','token_format']){
  const v=classifyOidcError(Error(error));
  assert.equal(v.status,401,error);assert.equal(v.verified,false,error);
  assert.equal(v.state,'AUTH_REJECTED',error);
 }
});
test('JWKS kid found in cache is used without unnecessary refresh',async()=>{
 const calls=[];
 const result=await selectVercelSigningKey({kid:'valid',load:async force=>{
  calls.push(force);return{keys:[{kid:'valid',alg:'RS256',kty:'RSA'}]};}});
 assert.equal(result.kid,'valid');
 assert.deepEqual(calls,[false]);
});
test('JWKS rotated signing kid forces exactly one official refresh',async()=>{
 const calls=[];
 const result=await selectVercelSigningKey({kid:'rotated',load:async force=>{
  calls.push(force);
  return{keys:force?[{kid:'rotated',alg:'RS256',kty:'RSA'}]:[{kid:'old',alg:'RS256'}]};}});
 assert.equal(result.kid,'rotated');
 assert.deepEqual(calls,[false,true]);
});
test('unsigned or never-issued kid remains rejected even after official key refresh',async()=>{
 const calls=[];
 await assert.rejects(()=>selectVercelSigningKey({kid:'unknown',load:async force=>{
  calls.push(force);return {keys:[{kid:'other',alg:'RS256'}]};}}),/signing_key_missing/);
 assert.deepEqual(calls,[false,true]);
 await assert.rejects(()=>selectVercelSigningKey({kid:'HS256-key',load:async()=>{
  return{keys:[{kid:'HS256-key',alg:'HS256'}]};}}),/signing_key_missing/);
});
test('403 / 401 invalid authorization never retried and never accepted',async()=>{
 for(const status of [401,403]){
  let attempts=0;
  const result=await verifyOidcProbeWithBoundedRetry(async()=>{attempts++;return{status,verified:false}});
  assert.equal(attempts,1);assert.equal(result.verified,false);
 }
});
test('503 infrastructure retry is bounded exactly once; success must be independently verified',async()=>{
 let attempts=0;
 const result=await verifyOidcProbeWithBoundedRetry(async()=>{
  attempts++;return attempts===1?{status:503,verified:false}:{status:200,verified:true};
 });
 assert.equal(attempts,2);assert.equal(result.verified,true);
 let exhausted=0;
 const deny=await verifyOidcProbeWithBoundedRetry(async()=>{exhausted++;return{status:503,verified:false}});
 assert.equal(exhausted,2);assert.equal(deny.verified,false);
});
test('transport exception and absent verifier never default to grant',async()=>{
 await assert.rejects(()=>verifyOidcProbeWithBoundedRetry(async()=>{throw Error('network_unreachable')}));
 await assert.rejects(()=>verifyOidcProbeWithBoundedRetry(null),/read_probe_required/);
});
test('v115 signature, time, tenant and issuer requirements remain byte-present',()=>{
 const a=read('supabase/functions/runtime-v115-oidc-probe/index.ts');
 for(const clause of ['crypto.subtle.verify','RSASSA-PKCS1-v1_5',
 'payload.iss!==ISSUER','aud.includes(AUDIENCE)','payload.sub!==SUBJECT',
 'payload.owner_id!==TEAM_ID','payload.project_id!==PROJECT_ID',
 "payload.environment!=='production'","Number(payload.exp)<=now",
 "Number(payload.nbf)>now+30","selectVercelSigningKey({kid:header.kid,load:jwks})"]){
  assert.ok(a.includes(clause),clause);
 }
 assert.match(a,/status:classified\.status/);
 assert.match(a,/reason:classified\.reason/);
 assert.doesNotMatch(a,/signature_invalid'\)\s*return true/);
});
test('V180 kernel retains strict secret auth, mandatory seal and WAIT 0R while only transient 503 retries',()=>{
 const k=read('supabase/functions/runtime-v180-continuous-kernel/index.ts');
 assert.match(k,/if\(!\(await authorized\(req\)\)\)/);
 assert.match(k,/SERVICE_ROLE&&eq\(token,SERVICE_ROLE\)/);
 assert.match(k,/probe\?\.verified===true/);
 assert.match(k,/command_kernel_seal_status/);
 assert.match(k,/capital_permission:'0R'/);
 assert.match(k,/external_execution:false/);
 assert.match(k,/verifySealWithHedge/);
 assert.doesNotMatch(k,/return true;\s*\/\/.*unverified/);
});
