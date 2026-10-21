import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {assessQaAdmission} from '../src/qa-admission.mjs';
import {evaluateLaunchReadiness} from '../src/launch-readiness.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const NOW=Date.parse('2026-10-21T05:25:00Z');
const at=new Date(NOW-1000).toISOString();
const base=()=>({
  auth:{response:{ok:true},data:{ok:true,generated_at:at,state:'PASSWORD_AUTH_READY',auth_health:{ok:true},auth_settings:{email_password:true}}},
  readiness:{response:{ok:true},data:{ok:true,generated_at:at,state:'FULL_ACCEPTANCE_READY',database_incident:{active:false},hard_blockers:[],acceptance_pending:[],external_unknowns:[]}},
  billing:{response:{ok:true},data:{ok:true,generated_at:at,state:'LIVE_FLOW_VERIFIED',ready_for_checkout:true,live_flow_verified:true,gates:{provider_plan_parity:'PASS',signed_payment_evidence:'PASS',active_entitlement_evidence:'PASS'}}},
  gold:{response:{ok:true},data:{ok:true,live_broker:{state:'BROKER_LIVE',quote:{observed_at:at,age_seconds:1,bid:4200,mid:4200.5,ask:4201}}}}
});
test('missing Gold blocks expensive QA and precharge',()=>{
 const f=base();delete f.gold;
 assert.equal(assessQaAdmission(f,NOW).admitted,false);
 assert.ok(assessQaAdmission(f,NOW).blockers.includes('public_gold_data'));
});
test('Gold stale after private QA cannot authorize checkout',()=>{
 const f=base(),qa={response:{ok:true,headers:{get:()=> 'VERCEL_OIDC'}},data:{
  ok:true,summary:{total:107,passed:107,failed:0},
  continuous_kernel:{ok:true,last_succeeded_at:at,consecutive_successes:2,capital_permission:'0R',action_permitted:'WAIT'}
 }};
 assert.equal(evaluateLaunchReadiness({...f,qa},NOW).ready,true);
 assert.equal(evaluateLaunchReadiness({...f,qa},NOW+6000).checks.public_gold_data,false);
 assert.equal(evaluateLaunchReadiness({...f,qa},NOW+6000).ready,false);
});
test('both checkout verifier functions recheck Gold after QA',()=>{
 const code=read('src/checkout.ts');
 assert.match(code,/const GOLD_PROOF_URL='\/api\/public-gold-read'/);
 assert.equal((code.match(/const latestGold=/g)||[]).length,2);
 assert.equal((code.match(/evaluateLaunchReadiness\(\{auth:a,readiness:r,billing:b,qa:q,gold:latestGold\}\)/g)||[]).length,2);
 assert.equal((code.match(/assessQaAdmission\(\{auth:a,readiness:r,billing:b,gold:g\}\)/g)||[]).length,2);
 assert.match(code,/const canCheckPrivate=loggedIn&&preflight\.admitted&&planOk/);
 assert.match(code,/if\(!member\|\|!preflight\.admitted\|\|!planEligible\(plan,b\.data\)\)/);
 const qa=code.indexOf("await local('/api/autonomous-qa-matrix?commercial_acceptance=1')");
 const newer=code.indexOf('const latestGold=');
 assert.ok(qa>=0&&newer>qa);
});
test('server-side acceptance still locked, trading zero',()=>{
 const s=read('src/checkout.ts');
 assert.match(s,/const CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(s,/async function verifyCheckout\(\)\{\s*if\(!CHECKOUT_SERVER_GUARD_DEPLOYED\)/);
 assert.match(s,/async function startCheckout\(\)\{\s*if\(!CHECKOUT_SERVER_GUARD_DEPLOYED\)/);
 assert.match(read('src/public-gold-evidence.mjs'),/GOLD_LAUNCH_MAX_AGE_MS = 5_000/);
});
