#!/usr/bin/env node
// V247 read-only local audit, deliberately no DB client or network calls.
import {readFileSync} from 'node:fs';
import {auditScheduledStarts,previewSingleScheduleShift} from '../src/scheduler-pressure-audit.mjs';
const file=process.argv[2]||'docs/operations/data/v247-cron-job-schedules-2026-10-22.json';
if(!file.startsWith('docs/operations/data/')||!file.endsWith('.json')){
 console.error('V247 requires a local audited docs/operations/data/*.json snapshot');
 process.exitCode=2;
}else{
 try{
  const snapshot=JSON.parse(readFileSync(file,'utf8'));
  if(snapshot.snapshot_only!==true||snapshot.active_job_count!==snapshot.jobs?.length)
    throw Error('unverified_or_malformed_snapshot');
  const baseline=auditScheduledStarts(snapshot.jobs);
  const proposed=previewSingleScheduleShift(snapshot.jobs,{jobId:16,newSchedule:'3-59/5 * * * 1-5'});
  const summary={
   version:'v247-scheduler-pressure-audit-v1',
   source:snapshot.source,observed_at_utc:snapshot.observed_at_utc,
   evidence_type:'STATIC_CRON_SCHEDULE',jobs:snapshot.active_job_count,
   baseline:{peak_scheduled_starts:baseline.peak_scheduled_starts,
    busiest_minutes:baseline.busiest_minutes,
    minute_0:baseline.slots[0],minute_3:baseline.slots[3]},
   counterfactual:{
    job_id:proposed.job_id,old_schedule:proposed.old_schedule,
    proposed_schedule:proposed.proposed_schedule,
    scheduled_runs_per_hour:proposed.scheduled_runs_per_hour,
    simulated_peak:proposed.proposed_peak,
    minute_0:proposed.after.slots[0],minute_3:proposed.after.slots[3],
    change_applied:false
   },
   guardrails:{
    cron_modified:false,orders_enabled:false,capital_permission:'0R',
    no_claim_of_measured_concurrency:true,requires_private_runtime_verification:true
   }
  };
  console.log(JSON.stringify(summary,null,2));
 }catch(err){
  console.error('V247 audit unavailable:',String(err?.message||err));
  process.exitCode=1;
 }
}
