import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {assessQaAdmission,QA_PREREQUISITES} from '../src/qa-admission.mjs';
import {evaluateLaunchReadiness} from '../src/launch-readiness.mjs';

const NOW=Date.parse('2026-10-21T05:00:00Z');
const stamp=new Date(NOW-1000).toISOString();
const valid=()=>({
 auth:{response:{ok:true},data:{ok:true,generated_at:stamp,state:'PASSWORD_AUTH_READY',auth_health:{ok:true},auth_settings:{email_password:true}}},
 readiness:{response:{ok:true},data:{ok:true,generated_at:stamp,state:'FULL_ACCEPTANCE_READY',database_incident:{active:false},hard_blockers:[],acceptance_pending:[],external_unknowns:[]}},
 billing:{response:{ok:true},data:{ok:true,generated_at:stamp,state:'LIVE_FLOW_VERIFIED',ready_for_checkout:true,live_flow_verified:true,gates:{provider_plan_parity:'PASS',signed_payment_evidence:'PASS',active_entitlement_evidence:'PASS'}}},
 gold:{response:{ok:true},data:{ok:true,live_broker:{state:'BROKER_LIVE',quote:{observed_at:stamp,age_seconds:1,bid:4200,mid:4200.5,ask:4201}}}}
});
test('missing evidence defers expensive QA and cannot certify identity or kernel',()=>{
 const result=assessQaAdmission({},NOW);
 assert.equal(result.admitted,false);
 assert.equal(result.blockers.length,4);
 assert.equal(result.workload_identity_certified,false);
 assert.equal(result.continuous_kernel_certified,false);
 assert.equal(evaluateLaunchReadiness({},NOW).ready,false);
});
test('only all four independently certified prerequisites admit OIDC private QA request',()=>{
 assert.deepEqual(QA_PREREQUISITES,['auth','final_acceptance','billing','public_gold_data']);
 const v=valid();
 const a=assessQaAdmission(v,NOW);
 assert.equal(a.admitted,true);
 assert.deepEqual(a.blockers,[]);
 // Admission is never launch readiness, even with all prechecks green.
 assert.equal(evaluateLaunchReadiness(v,NOW).ready,false);
 assert.equal(evaluateLaunchReadiness(v,NOW).checks.private_qa,false);
});
test('each missing prerequisite defers the expensive private QA request',()=>{
 for(const key of ['auth','readiness','billing','gold']){
   const v=valid();delete v[key];
   assert.equal(assessQaAdmission(v,NOW).admitted,false,key);
 }
});
test('stale gold, stale billing, missing entitlement and database incidents defer QA',()=>{
 let v=valid();v.gold.data.live_broker.quote.age_seconds=15;
 assert.deepEqual(assessQaAdmission(v,NOW).blockers,['public_gold_data']);
 v=valid();v.billing.data.gates.active_entitlement_evidence='WITHHELD';
 assert.deepEqual(assessQaAdmission(v,NOW).blockers,['billing']);
 v=valid();v.readiness.data.database_incident.active=true;
 assert.deepEqual(assessQaAdmission(v,NOW).blockers,['final_acceptance']);
 v=valid();v.auth.data.generated_at=new Date(NOW-11*60000).toISOString();
 assert.deepEqual(assessQaAdmission(v,NOW).blockers,['auth']);
});
test('public status stages expensive QA after independent no-store readiness probes',()=>{
 const s=readFileSync(new URL('../src/status.ts',import.meta.url),'utf8');
 const checkout=readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8');
 assert.match(s,/Promise\.allSettled/);
 assert.match(s,/assessQaAdmission\(\{auth, readiness, billing, gold\}\)/);
 assert.match(s,/qaAdmission\.admitted[\s\S]*readSite\('\/api\/autonomous-qa-matrix\?status_surface=1'\)/);
 assert.match(s,/DEFERRED · PREREQUISITES UNHEALTHY/);
 assert.match(s,/evaluateLaunchReadiness\(\{ auth, readiness, billing, qa, gold \}\)/);
 assert.match(checkout,/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
});
