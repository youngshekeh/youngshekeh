#!/usr/bin/env node
// V309 operator-only: stdin JSON in, aggregate JSON out. NO network, writes or DB calls.
// Usage: node scripts/v309-review-cron-evidence.mjs < local-private-evidence.json
import {readFileSync} from 'node:fs';
import {auditNominalCronStarts,auditRecentCronRuns}
 from '../src/v309-scheduler-reliability-audit.mjs';

const WAIT={action_permitted:'WAIT',capital_permission:'0R',
  live_order_submission_enabled:false,commercial_launch_certified:false,
  autonomous_machine_certified:false};
try{
 const content=readFileSync(0,'utf8');
 if(content.length>1024*1024)throw new Error('EVIDENCE_TOO_LARGE');
 const evidence=JSON.parse(content);
 if(!evidence||typeof evidence!=='object'||Array.isArray(evidence))
  throw new Error('EVIDENCE_NOT_OBJECT');
 const schedule=auditNominalCronStarts(evidence.jobs);
 const runReliability=auditRecentCronRuns({
  runs:evidence.runs,
  observed_at:evidence.observed_at,
  expected_limit:evidence.expected_limit??240
 });
 console.log(JSON.stringify({version:'v309-offline-recovery-evidence-v1',
  schedule,run_reliability:runReliability,governance:WAIT},null,2));
 if(!schedule.ok||!runReliability.eligible_for_independent_private_retest)
  process.exitCode=2;
}catch{
 console.log(JSON.stringify({version:'v309-offline-recovery-evidence-v1',
   ok:false,state:'EVIDENCE_INPUT_UNVERIFIED',
   governance:WAIT},null,2));
 process.exitCode=2;
}
