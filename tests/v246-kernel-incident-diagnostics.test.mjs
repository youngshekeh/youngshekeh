import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyV231KernelIncident} from '../src/v231-kernel-admission.mjs';

const fail=(detail,stage='KERNEL_SEAL',status=503)=>classifyV231KernelIncident({status,body:{stage,detail}});
const wait=result=>{
 assert.equal(result.seal_verified,false);
 assert.equal(result.recertification_required,true);
 assert.equal(result.database_scheduler_changed,false);
 assert.equal(result.reset_performed,false);
 assert.equal(result.governance.action_permitted,'WAIT');
 assert.equal(result.governance.capital_permission,'0R');
 assert.equal(result.governance.live_order_submission_enabled,false);
};
test('V245 explicit two-lane transport timeout is not falsely called missing seal',()=>{
 const r=fail('Error: DATABASE_SEAL_TRANSPORT_TIMEOUT');
 assert.equal(r.code,'DATABASE_SEAL_TRANSPORT_TIMEOUT');
 wait(r);
});
test('legacy PostgREST timeout and newer pooler timeout classes retain same fail-closed classification',()=>{
 for(const detail of ['TimeoutError: Signal timed out.','seal_pooler_deadline','POOLER_CONNECT_TIMEOUT','POOLER_QUERY_DEADLINE','POOLER_AUTH_TIMEOUT_OR_REJECTED']){
  const r=fail(detail);
  assert.equal(r.code,'DATABASE_SEAL_TRANSPORT_TIMEOUT',detail);
  wait(r);
 }
});
test('explicit missing/failed database seal takes precedence even with timeout wording',()=>{
 for(const detail of ['v180_kernel_security_seal_missing after timeout','security_seal_verification_failed']){
  const r=fail(detail);
  assert.equal(r.code,'SECURITY_SEAL_NOT_VERIFIED');
  wait(r);
 }
});
test('non-seal failures and unconfirmed requests do not turn into seal transport errors',()=>{
 for(const [stage,detail,status] of [['LOCK','DATABASE_SEAL_TRANSPORT_TIMEOUT',503],['KERNEL_SEAL','DATABASE_SEAL_TRANSPORT_TIMEOUT',200],['FINISH','timeout',503]]){
  const r=fail(detail,stage,status);
  assert.notEqual(r.code,'DATABASE_SEAL_TRANSPORT_TIMEOUT');
  wait(r);
 }
});
test('errors never claim any genuine live run receipt or paid/trade readiness',()=>{
 const r=fail('DATABASE_SEAL_TRANSPORT_TIMEOUT');
 assert.deepEqual(Object.keys(r).sort(),['code','database_scheduler_changed','governance','recertification_required','reset_performed','seal_verified','version'].sort());
 assert.equal(r.code,'DATABASE_SEAL_TRANSPORT_TIMEOUT');
 wait(r);
});
