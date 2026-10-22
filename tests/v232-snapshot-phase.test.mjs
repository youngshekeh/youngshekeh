import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {assessV232SnapshotPhase,V232_TARGET,V232_PROTECTED} from '../src/v232-snapshot-phase.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const NOW=Date.parse('2026-10-22T08:00:00Z'),at=new Date(NOW-1000).toISOString();
function sample(){
 return {now:NOW,database:{transport_healthy:true,checked_at:at,consecutive_successful_probes:3,timeouts_last_10m:0},
 seal:{sealed:true,verified_via_database:true,checked_at:at},
 jobs:[{...V232_TARGET,active:true,schedule:V232_TARGET.previous_schedule},
 ...V232_PROTECTED.map(x=>({...x,active:true,schedule:'*/5 * * * *'}))]};
}
test('only single Gold spot cron is proposed, others protected',()=>{
 const s=assessV232SnapshotPhase(sample());
 assert.equal(s.ready_for_manual_review,true);assert.equal(s.applied,false);
 assert.equal(s.target.jobid,17);assert.equal(s.target.proposed_schedule,'1-59/5 * * * 1-5');
 assert.equal(s.governance.automated_scheduler_mutation,false);
 assert.equal(s.governance.capital_permission,'0R');
});
test('unverified seal or read timeout blocks schedule mutation',()=>{
 for(const x of [
  {seal:{sealed:false,verified_via_database:true,checked_at:at}},
  {seal:{sealed:true,verified_via_database:false,checked_at:at}},
  {database:{...sample().database,timeouts_last_10m:1}},
  {database:{...sample().database,consecutive_successful_probes:2}}
 ]){
  const s=assessV232SnapshotPhase({...sample(),...x});
  assert.equal(s.ready_for_manual_review,false);
 }
});
test('stale evidence and altered target schedule remain blocked',()=>{
 const old=new Date(NOW-600000).toISOString();
 assert.equal(assessV232SnapshotPhase({...sample(),database:{...sample().database,checked_at:old}}).ready_for_manual_review,false);
 const x=sample();x.jobs.find(y=>y.jobid===17).schedule='9-59/10 * * * 1-5';
 assert.equal(assessV232SnapshotPhase(x).ready_for_manual_review,false);
});
test('unknown or disabled protected critical job prohibits changes',()=>{
 const x=sample();x.jobs.find(y=>y.jobid===95).active=false;
 assert.equal(assessV232SnapshotPhase(x).ready_for_manual_review,false);
 const y=sample();y.jobs=y.jobs.filter(z=>z.jobid!==21);
 assert.equal(assessV232SnapshotPhase(y).ready_for_manual_review,false);
});
test('SQL apply is single-job atomic, preserves activity and checks real database seal',()=>{
 const s=read('supabase/recovery/v232-gold-spot-snapshot-phase-apply.sql');
 assert.match(s,/begin;/i);assert.match(s,/commit;/i);
 assert.match(s,/pg_try_advisory_xact_lock/);
 assert.match(s,/v_seal:=public\.command_kernel_seal_status\(\)/);
 assert.match(s,/if v_count<>6/);
 assert.match(s,/cron\.alter_job\(17,schedule := '1-59\/5 \* \* \* 1-5'\)/);
 assert.equal((s.match(/cron\.alter_job\(/g)||[]).length,1);
 assert.doesNotMatch(s,/active\s*:=\s*false|pg_terminate_backend|ALTER SYSTEM|execute_trade|create-checkout|drop table/i);
});
test('rollback can only restore preserved original schedule with fingerprint check',()=>{
 const s=read('supabase/recovery/v232-gold-spot-snapshot-phase-rollback.sql');
 assert.match(s,/command_fingerprint/);assert.match(s,/previous_schedule/);
 assert.match(s,/rollback_drift_manual_review_required/);
 assert.match(s,/cron\.alter_job\(b\.jobid,schedule := b\.previous_schedule\)/);
 assert.doesNotMatch(s,/active\s*:=|pg_terminate_backend|drop table/i);
});
test('existing launch and money safeguards are not changed',()=>{
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(read('supabase/functions/runtime-v180-continuous-kernel/index.ts'),/const seal=await requireKernelSeal\(\)/);
});
