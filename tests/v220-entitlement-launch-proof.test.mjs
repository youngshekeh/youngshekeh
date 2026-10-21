import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {evaluateLaunchReadiness} from '../src/launch-readiness.mjs';
import {planEligible,priceFor} from '../src/commercial-gates.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const NOW=Date.parse('2026-10-20T21:25:00Z');
const fresh=new Date(NOW-40_000).toISOString();
const record=()=>({
  auth:{response:{ok:true},data:{ok:true,generated_at:fresh,state:'PASSWORD_AUTH_READY',auth_health:{ok:true},auth_settings:{email_password:true}}},
  readiness:{response:{ok:true},data:{ok:true,generated_at:fresh,state:'FULL_ACCEPTANCE_READY',database_incident:{active:false},hard_blockers:[],acceptance_pending:[],external_unknowns:[]}},
  billing:{response:{ok:true},data:{ok:true,generated_at:fresh,state:'LIVE_FLOW_VERIFIED',ready_for_checkout:true,live_flow_verified:true,
    gates:{provider_plan_parity:'PASS',signed_payment_evidence:'PASS',active_entitlement_evidence:'PASS'},
    plans:[{plan_id:'pro',local_price_usd:79,currency:'USD',recurring:true,provider_verified:true}]}},
  gold:{response:{ok:true},data:{ok:true,live_broker:{state:'BROKER_LIVE',quote:{observed_at:new Date(NOW-1000).toISOString(),age_seconds:1,bid:4200,mid:4200.5,ask:4201}}}},
  qa:{response:{ok:true,headers:{get:key=>key==='x-tfa-auth'?'VERCEL_OIDC':null}},data:{
    ok:true,summary:{total:9,passed:9,failed:0},
    continuous_kernel:{ok:true,last_succeeded_at:fresh,consecutive_successes:2,capital_permission:'0R',action_permitted:'WAIT'}
  }}
});
test('complete hypothetical receipts only qualify for final operator assessment',()=>{
 const x=record();
 assert.equal(evaluateLaunchReadiness(x,NOW).ready,true);
 assert.equal(planEligible('pro',x.billing.data,NOW),true);
 assert.equal(priceFor('pro',x.billing.data,NOW),79);
});
test('historical payment and live provider mapping cannot stand in for active entitlement',()=>{
 const x=record();
 for(const state of ['WITHHELD','PENDING','UNKNOWN',false,null,undefined]){
   x.billing.data.gates.active_entitlement_evidence=state;
   const r=evaluateLaunchReadiness(x,NOW);
   assert.equal(r.ready,false,String(state));
   assert.equal(r.checks.billing,false,String(state));
   assert.equal(planEligible('pro',x.billing.data,NOW),false,String(state));
   assert.equal(priceFor('pro',x.billing.data,NOW),79,'verified price and purchase permission remain separate');
 }
});
test('one healthy V180 run, skipped cycle or unverifiable cycle count cannot green-light public status',()=>{
 const x=record();
 for(const count of [1,0,-1,null,undefined,'2',1.5]){
   x.qa.data.continuous_kernel.consecutive_successes=count;
   assert.equal(evaluateLaunchReadiness(x,NOW).checks.continuous_kernel,false,String(count));
 }
});
test('fresh two-cycle evidence must be authenticated, capital locked and QA clean',()=>{
 const x=record();x.qa.data.continuous_kernel.consecutive_successes=2;
 x.qa.data.continuous_kernel.last_succeeded_at=new Date(NOW-11*60_000).toISOString();
 assert.equal(evaluateLaunchReadiness(x,NOW).checks.continuous_kernel,false);
 x.qa.data.continuous_kernel.last_succeeded_at=fresh;
 x.qa.response.headers.get=()=>null;
 assert.equal(evaluateLaunchReadiness(x,NOW).checks.continuous_kernel,false);
 x.qa.response.headers.get=k=>k==='x-tfa-auth'?'VERCEL_OIDC':null;
 x.qa.data.continuous_kernel.capital_permission='1R';
 assert.equal(evaluateLaunchReadiness(x,NOW).checks.continuous_kernel,false);
});
test('independent final readiness must be free of unknown external dependencies',()=>{
 const x=record();x.readiness.data.external_unknowns=['provider_rate_limit'];
 assert.equal(evaluateLaunchReadiness(x,NOW).checks.final_acceptance,false);
 assert.equal(evaluateLaunchReadiness(x,NOW).ready,false);
});
test('signed payment proof and verified plan parity remain mandatory',()=>{
 const x=record();
 for(const field of ['provider_plan_parity','signed_payment_evidence']){
   const y=record();y.billing.data.gates[field]='WITHHELD';
   assert.equal(planEligible('pro',y.billing.data,NOW),false,field);
   assert.equal(evaluateLaunchReadiness(y,NOW).checks.billing,false,field);
 }
});
test('the current observed public provider response remains on launch hold',()=>{
 const x=record();
 x.billing.data.state='READY_FOR_CONTROLLED_LIVE_TEST';
 x.billing.data.live_flow_verified=false;
 x.billing.data.gates.active_entitlement_evidence='WITHHELD';
 x.readiness.data.external_unknowns=['provider_rate_limit'];
 assert.equal(evaluateLaunchReadiness(x,NOW).ready,false);
 assert.equal(planEligible('pro',x.billing.data,NOW),false);
});
test('status surface distinguishes partial kernel and billing progress from ready launch',()=>{
 const code=read('src/status.ts');
 assert.match(code,/certifiedCycles/);
 assert.match(code,/PROCESSING OBSERVED · NOT LAUNCH-CERTIFIED/);
 assert.match(code,/PROVIDER PREFLIGHT · ENTITLEMENT PENDING/);
 assert.match(code,/freshEvidence\(kernel\?\.last_succeeded_at\)/);
 assert.match(code,/gate\.checks\.billing/);
});
test('checkout remains hard locked on website and V180 capital WAIT 0R',()=>{
 const checkout=read('src/checkout.ts');
 assert.match(checkout,/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(checkout,/if\(!CHECKOUT_SERVER_GUARD_DEPLOYED\)/);
 assert.match(read('api/ops-heartbeat.js'),/certifyKernelReceipt/);
 assert.match(read('src/launch-readiness.mjs'),/consecutive_successes >= 2/);
 assert.match(read('src/commercial-gates.mjs'),/active_entitlement_evidence==='PASS'/);
});
