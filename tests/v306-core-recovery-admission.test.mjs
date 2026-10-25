import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCoreRecoveryAdmission} from '../src/v306-core-recovery-admission.mjs';
const now=Date.parse('2026-10-25T13:25:00Z');
const at=n=>new Date(now-n*60000).toISOString();
const catalog={source_md5:'ad18646c899eaffd2e7f6dfae567ce71',cron_active:true,
 cron_schedule:'11,26,41,56 * * * *',cron_name:'tfa-v70-autonomous-core',
 cron_command:'select public.refresh_autonomous_machine_state();',read_at:at(1)};
const sqlProbes=[{ok:true,lock_waits:0,checked_at:at(5)},{ok:true,lock_waits:0,checked_at:at(1)}];
const receipts=[{runid:300,jobid:44,status:'succeeded',start_time:at(12),end_time:at(11)},
 {runid:299,jobid:44,status:'succeeded',start_time:at(27),end_time:at(26)}];
const check=x=>assessCoreRecoveryAdmission(x,now);
test('V306 six failed job startup receipts block V304 despite healthy-looking SQL',()=>{
 const failed=Array.from({length:6},(_,i)=>({runid:400-i,jobid:44,status:'failed',
  start_time:at(1+i*7),end_time:at(i*7),message:'job startup timeout'}));
 const d=check({catalog,sqlProbes,receipts:failed});
 assert.equal(d.eligible_for_manual_v304_review,false);
 assert.ok(d.blockers.includes('CORE_SCHEDULER_STARTUP_TIMEOUT'));
 assert.equal(d.authorized_to_apply_migration,false);
});
test('V306 one healthy SQL read is not enough',()=>{
 const d=check({catalog,sqlProbes:sqlProbes.slice(0,1),receipts});
 assert.ok(d.blockers.includes('REPEATED_SQL_ADMISSION_NOT_PROVEN'));
});
test('V306 rejects stale, drifted and duplicate evidence',()=>{
 const cases=[{catalog:{...catalog,source_md5:'drift'},sqlProbes,receipts},
  {catalog:{...catalog,read_at:at(100)},sqlProbes,receipts},
  {catalog,sqlProbes,receipts:[receipts[0],receipts[0]]},
  {catalog,sqlProbes:[{...sqlProbes[0],checked_at:at(100)},sqlProbes[1]],receipts}];
 for(const item of cases)assert.equal(check(item).eligible_for_manual_v304_review,false);
});
test('V306 at best permits human review, never migration, checkout or trades',()=>{
 const d=check({catalog,sqlProbes,receipts});
 assert.equal(d.eligible_for_manual_v304_review,true);
 assert.equal(d.state,'ELIGIBLE_FOR_MANUAL_V304_REVIEW');
 assert.equal(d.authorized_to_apply_migration,false);
 assert.equal(d.db_stability_certified,false);
 assert.equal(d.commercial_launch_certified,false);
 assert.equal(d.live_trading_enabled,false);
 assert.equal(d.capital_permission,'0R');
 assert.equal(d.scheduler_modified,false);
});
