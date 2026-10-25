// V306.1: manual, read-only core recovery admission. Never SQL, cron, checkout or trade writes.
// Operator observations are inputs, NOT cryptographically certified audit evidence.
const EXPECTED_HASH='ad18646c899eaffd2e7f6dfae567ce71';
const EXPECTED_SCHEDULE='11,26,41,56 * * * *';
const EXPECTED_COMMAND='select public.refresh_autonomous_machine_state();';
const timestamp=(v)=>Date.parse(String(v??''));
const recent=(value,now,maxAge)=>{
  const t=timestamp(value);
  return Number.isFinite(t)&&t<=now+60000&&now-t<=maxAge;
};
export function assessCoreRecoveryAdmission({
  catalog,sqlProbes=[],receipts=[],schedulerEvidence
}={},now=Date.now()){
  const blockers=[];
  const catalogMatch=catalog?.source_md5===EXPECTED_HASH && catalog?.cron_active===true
    && catalog?.cron_schedule===EXPECTED_SCHEDULE
    && catalog?.cron_name==='tfa-v70-autonomous-core'
    && catalog?.cron_command===EXPECTED_COMMAND;
  if(!catalogMatch)blockers.push('CORE_CATALOG_NOT_VERIFIED');
  if(!recent(catalog?.read_at,now,15*60000))blockers.push('CATALOG_STALE_OR_MISSING');

  // Two successful *independent and separated* SQL receipts are a point-in-time
  // transport observation. They cannot prove provider uptime, Auth or database safety.
  const reads=Array.isArray(sqlProbes)?sqlProbes.filter(x=>x?.ok===true && x?.lock_waits===0
    && recent(x?.checked_at,now,20*60000)).map(x=>timestamp(x.checked_at)).sort((a,b)=>a-b):[];
  const separateReads=reads.length>=2 && reads.at(-1)-reads[0]>=120000
    && now-reads.at(-1)<=5*60000;
  if(!separateReads)blockers.push('REPEATED_SQL_ADMISSION_NOT_PROVEN');

  // Require a bounded *complete* sample of at least six actual recent job 44
  // results: checking just two successes hides failures in the intervening runs.
  const rows=Array.isArray(receipts)?[...receipts]:[];
  const sorted=rows.sort((a,b)=>Number(b?.runid||0)-Number(a?.runid||0));
  const validReceipts=sorted.length>=6 && sorted.every(x=>
    Number.isSafeInteger(x?.runid) && x.runid>0 && x.jobid===44
    && typeof x.status==='string' && recent(x.start_time,now,2*60*60000))
    && new Set(sorted.map(x=>x.runid)).size===sorted.length
    && recent(sorted[0].start_time,now,25*60000);
  if(!validReceipts)blockers.push('COMPLETE_RECENT_CORE_HISTORY_NOT_VERIFIED');
  const latest=validReceipts?sorted.slice(0,2):[];
  if(!(latest.length===2 && latest.every(x=>x.status==='succeeded'
    && recent(x.end_time,now,45*60000))))
    blockers.push('TWO_RECENT_SUCCESSFUL_CORE_RUNS_REQUIRED');
  if(sorted.some(x=>x?.status==='failed'
    && /job startup timeout/i.test(String(x?.message??x?.return_message??''))))
    blockers.push('CORE_SCHEDULER_STARTUP_TIMEOUT');

  // The verified incident affected several DIFFERENT cron jobs, not just 44.
  // Require a recent, full-window external log summary before even manual review.
  // Never interpret absent logs, empty receipts or partial results as zero failures.
  const s=schedulerEvidence;
  const logWindowValid=s?.source==='SUPABASE_POSTGRES_LOGS'
    && s?.complete===true && recent(s?.checked_at,now,10*60000)
    && recent(s?.window_start,now,60*60000)
    && timestamp(s.checked_at)-timestamp(s.window_start)>=10*60000
    && Array.isArray(s?.startup_timeout_job_ids)
    && s.startup_timeout_job_ids.every(id=>Number.isSafeInteger(id)&&id>0)
    // V311: a "complete" but empty log response cannot prove coverage.
    // Unique job IDs cannot outnumber events or contain duplicate IDs.
    // This is only a structural sanity check; external logs still need review.
    && Number.isSafeInteger(s?.sampled_events)&&s.sampled_events>0
    && s.startup_timeout_job_ids.length<=s.sampled_events
    && new Set(s.startup_timeout_job_ids).size===s.startup_timeout_job_ids.length;
  if(!logWindowValid)blockers.push('GLOBAL_SCHEDULER_LOG_COVERAGE_NOT_VERIFIED');
  if(logWindowValid&&s.startup_timeout_job_ids.length>0)
    blockers.push('GLOBAL_SCHEDULER_STARTUP_FAILURES');

  const eligible=blockers.length===0;
  return Object.freeze({
    version:'v306.1-core-recovery-admission-v1',
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
