import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SMOKE_HOLD,SMOKE_REQUIRED,SMOKE_SHIELD_MAX_AGE_MS,assessSmokeShield,assessSmokeProbes,privilegedRestHeaders} from
 '../supabase/functions/production-smoke-sweep/smoke-policy.mjs';
const NOW=Date.parse('2026-10-25T06:00:00Z');
const healthyShield=()=>({
 ok:true,generated_at:new Date(NOW-1000).toISOString(),incident_active:false,
 postgrest:'ONLINE',control:{default_database_reads:'ALLOWED_WITH_BOUNDS'}
});
const allPass=()=>SMOKE_REQUIRED.map(([path,kind,http_status])=>({path,kind,http_status,ok:true,ms:22}));
test('shield only admits a bounded, current, explicit read-allowed state',()=>{
 assert.equal(assessSmokeShield(healthyShield(),NOW).admitted,true);
 assert.equal(SMOKE_SHIELD_MAX_AGE_MS,120000);
 for(const mutate of [
  p=>p.incident_active=true,p=>delete p.incident_active,
  p=>p.ok=false,p=>delete p.generated_at,
  p=>p.generated_at=new Date(NOW-SMOKE_SHIELD_MAX_AGE_MS-1).toISOString(),
  p=>p.generated_at=new Date(NOW+6000).toISOString(),
  p=>p.postgrest='UNKNOWN',p=>p.control.default_database_reads='UNVERIFIED'
 ]){
  const packet=healthyShield();mutate(packet);
  assert.equal(assessSmokeShield(packet,NOW).admitted,false);
 }
 for(const sample of [null,[],{},'string']){
  assert.equal(assessSmokeShield(sample,NOW).admitted,false);
 }
});
test('a completed 9/9 fixed public, auth and store proof can pass ONLY research smoke',()=>{
 const v=assessSmokeProbes(allPass());
 assert.deepEqual([v.ok,v.passed,v.failed,v.total,v.p95_ms],[true,9,0,9,22]);
 assert.equal(SMOKE_HOLD.action_permitted,'WAIT');
 assert.equal(SMOKE_HOLD.capital_permission,'0R');
 assert.equal(SMOKE_HOLD.paid_entitlement_certified,false);
 assert.equal(SMOKE_HOLD.live_order_submission_enabled,false);
 assert.equal(SMOKE_HOLD.private_kernel_certified,false);
});
test('a failed 503 public probe, lost auth boundary, or failed store withholds success',()=>{
 for(const index of [0,3,7]){
  const rows=allPass();rows[index]={...rows[index],ok:false,http_status:503};
  const v=assessSmokeProbes(rows);
  assert.equal(v.ok,false);assert.equal(v.passed,8);assert.equal(v.failed,1);
 }
});
test('9 synthetic passes cannot bypass exact endpoint names, types, or status requirements',()=>{
 for(const mutate of [
  a=>a.pop(),
  a=>a[8]={...a[7]},
  a=>a[2]={...a[2],path:'unlisted'},
  a=>a[1]={...a[1],kind:'auth_boundary'},
  a=>a[4]={...a[4],http_status:200},
  a=>a[0]={...a[0],ms:NaN},
  a=>a[0]={...a[0],ok:'true'}
 ]){
  const a=allPass();mutate(a);
  assert.equal(assessSmokeProbes(a).ok,false);
 }
});
test('production Edge function recovers actual proofs without reinstating fail-open incident logic',()=>{
 const source=readFileSync(new URL('../supabase/functions/production-smoke-sweep/index.ts',import.meta.url),'utf8');
 const cli=readFileSync(new URL('../supabase/functions/production-smoke-sweep/smoke-policy.mjs',import.meta.url),'utf8');
 assert.match(source,/const shield=assessSmokeShield\(await incident\(\)\)/);
 assert.match(source,/if\(!shield.admitted\)return Response.json/);
 assert.match(source,/assessSmokeProbes\(results\)/);
 assert.match(source,/sha256Hex\(supplied\)/);
 assert.match(source,/Deno\.env\.get\('SUPABASE_SECRET_KEYS'\)/);
 assert.match(source,/privilegedRestHeaders\(k\)/);
 assert.doesNotMatch(source,/headers:\{apikey:k,Authorization:/);
 assert.match(source,/agent_type:'production_smoke_sweep'/);
 assert.match(source,/metadata:.*framework_version:'production_smoke_v289_fail_closed'/);
 assert.match(source,/governance:SMOKE_HOLD/);
 assert.doesNotMatch(source,/if\(inc\?\.incident_active\)/);
 assert.doesNotMatch(source,/detail:msg\.slice\(0,300\)/);
 assert.doesNotMatch(source,/return Response.json\(\{ok:true,status:'skipped_recent'/);
 assert.match(cli,/SMOKE_REQUIRED/);
 const checkout=readFileSync(new URL('../supabase/functions/create-checkout/index.ts',import.meta.url),'utf8');
 assert.match(checkout,/V272_CHARGES_ENABLED=false/);
});

test('V289.1: server-side sb_secret_ key is never put into Bearer Authorization',()=>{
  const secret='sb_secret_'+ 'a'.repeat(32);
  const modern=privilegedRestHeaders(secret);
  assert.deepEqual(modern,{apikey:secret});
  assert.equal('Authorization' in modern,false);
  const legacy='aaa.bbb.ccc'.repeat(3).replaceAll('caa','caa');
  const jwt='headerfragment.payloadfragment.signaturefragment';
  assert.deepEqual(privilegedRestHeaders(jwt),
    {apikey:jwt,Authorization:'Bearer '+jwt});
  for(const invalid of ['',null,'sb_publishable_'+ 'a'.repeat(30),'not-a-credential','sb_secret_!wrong']){
    assert.throws(()=>privilegedRestHeaders(invalid),/server_credential_invalid/);
  }
});
