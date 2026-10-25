// V309 · pure offline pg_cron scheduled-start and observed-run audit.
// No database/network access. A scheduled start is NOT a concurrent running job.
const VALID_STATUSES=new Set(['succeeded','failed','running']);
const asTime=x=>Date.parse(String(x??''));
const recent=(x,now,maxAge)=>{const t=asTime(x);return Number.isFinite(t)&&t<=now+60000&&now-t<=maxAge};
function readField(value,low,high,{weekday=false}={}){
 if(typeof value!=='string'||value.length>80||!/^[*0-9,/ -]+$/.test(value))return null;
 const found=new Set();
 for(const expression of value.split(',')){
  const parts=expression.split('/');
  if(parts.length>2)return null;
  const step=parts.length===2?Number(parts[1]):1;
  if(!Number.isSafeInteger(step)||step<1||step>high-low+1)return null;
  const base=parts[0],edges=base==='*'?[low,high]:
    /^\d+-\d+$/.test(base)?base.split('-').map(Number):
    /^\d+$/.test(base)?[Number(base),Number(base)]:null;
  if(!edges||edges.some(n=>!Number.isSafeInteger(n)||n<low||n>high)
    ||edges[0]>edges[1])return null;
  for(let n=edges[0];n<=edges[1];n+=step)found.add(weekday&&n===7?0:n);
 }
 return found.size?found:null;
}
export function auditNominalCronStarts(jobs=[]){
 const fail=reason=>Object.freeze({ok:false,state:'SCHEDULE_MODEL_UNVERIFIED',
  reason,nominal_peak_starts:null,actual_concurrent_jobs_certified:false,
  safe_to_reschedule:false,commercial_launch_certified:false});
 if(!Array.isArray(jobs)||jobs.length===0||jobs.length>512)return fail('CATALOG_MISSING_OR_OVERSIZED');
 const included=[],seen=new Set();
 for(const job of jobs){
  if(!Number.isSafeInteger(job?.jobid)||job.jobid<1||seen.has(job.jobid)
    ||typeof job.schedule!=='string')return fail('CATALOG_JOB_INVALID_OR_DUPLICATE');
  seen.add(job.jobid);
  if(job.active!==true){if(job.active!==false)return fail('ACTIVE_STATE_UNVERIFIED');continue;}
  const fields=job.schedule.trim().split(/\s+/);
  if(fields.length!==5||fields[2]!=='*'||fields[3]!=='*')
   return fail('CALENDAR_EXPRESSION_UNSUPPORTED');
  const minute=readField(fields[0],0,59),
   hour=readField(fields[1],0,23),
   weekday=readField(fields[4],0,7,{weekday:true});
  if(!minute||!hour||!weekday)return fail('CRON_EXPRESSION_UNSUPPORTED');
  included.push({jobid:job.jobid,minute,hour,weekday});
 }
 if(!included.length)return fail('NO_ACTIVE_JOBS');
 let max=0,peak=null;
 for(let d=0;d<7;d++)for(let h=0;h<24;h++)for(let m=0;m<60;m++){
  const starts=included.filter(j=>j.weekday.has(d)&&j.hour.has(h)&&j.minute.has(m));
  if(starts.length>max){
   max=starts.length;
   peak={weekday:d,hour:h,minute:m,jobids:starts.map(j=>j.jobid)};
  }
 }
 return Object.freeze({ok:true,state:'NOMINAL_SCHEDULE_STARTS_ONLY',
  jobs_in_catalog:jobs.length,active_jobs:included.length,nominal_peak_starts:max,
  peak_example:peak,actual_concurrent_jobs_certified:false,
  running_overlap_or_disk_io_measured:false,
  safe_to_reschedule:false,commercial_launch_certified:false});
}

export function auditRecentCronRuns({runs=[],observed_at,expected_limit=240}={},now=Date.now()){
 const blockers=[];
 if(!Number.isSafeInteger(expected_limit)||expected_limit<120||expected_limit>500)
   blockers.push('SAMPLE_LIMIT_INVALID');
 if(!recent(observed_at,now,5*60000))blockers.push('READ_RECEIPT_STALE_OR_MISSING');
 const validArray=Array.isArray(runs)&&runs.length===expected_limit;
 if(!validArray)blockers.push('BOUNDED_RUN_SAMPLE_INCOMPLETE');
 const ordered=Array.isArray(runs)?runs:[],seen=new Set();
 let valid=validArray;
 for(const x of ordered){
  const start=asTime(x?.start_time);
  if(!Number.isSafeInteger(x?.runid)||x.runid<=0||seen.has(x.runid)
    ||!Number.isSafeInteger(x?.jobid)||x.jobid<=0
    ||!VALID_STATUSES.has(x?.status)||!Number.isFinite(start)
    ||start>now+60000||now-start>3*60*60*1000
    ||(x.status==='succeeded'&&(!Number.isFinite(asTime(x.end_time))
      ||asTime(x.end_time)<start||asTime(x.end_time)>now+60000))){valid=false;break;}
  seen.add(x.runid);
 }
 if(!valid)blockers.push('INVALID_OR_DUPLICATE_CRON_RECEIPTS');
 // Use exact descending runid sample as an untruncated latest-run view;
 // timestamps may be out of order for overlapping jobs.
 const descending=ordered.every((x,i)=>i===0||x.runid<ordered[i-1].runid);
 if(!descending)blockers.push('LATEST_RUNID_ORDER_NOT_PROVEN');
 const newestTime=Math.max(...ordered.map(x=>asTime(x.start_time)).filter(Number.isFinite));
 const oldestTime=Math.min(...ordered.map(x=>asTime(x.start_time)).filter(Number.isFinite));
 if(!Number.isFinite(newestTime)||newestTime<now-5*60000||
    !Number.isFinite(oldestTime)||oldestTime>now-30*60000)
   blockers.push('THIRTY_MINUTE_COVERAGE_NOT_PROVEN');
 const current=valid&&descending?ordered.filter(x=>asTime(x.start_time)>=now-30*60000):[];
 if(current.length<20)blockers.push('INSUFFICIENT_RECENT_JOB_ATTEMPTS');
 const failures=current.filter(x=>x.status==='failed');
 const startup=current.filter(x=>x.status==='failed'&&
  /job startup timeout/i.test(String(x.return_message??x.message??'')));
 const running=current.filter(x=>x.status==='running');
 const successes=current.filter(x=>x.status==='succeeded');
 if(startup.length)blockers.push('STARTUP_TIMEOUTS_STILL_PRESENT');
 if(failures.length||running.length)blockers.push('NOT_ALL_RECENT_ATTEMPTS_COMPLETED_SUCCESSFULLY');
 const eligible=blockers.length===0;
 return Object.freeze({version:'v309-offline-scheduler-reliability-v1',
  state:eligible?'ELIGIBLE_FOR_INDEPENDENT_PRIVATE_RETEST':'HOLD_SCHEDULER_RELIABILITY',
  eligible_for_independent_private_retest:eligible,
  sample_size:ordered.length,
  sample_coverage_verified:valid&&descending&&
    Number.isFinite(newestTime)&&newestTime>=now-5*60000&&
    Number.isFinite(oldestTime)&&oldestTime<=now-30*60000,
  recent_30m:Object.freeze({attempts:current.length,successes:successes.length,
   failures:failures.length,startup_timeouts:startup.length,running:running.length}),
  db_stability_certified:false,private_kernel_certified:false,
  authorized_to_modify_cron:false,authorized_to_apply_migration:false,
  commercial_launch_certified:false,live_trading_enabled:false,
  capital_permission:'0R',blockers:Object.freeze(blockers)});
}
