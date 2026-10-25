import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCoreRecoveryAdmission} from '../src/v306-core-recovery-admission.mjs';
const now=Date.parse('2026-10-25T13:35:00Z');
const at=n=>new Date(now-n*60000).toISOString();
const catalog={source_md5:'ad18646c899eaffd2e7f6dfae567ce71',cron_active:true,
 cron_schedule:'11,26,41,56 * * * *',cron_name:'tfa-v70-autonomous-core',
 cron_command:'select public.refresh_autonomous_machine_state();',read_at:at(1)};
const sqlProbes=[{ok:true,lock_waits:0,checked_at:at(5)},{ok:true,lock_waits:0,checked_at:at(1)}];
const receipts=Array.from({length:6},(_,i)=>({runid:300-i,jobid:44,
 status:'succeeded',start_time:at(4+15*i),end_time:at(3+15*i)}));
const schedulerEvidence={source:'SUPABASE_POSTGRES_LOGS',complete:true,checked_at:at(1),
 window_start:at(16),startup_timeout_job_ids:[],sampled_events:45};
const ready={catalog,sqlProbes,receipts,schedulerEvidence};
const check=x=>assessCoreRecoveryAdmission(x,now);
test('V306.1 multi-job startup timeouts bar manual V304 review',()=>{
 const d=check({...ready,schedulerEvidence:{...schedulerEvidence,startup_timeout_job_ids:[6,27,59,79]}});
 assert.equal(d.eligible_for_manual_v304_review,false);
 assert.ok(d.blockers.includes('GLOBAL_SCHEDULER_STARTUP_FAILURES'));
 assert.equal(d.authorized_to_apply_migration,false);
});
test('V306.1 job 44 startup failure blocks, even when other jobs healthy',()=>{
 const failures=receipts.map((r,i)=>i<2?{...r,status:'failed',message:'job startup timeout'}:r);
 const d=check({...ready,receipts:failures});
 assert.ok(d.blockers.includes('CORE_SCHEDULER_STARTUP_TIMEOUT'));
 assert.ok(d.blockers.includes('TWO_RECENT_SUCCESSFUL_CORE_RUNS_REQUIRED'));
});
test('V306.1 one successful SQL probe is insufficient',()=>{
 assert.ok(check({...ready,sqlProbes:sqlProbes.slice(0,1)}).blockers.includes('REPEATED_SQL_ADMISSION_NOT_PROVEN'));
});
test('V306.1 absent, partial or stale global logs do not certify recovery',()=>{
 for(const s of [null,{}, {...schedulerEvidence,complete:false},
  {...schedulerEvidence,checked_at:at(40)},
  {...schedulerEvidence,window_start:at(5)},
  {...schedulerEvidence,startup_timeout_job_ids:'none'},
  {...schedulerEvidence,source:'UNVERIFIED'},
  {...schedulerEvidence,sampled_events:-1}]){
  const d=check({...ready,schedulerEvidence:s});
  assert.ok(d.blockers.includes('GLOBAL_SCHEDULER_LOG_COVERAGE_NOT_VERIFIED'));
  assert.equal(d.eligible_for_manual_v304_review,false);
 }
});
test('V306.1 reject stale, drifted, duplicate or incomplete core history',()=>{
 for(const item of [
  {...ready,catalog:{...catalog,source_md5:'drift'}},
  {...ready,catalog:{...catalog,read_at:at(100)}},
  {...ready,receipts:[receipts[0],receipts[0],...receipts.slice(2)]},
  {...ready,receipts:receipts.slice(0,2)},
  {...ready,receipts:receipts.map((r,i)=>i===0?{...r,jobid:19}:r)}
 ])assert.equal(check(item).eligible_for_manual_v304_review,false);
});
test('V306.1 at most permits review, never migration, billing or trading',()=>{
 const d=check(ready);
 assert.equal(d.eligible_for_manual_v304_review,true);
 assert.equal(d.state,'ELIGIBLE_FOR_MANUAL_V304_REVIEW');
 assert.equal(d.authorized_to_apply_migration,false);
 assert.equal(d.db_stability_certified,false);
 assert.equal(d.commercial_launch_certified,false);
 assert.equal(d.live_trading_enabled,false);
 assert.equal(d.capital_permission,'0R');
 assert.equal(d.scheduler_modified,false);
});
