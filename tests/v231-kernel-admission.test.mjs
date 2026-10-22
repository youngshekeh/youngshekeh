import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyV231KernelIncident,V231_CRON_PHASE} from '../src/v231-kernel-admission.mjs';
const source=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
test('V231 preserves 12 heartbeats per hour and shifts to minute 4',()=>{
 const config=JSON.parse(source('vercel.json'));
 const entries=config.crons.filter(x=>x.path==='/api/ops-heartbeat');
 assert.equal(entries.length,1);
 assert.equal(entries[0].schedule,V231_CRON_PHASE);
 assert.deepEqual(Array.from({length:12},(_,i)=>4+5*i),[4,9,14,19,24,29,34,39,44,49,54,59]);
 assert.match(source('api/ops-heartbeat.js'),/4-59\/5 \* \* \* \*/);
});
test('transport timeout remains unverified; explicit failed seal never becomes a timeout success',()=>{
 const t=classifyV231KernelIncident({status:503,body:{stage:'KERNEL_SEAL',detail:'TimeoutError: Signal timed out.'}});
 assert.equal(t.code,'DATABASE_SEAL_TRANSPORT_TIMEOUT');assert.equal(t.seal_verified,false);
 assert.equal(t.governance.capital_permission,'0R');
 const i=classifyV231KernelIncident({status:503,body:{stage:'KERNEL_SEAL',detail:'v180_kernel_security_seal_missing'}});
 assert.equal(i.code,'SECURITY_SEAL_NOT_VERIFIED');
 assert.equal(i.seal_verified,false);
});
test('no new permission to submit trades, change database cron or take payment',()=>{
 const hb=source('api/ops-heartbeat.js');
 const seal=source('supabase/functions/runtime-v180-continuous-kernel/index.ts');
 assert.match(hb,/certifyKernelReceipt\(kernel\.body\)/);
 assert.match(hb,/getVercelOidcToken\(\)/);
 assert.match(hb,/database_scheduler:\{changed:false/);
 assert.match(hb,/authHeader!==`Bearer \$\{cronSecret\}`/);
 assert.match(hb,/Retry-After','300'/);
 assert.match(seal,/const seal=await requireKernelSeal\(\)/);
 assert.match(source('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.doesNotMatch(hb,/cron\.alter_job|pg_terminate_backend|execute_trade|create-checkout/);
});
