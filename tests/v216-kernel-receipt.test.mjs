import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {certifyKernelReceipt} from '../src/kernel-receipt-gate.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const now=Date.parse('2026-10-20T19:30:00Z');
const good=()=>({
 ok:true,generated_at:'2026-10-20T19:29:20Z',
 seal:{sealed:true,transport:'SQL_POOLER_VERIFIED',version:'v180.6'},
 owners_processed:2,
 runs:[
  {status:'SUCCEEDED',run_id:'run-123',mode:'EXECUTE',health_state:'HEALTHY'},
  {status:'SUCCEEDED',run_id:'run-456',mode:'EXECUTE',health_state:'HEALTHY'}
 ],
 governance:{internal_execution_only:true,external_execution:false,action_permitted:'WAIT',
 capital_permission:'0R',funds_moved:false,trades_sent:false,human_approval_bypassed:false}
});
test('accepts only fresh, strictly sealed healthy run receipts',()=>{
 const r=certifyKernelReceipt(good(),now);
 assert.equal(r.verified,true);
 assert.equal(r.reason,'EXECUTED_AND_VERIFIED');
 assert.deepEqual(r.counts,{owners:2,successful_runs:2});
 assert.equal(Object.isFrozen(r),true);
});
test('rejects failed, overlap, skipped, dead letter, and retry-only cycles',()=>{
 for(const status of ['FAILED','SKIPPED_OVERLAP','NOT_STARTED']){
  const x=good();x.runs[0].status=status;
  assert.equal(certifyKernelReceipt(x,now).reason,'OWNER_RUN_NOT_HEALTHY',status);
 }
 for(const mode of ['RETRY_BACKOFF','DEAD_LETTER_HOLD','UNVERIFIED']){
  const x=good();x.runs[0].mode=mode;
  assert.equal(certifyKernelReceipt(x,now).verified,false,mode);
 }
 const x=good();x.runs[0].health_state='DEGRADED';
 assert.equal(certifyKernelReceipt(x,now).verified,false);
});
test('missing, stale or future timestamps cannot become green',()=>{
 for(const date of [null,'2026-10-20T19:27:00Z','2026-10-20T19:32:00Z','gibberish']){
  const x=good();x.generated_at=date;
  assert.equal(certifyKernelReceipt(x,now).reason,'STALE_OR_MISSING_TIMESTAMP');
 }
});
test('forged or unrecognized seal transport never certifies',()=>{
 for(const seal of [{sealed:false,transport:'SQL_POOLER_VERIFIED'},{sealed:true,transport:'UNKNOWN'},{sealed:true}]){
  const x=good();x.seal=seal;
  assert.equal(certifyKernelReceipt(x,now).reason,'SEAL_NOT_VERIFIED');
 }
});
test('missing/mismatched owner count and duplicated receipt IDs are rejected',()=>{
 for(const count of [0,-1,21,1,1.5,undefined]){
  const x=good();x.owners_processed=count;
  assert.equal(certifyKernelReceipt(x,now).verified,false,String(count));
 }
 const duplicated=good();duplicated.runs[1].run_id='run-123';
 assert.equal(certifyKernelReceipt(duplicated,now).reason,'RUN_RECEIPT_ID_INVALID');
 const missing=good();delete missing.runs[0].run_id;
 assert.equal(certifyKernelReceipt(missing,now).verified,false);
});
test('capital risk permission and human control must remain exactly locked',()=>{
 const fields=[
  ['internal_execution_only',false],['external_execution',true],
  ['action_permitted','BUY'],['capital_permission','1R'],
  ['funds_moved',true],['trades_sent',true],['human_approval_bypassed',true]
 ];
 for(const [key,value] of fields){
  const x=good();x.governance[key]=value;
  assert.equal(certifyKernelReceipt(x,now).reason,'CAPITAL_GOVERNANCE_NOT_VERIFIED',key);
 }
});
test('heartbeat only emits active status if explicit proof passes',()=>{
 const s=read('api/ops-heartbeat.js');
 assert.match(s,/import \{ certifyKernelReceipt \} from '\.\.\/src\/kernel-receipt-gate\.mjs'/);
 assert.match(s,/const proof=kernel\.ok\?certifyKernelReceipt\(kernel\.body\):null/);
 assert.match(s,/if\(kernel\.ok&&!proof\?\.verified\)/);
 assert.match(s,/kernel_receipts_uncertified/);
 assert.match(s,/if\(kernel\.ok&&proof\?\.verified\)/);
 assert.match(s,/run_receipt_certification:\{verified:true,successful_runs:proof\.counts\.successful_runs/);
 assert.match(s,/database_scheduler:\{changed:false/);
 assert.match(s,/authHeader!==\x60Bearer \$\{cronSecret\}\x60/);
});
