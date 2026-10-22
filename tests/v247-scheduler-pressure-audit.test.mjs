import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditScheduledStarts,previewSingleScheduleShift} from '../src/scheduler-pressure-audit.mjs';
const data=JSON.parse(readFileSync(new URL('../docs/operations/data/v247-cron-job-schedules-2026-10-22.json',import.meta.url),'utf8'));
test('snapshot contains 58 unique active cron schedules from read-only observation',()=>{
 assert.equal(data.snapshot_only,true);
 assert.equal(data.active_job_count,58);
 assert.equal(data.jobs.length,58);
 assert.equal(new Set(data.jobs.map(x=>x.id)).size,58);
});
test('18 UTC Thursday has all three overlapping 5-minute market collectors',()=>{
 const a=auditScheduledStarts(data.jobs);
 const slot=a.slots[0];
 assert.ok([13,16,17].every(id=>slot.job_ids.includes(id)));
 assert.equal(a.measure,'SCHEDULED_STARTS_ONLY');
 assert.equal(a.actual_concurrency_verified,false);
 assert.equal(a.causality_proven,false);
});
test('weekend excludes weekday market collectors without excluding enterprise webhook',()=>{
 const a=auditScheduledStarts(data.jobs,{weekday:0});
 assert.ok(!a.slots[0].job_ids.includes(16));
 assert.ok(a.slots[3].job_ids.includes(33));
});
test('canary scenario is counterfactual, retains frequency, does not mutate snapshot',()=>{
 const before=JSON.stringify(data.jobs);
 const p=previewSingleScheduleShift(data.jobs,{jobId:16,newSchedule:'3-59/5 * * * 1-5'});
 assert.equal(p.applied,false);
 assert.equal(p.scheduled_runs_per_hour,12);
 assert.equal(p.preserve_job_count,true);
 assert.equal(p.baseline_peak>=p.proposed_peak,true);
 assert.equal(p.minutes_before[0],0);
 assert.equal(p.minutes_after[0],3);
 assert.equal(JSON.stringify(data.jobs),before);
});
test('proposed schedule must not change day/hour/cadence or remove jobs',()=>{
 assert.throws(()=>previewSingleScheduleShift(data.jobs,{jobId:16,newSchedule:'3-59/6 * * * 1-5'}),/reject_frequency_change/);
 assert.throws(()=>previewSingleScheduleShift(data.jobs,{jobId:16,newSchedule:'3-59/5 * * * *'}),/reject_hour_or_day_change/);
 assert.throws(()=>previewSingleScheduleShift(data.jobs,{jobId:999,newSchedule:'3-59/5 * * * 1-5'}),/job_not_found/);
});
test('unrecognized expressions and duplicate IDs fail closed',()=>{
 assert.throws(()=>auditScheduledStarts([{id:1,name:'A',schedule:'@hourly'}]),/invalid_cron_schedule/);
 assert.throws(()=>auditScheduledStarts([{id:1,name:'A',schedule:'* * * * *'},{id:1,name:'B',schedule:'* * * * *'}]),/invalid_or_duplicate_job_id/);
 assert.throws(()=>auditScheduledStarts([{id:1,name:'A',schedule:'5 5 1 * *'}]),/unsupported_calendar_schedule/);
});
test('no SQL mutation, network, credentials, capital release or CLI hidden side effects',()=>{
 const source=readFileSync(new URL('../src/scheduler-pressure-audit.mjs',import.meta.url),'utf8');
 const cli=readFileSync(new URL('../scripts/v247-cron-collision-audit.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source+cli,/cron\.alter_job|cron\.unschedule|cron\.schedule\(|ALTER SYSTEM|pg_terminate_backend|fetch\(|process\.env|SUPABASE_DB_URL/);
 assert.match(cli,/cron_modified:false,orders_enabled:false,capital_permission:'0R'/);
});
