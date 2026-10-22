import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
const up=root('supabase/recovery/v232-gold-snapshot-admission.sql');
const down=root('supabase/recovery/v232-gold-snapshot-admission-rollback.sql');
const minuteField=s=>s.split(' ')[0];
function parseMinutes(field){
 const [scope,period]=field.split('/');const [lo,hi]=scope==='*'?[0,59]:scope.split('-').map(Number);
 return Array.from({length:60},(_,i)=>i).filter(i=>i>=lo&&i<=hi&&(i-lo)%Number(period||1)===0);
}
test('weekday-only Gold snapshot lanes are staggered and still every five minutes',()=>{
 const before=parseMinutes(minuteField('*/5 * * * 1-5'));
 const after13=parseMinutes('3-59/5');
 const after16=parseMinutes('4-59/5');
 assert.equal(before.length,12);assert.equal(after13.length,12);assert.equal(after16.length,12);
 assert.ok(after13.every(x=>x%5===3));assert.ok(after16.every(x=>x%5===4));
 assert.ok(before.every(x=>!after13.includes(x)&&!after16.includes(x)));
 assert.match(up,/3-59\/5 \* \* \* 1-5/);assert.match(up,/4-59\/5 \* \* \* 1-5/);
});
test('targets only approved Gold snapshot jobs and never disables them',()=>{
 for(const n of ['gold-live-snapshot-5m','live_markets_snapshot_capture'])assert.ok(up.includes(n));
 assert.match(up,/j\.jobid in\(13,16\)/);
 assert.match(up,/active is not true/);
 assert.doesNotMatch(up,/active\s*:=\s*false|pg_terminate_backend|DROP TABLE|TRUNCATE|ALTER SYSTEM|DROP FUNCTION/i);
 assert.doesNotMatch(up,/execute_trade|submit_order|checkout|payment_capture/i);
});
test('transactional preconditions, fingerprints and exact rollback hold',()=>{
 assert.match(up,/pg_try_advisory_xact_lock/);
 assert.match(up,/v232_schedule_drift/);
 assert.match(up,/v232_required_jobs_not_found/);
 assert.match(up,/v232_command_or_baseline_drift/);
 assert.match(up,/v232_schedule_verification_failed/);
 assert.match(down,/v232_applied_baseline_incomplete/);
 assert.match(down,/v232_rollback_job_drift/);
 assert.match(down,/md5\(r.command\)<>r.command_fingerprint/);
 assert.match(down,/r\.previous_schedule/);
 assert.match(up,/set local statement_timeout='12s'/);
 assert.match(root('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
});
