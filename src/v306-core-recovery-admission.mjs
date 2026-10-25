// V306: read-only release decision for core job 44. Never writes to SQL or triggers a job.
const EXPECTED_HASH='ad18646c899eaffd2e7f6dfae567ce71';
const EXPECTED_SCHEDULE='11,26,41,56 * * * *';
const EXPECTED_COMMAND='select public.refresh_autonomous_machine_state();';
const validDate=(s,now,maxAgeMs)=>{
  const time=Date.parse(String(s??''));
  return Number.isFinite(time)&&time<=now+60000&&now-time<=maxAgeMs;
};
export function assessCoreRecoveryAdmission({catalog,sqlProbes=[],receipts=[]}={},now=Date.now()){
  const blockers=[];
  const catalogMatch=catalog?.source_md5===EXPECTED_HASH && catalog?.cron_active===true
    && catalog?.cron_schedule===EXPECTED_SCHEDULE
    && catalog?.cron_name==='tfa-v70-autonomous-core'
    && catalog?.cron_command===EXPECTED_COMMAND;
  if(!catalogMatch) blockers.push('CORE_CATALOG_NOT_VERIFIED');
  if(!validDate(catalog?.read_at,now,15*60000))blockers.push('CATALOG_STALE_OR_MISSING');
  // Two distinct, recent successful SQL reads are a *transport sample*, never a DB stability guarantee.
  const reads=sqlProbes.filter(x=>x?.ok===true && x?.lock_waits===0
    && validDate(x?.checked_at,now,20*60000))
    .map(x=>Date.parse(x.checked_at)).sort((a,b)=>a-b);
  const separateReads=reads.length>=2 && reads.at(-1)-reads[0]>=120000;
  if(!separateReads) blockers.push('REPEATED_SQL_ADMISSION_NOT_PROVEN');
  const sorted=[...receipts].sort((a,b)=>Number(b?.runid||0)-Number(a?.runid||0));
  const validReceipts=sorted.length>=2 && sorted.every(x=>
    Number.isSafeInteger(x?.runid) && x.runid>0 && x.jobid===44 &&
    typeof x.status==='string' && validDate(x.start_time,now,45*60000)) &&
    new Set(sorted.map(x=>x.runid)).size===sorted.length;
  if(!validReceipts) blockers.push('RECENT_CORE_RECEIPTS_NOT_VERIFIED');
  const recent=validReceipts?sorted.slice(0,2):[];
  const twoSuccesses=recent.length===2 && recent.every(x=>x.status==='succeeded'
    && validDate(x.end_time,now,45*60000));
  if(!twoSuccesses) blockers.push('TWO_RECENT_SUCCESSFUL_CORE_RUNS_REQUIRED');
  const startupTimeout=sorted.slice(0,6).some(x=>x?.status==='failed'
    && /job startup timeout/i.test(String(x?.message??x?.return_message??'')));
  if(startupTimeout)blockers.push('CORE_SCHEDULER_STARTUP_TIMEOUT');
  const eligible=blockers.length===0;
  return Object.freeze({
    version:'v306-core-recovery-admission-v1',
    state:eligible?'ELIGIBLE_FOR_MANUAL_V304_REVIEW':'HOLD_CORE_RECOVERY',
    eligible_for_manual_v304_review:eligible,
    authorized_to_apply_migration:false,
    db_stability_certified:false,
    commercial_launch_certified:false,
    live_trading_enabled:false,
    capital_permission:'0R',
    scheduler_modified:false,
    blockers:Object.freeze(blockers)
  });
}
