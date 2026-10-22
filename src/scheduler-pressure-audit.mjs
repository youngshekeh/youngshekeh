// V247: SCHEDULED START COLLISIONS ONLY, not actual DB concurrency.
// Pure, offline analysis. This module cannot access network, SQL or modify cron schedules.
function field(text,min,max){
 if(typeof text!=='string'||!text.length)throw Error('invalid_cron_field');
 const hits=new Set();
 for(const part of text.split(',')){
  const m=part.match(/^(\*|[0-9]+(?:-[0-9]+)?)(?:\/([0-9]+))?$/);
  if(!m)throw Error('unsupported_cron_expression:'+part);
  const unit=m[1];const step=m[2]?Number(m[2]):1;
  if(!Number.isSafeInteger(step)||step<1)throw Error('invalid_cron_step');
  let start,end;
  if(unit==='*'){start=min;end=max}
  else if(unit.includes('-')){[start,end]=unit.split('-').map(Number)}
  else {start=Number(unit);end=start;if(m[2])throw Error('unsupported_cron_step_singleton')}
  if(start<min||end>max||end<start)throw Error('out_of_range_cron_field');
  for(let n=start;n<=end;n+=step)hits.add(n);
 }
 return hits;
}
function activeAt(schedule,minute,hour,weekday){
 const fields=String(schedule).trim().split(/\s+/);
 if(fields.length!==5)throw Error('invalid_cron_schedule');
 // Snapshot has wildcard day/month and weekday-only schedules. Do not guess
 // cron DOM/DOW OR-semantics when both are restricted.
 const [minutes,hours,dom,month,dow]=fields;
 if(dom!=='*'||month!=='*')throw Error('unsupported_calendar_schedule');
 return field(minutes,0,59).has(minute)&&field(hours,0,23).has(hour)&&field(dow,0,6).has(weekday);
}
function validate(jobs){
 if(!Array.isArray(jobs)||jobs.length<1)throw Error('jobs_required');
 const ids=new Set();
 for(const job of jobs){
  if(!Number.isSafeInteger(job?.id)||job.id<1||ids.has(job.id))throw Error('invalid_or_duplicate_job_id');
  if(typeof job.name!=='string'||!job.name.trim())throw Error('job_name_required');
  ids.add(job.id);
  activeAt(job.schedule,0,0,0);
 }
 return jobs;
}
export function auditScheduledStarts(jobs,{hour=18,weekday=4}={}){
 validate(jobs);
 if(!Number.isInteger(hour)||hour<0||hour>23||!Number.isInteger(weekday)||weekday<0||weekday>6)throw Error('invalid_observation_clock');
 const slots=[];
 for(let minute=0;minute<60;minute++){
  const matching=jobs.filter(j=>activeAt(j.schedule,minute,hour,weekday)).map(j=>j.id);
  slots.push({minute,starts:matching.length,job_ids:matching});
 }
 const peak=Math.max(0,...slots.map(x=>x.starts));
 return Object.freeze({
  hour_utc:hour,weekday_utc:weekday,active_jobs:jobs.length,
  measure:'SCHEDULED_STARTS_ONLY',
  actual_concurrency_verified:false,
  causality_proven:false,
  peak_scheduled_starts:peak,
  busiest_minutes:slots.filter(x=>x.starts===peak).map(x=>x.minute),
  slots
 });
}
export function previewSingleScheduleShift(jobs,{jobId,newSchedule,hour=18,weekday=4}){
 validate(jobs);
 const old=jobs.find(j=>j.id===jobId);
 if(!old)throw Error('job_not_found');
 const oldParts=old.schedule.split(/\s+/),nextParts=String(newSchedule).split(/\s+/);
 if(oldParts.length!==5||nextParts.length!==5)throw Error('invalid_cron_schedule');
 if(oldParts.slice(1).join(' ')!==nextParts.slice(1).join(' '))
  throw Error('reject_hour_or_day_change');
 const count=sch=>Array.from({length:60},(_,m)=>activeAt(sch,m,hour,weekday)).filter(Boolean).length;
 if(count(old.schedule)!==count(newSchedule))throw Error('reject_frequency_change');
 const candidate=jobs.map(j=>j.id===jobId?{...j,schedule:newSchedule}:j);
 const before=auditScheduledStarts(jobs,{hour,weekday});
 const after=auditScheduledStarts(candidate,{hour,weekday});
 return Object.freeze({
  simulation_only:true,
  applied:false,
  preserve_job_count:candidate.length===jobs.length,
  preserve_identity_and_command:true,
  job_id:jobId,
  old_schedule:old.schedule,
  proposed_schedule:newSchedule,
  scheduled_runs_per_hour:count(old.schedule),
  baseline_peak:before.peak_scheduled_starts,
  proposed_peak:after.peak_scheduled_starts,
  minutes_before:before.slots.filter(x=>x.job_ids.includes(jobId)).map(x=>x.minute),
  minutes_after:after.slots.filter(x=>x.job_ids.includes(jobId)).map(x=>x.minute),
  uncertainty:'Only scheduled starts modeled; job runtimes, pooler, CPU and causality unverified',
  before,after
 });
}
