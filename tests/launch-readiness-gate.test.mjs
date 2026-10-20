import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { evaluateLaunchReadiness } from '../src/launch-readiness.mjs';

const valid = () => ({
  auth: {response:{ok:true},data:{ok:true,state:'PASSWORD_AUTH_READY',auth_health:{ok:true},auth_settings:{email_password:true}}},
  readiness: {response:{ok:true},data:{ok:true,state:'FULL_ACCEPTANCE_READY',database_incident:{active:false},hard_blockers:[],acceptance_pending:[],external_unknowns:[]}},
  billing: {response:{ok:true},data:{ok:true,state:'LIVE_FLOW_VERIFIED',ready_for_checkout:true,live_flow_verified:true}},
  qa: {response:{ok:true,headers:{get:key=>key==='x-tfa-auth'?'VERCEL_OIDC':null}},data:{ok:true,summary:{total:10,passed:10,failed:0}}},
});

test('fails closed with no evidence',()=>{
  const v=evaluateLaunchReadiness();
  assert.equal(v.ready,false);assert.equal(v.state,'LAUNCH HOLD');assert.equal(v.blockers.length,5);
});
test('full success needs every independent acceptance lane',()=>{
  const v=evaluateLaunchReadiness(valid());
  assert.equal(v.ready,true);assert.equal(v.state,'LAUNCH READY');assert.equal(v.blockers.length,0);
});
test('HTTP 200 is not proof of auth or final readiness',()=>{
  const v=valid();
  v.auth.data={ok:true,state:'AUTH_UNAVAILABLE',auth_health:{ok:false},auth_settings:{email_password:false}};
  v.readiness.data.state='BUILD_HOLD';
  const x=evaluateLaunchReadiness(v);
  assert.equal(x.ready,false);assert.equal(x.checks.auth,false);assert.equal(x.checks.final_acceptance,false);
});
test('any unverified external dependency keeps commercial launch on hold',()=>{
  const v=valid();v.readiness.data.external_unknowns=['provider_rate_limit'];
  assert.equal(evaluateLaunchReadiness(v).ready,false);
});
test('QA zeros need a non-empty fully successful sample',()=>{
  const v=valid();v.qa.data.summary={total:0,passed:0,failed:0};
  assert.equal(evaluateLaunchReadiness(v).checks.private_qa,false);
  v.qa.data.summary={total:10,passed:9,failed:0};
  assert.equal(evaluateLaunchReadiness(v).checks.private_qa,false);
});
test('billing readiness needs a verified live flow',()=>{
  const v=valid();v.billing.data.live_flow_verified=false;
  assert.equal(evaluateLaunchReadiness(v).checks.billing,false);
});
test('missing OIDC identity cannot pass',()=>{
  const v=valid();v.qa.response.headers.get=()=>null;
  assert.equal(evaluateLaunchReadiness(v).checks.workload_identity,false);
});
test('status page cannot mark single HTTP 200 green and probes remain independent',()=>{
  const code=readFileSync(new URL('../src/status.ts',import.meta.url),'utf8');
  const html=readFileSync(new URL('../status/index.html',import.meta.url),'utf8');
  assert.match(code,/Promise\.allSettled/);
  assert.match(code,/evaluateLaunchReadiness/);
  assert.match(code,/AbortSignal\.timeout/);
  assert.match(code,/show\('launch-gate', gate\.state, gate\.ready\)/);
  assert.match(html,/id="launch-gate"/);
  assert.match(html,/id="status-refresh"/);
  assert.match(html,/WAIT \/ 0R/);
});
