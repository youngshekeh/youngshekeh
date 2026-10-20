import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { evaluateLaunchReadiness, freshEvidence } from '../src/launch-readiness.mjs';

const observed = () => new Date().toISOString();
const valid = () => {
  const time = observed();
  return {
    auth: {response:{ok:true},data:{ok:true,generated_at:time,state:'PASSWORD_AUTH_READY',auth_health:{ok:true},auth_settings:{email_password:true}}},
    readiness: {response:{ok:true},data:{ok:true,generated_at:time,state:'FULL_ACCEPTANCE_READY',database_incident:{active:false},hard_blockers:[],acceptance_pending:[],external_unknowns:[]}},
    billing: {response:{ok:true},data:{ok:true,generated_at:time,state:'LIVE_FLOW_VERIFIED',ready_for_checkout:true,live_flow_verified:true}},
    qa: {response:{ok:true,headers:{get:key=>key==='x-tfa-auth'?'VERCEL_OIDC':null}},data:{
      ok:true,summary:{total:10,passed:10,failed:0},
      continuous_kernel:{ok:true,last_succeeded_at:time,capital_permission:'0R',action_permitted:'WAIT'}
    }},
  };
};

test('no evidence cannot authorize a launch',()=>{
  const r=evaluateLaunchReadiness();
  assert.equal(r.ready,false);assert.equal(r.state,'LAUNCH HOLD');assert.equal(r.blockers.length,6);
});
test('synthetic fully qualified current receipts pass all independent checks',()=>{
  const r=evaluateLaunchReadiness(valid());
  assert.equal(r.ready,true);assert.equal(r.state,'LAUNCH READY');assert.equal(r.blockers.length,0);
});
test('HTTP 200 does not prove auth or platform acceptance',()=>{
  const v=valid();
  v.auth.data.state='AUTH_UNAVAILABLE';
  v.readiness.data.state='BUILD_HOLD';
  const x=evaluateLaunchReadiness(v);
  assert.equal(x.ready,false);assert.equal(x.checks.auth,false);assert.equal(x.checks.final_acceptance,false);
});
test('unknown provider evidence must block acceptance',()=>{
  const v=valid();v.readiness.data.external_unknowns=['provider_rate_limit'];
  assert.equal(evaluateLaunchReadiness(v).checks.final_acceptance,false);
});
test('QA must contain a nonempty fully passing sample',()=>{
  const v=valid();v.qa.data.summary={total:0,passed:0,failed:0};
  assert.equal(evaluateLaunchReadiness(v).checks.private_qa,false);
  v.qa.data.summary={total:10,passed:9,failed:0};
  assert.equal(evaluateLaunchReadiness(v).checks.private_qa,false);
});
test('billing requires verified real checkout evidence',()=>{
  const v=valid();v.billing.data.live_flow_verified=false;
  assert.equal(evaluateLaunchReadiness(v).checks.billing,false);
});
test('identity must be backed by a successful current OIDC response',()=>{
  const v=valid();v.qa.response.headers.get=()=>null;
  assert.equal(evaluateLaunchReadiness(v).checks.workload_identity,false);
  assert.equal(evaluateLaunchReadiness(v).checks.continuous_kernel,false);
});
test('a 10-minute-plus-old readiness report cannot turn a dashboard green',()=>{
  const v=valid();
  v.readiness.data.generated_at=new Date(Date.now()-11*60*1000).toISOString();
  assert.equal(evaluateLaunchReadiness(v).checks.final_acceptance,false);
  assert.equal(evaluateLaunchReadiness(v).ready,false);
});
test('recent QA success does not prove V180 continuous operation',()=>{
  const v=valid();delete v.qa.data.continuous_kernel;
  assert.equal(evaluateLaunchReadiness(v).checks.private_qa,true);
  assert.equal(evaluateLaunchReadiness(v).checks.continuous_kernel,false);
  assert.equal(evaluateLaunchReadiness(v).state,'LAUNCH HOLD');
});
test('stale or capital-unlocked kernel receipts are not launch evidence',()=>{
  const v=valid();
  v.qa.data.continuous_kernel.last_succeeded_at=new Date(Date.now()-11*60*1000).toISOString();
  assert.equal(evaluateLaunchReadiness(v).checks.continuous_kernel,false);
  v.qa.data.continuous_kernel.last_succeeded_at=observed();
  v.qa.data.continuous_kernel.capital_permission='1R';
  assert.equal(evaluateLaunchReadiness(v).checks.continuous_kernel,false);
});
test('clock skew, missing dates and invalid timestamps fail closed',()=>{
  assert.equal(freshEvidence(null),false);
  assert.equal(freshEvidence('invalid'),false);
  assert.equal(freshEvidence(new Date(Date.now()+120000).toISOString()),false);
});
test('public status does not overstate a deployed page and preserves manual refresh',()=>{
  const code=readFileSync(new URL('../src/status.ts',import.meta.url),'utf8');
  const html=readFileSync(new URL('../status/index.html',import.meta.url),'utf8');
  const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(code,/Promise\.allSettled/);
  assert.match(code,/evaluateLaunchReadiness/);
  assert.match(code,/show\('kernel'/);
  assert.match(html,/id="kernel"/);
  assert.match(html,/id="status-refresh"/);
  assert.match(html,/WAIT \/ 0R/);
  assert.match(home,/href="\.\/status\/"/);
});
