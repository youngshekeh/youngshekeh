// V232 read-only admission plan for one cron phase shift. This module never writes SQL.
export const V232_TARGET=Object.freeze({
  jobid:17,jobname:'gold_spot_snapshot_capture',
  previous_schedule:'*/5 * * * 1-5',
  proposed_schedule:'1-59/5 * * * 1-5'
});
export const V232_PROTECTED=Object.freeze([
  {jobid:13,jobname:'gold-live-snapshot-5m'},
  {jobid:20,jobname:'gold_spot_shadow_capture'},
  {jobid:16,jobname:'live_markets_snapshot_capture'},
  {jobid:21,jobname:'gold_signal_resolution_finalize'},
  {jobid:39,jobname:'tfa-transactional-email-dispatch'},
  {jobid:95,jobname:'tfa-v136-gold-execution-firewall'}
]);
// A downstream shadow capture must not share any minute with source capture.
// Unsupported cron expressions fail closed rather than being assumed disjoint.
function minuteSlots(expression){
 const fields=String(expression||'').trim().split(/\s+/);
 if(fields.length!==5)return null;
 const slots=new Set();
 for(const segment of fields[0].split(',')){
   const pair=segment.split('/');
   if(pair.length>2)return null;
   const step=pair[1]===undefined?1:Number(pair[1]);
   if(!Number.isInteger(step)||step<1)return null;
   let low,high;
   if(pair[0]==='*'){low=0;high=59}
   else if(/^\d+-\d+$/.test(pair[0]))[low,high]=pair[0].split('-').map(Number);
   else if(/^\d+$/.test(pair[0]))low=high=Number(pair[0]);
   else return null;
   if(low<0||high>59||low>high)return null;
   for(let minute=low;minute<=high;minute+=step)slots.add(minute);
 }
 return slots;
}
function fresh(when,now){
 const n=Date.parse(String(when||''));
 return Number.isFinite(n)&&n<=now+1000&&now-n<=120000;
}
export function assessV232SnapshotPhase({jobs=[],seal=null,database=null,now=Date.now()}={}){
 const blockers=[];
 if(!database||database.transport_healthy!==true||!fresh(database.checked_at,now)
   ||!Number.isInteger(database.consecutive_successful_probes)
   ||database.consecutive_successful_probes<3||database.timeouts_last_10m!==0)
   blockers.push('DATABASE_CONNECTIVITY_NOT_STABLE');
 if(seal?.sealed!==true||seal?.verified_via_database!==true||!fresh(seal?.checked_at,now))
   blockers.push('DATABASE_SECURITY_SEAL_NOT_VERIFIED');
 const desired=[V232_TARGET,...V232_PROTECTED];
 if(!Array.isArray(jobs))jobs=[];
 for(const item of desired){
   const matching=jobs.filter(j=>j&&j.jobid===item.jobid&&j.jobname===item.jobname);
   if(matching.length!==1||matching[0].active!==true||typeof matching[0].schedule!=='string')
     blockers.push('UNVERIFIED_CRON_JOB_'+item.jobid);
   else if(item.jobid===V232_TARGET.jobid&&matching[0].schedule!==V232_TARGET.previous_schedule)
     blockers.push('TARGET_SCHEDULE_DRIFT');
 }
 const shadow=jobs.find(j=>j?.jobid===20&&j?.jobname==='gold_spot_shadow_capture');
 const proposed=minuteSlots(V232_TARGET.proposed_schedule);
 const shadowMinutes=minuteSlots(shadow?.schedule);
 if(shadow?.active!==true||!proposed||!shadowMinutes
   ||[...proposed].some(minute=>shadowMinutes.has(minute)))
   blockers.push('GOLD_SOURCE_SHADOW_PHASE_COLLISION');
 const target=jobs.find(j=>j?.jobid===V232_TARGET.jobid);
 const ready=blockers.length===0;
 return Object.freeze({
   version:'v232-snapshot-phase-admission-v1',
   state:ready?'PRECHECK_ELIGIBLE_MANUAL_SQL_REVIEW':'PHASE_MUTATION_BLOCKED',
   ready_for_manual_review:ready,
   applied:false,automatic_changes_enabled:false,
   target:V232_TARGET,
   observed_schedule:target?.schedule??null,
   proposal:'Shift only job 17 Gold spot capture by +1 minute, preserving its weekday 5-minute frequency and all jobs active.',
   blockers:Object.freeze(blockers),
   governance:Object.freeze({action_permitted:'WAIT',capital_permission:'0R',
     live_order_submission_enabled:false,automated_scheduler_mutation:false,
     payment_enabled:false,security_seal_bypass:false})
 });
}
