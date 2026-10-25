import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditNominalCronStarts,auditRecentCronRuns} from '../src/v309-scheduler-reliability-audit.mjs';
const at=Date.parse('2026-10-25T14:40:00Z');
const iso=ms=>new Date(at-ms).toISOString();
// Fixed non-sensitive snapshot of the 58 active cron schedules observed Oct 25.
// This proves calendar-start arithmetic for the captured version; NOT current production execution.
const observed=String.raw`13|*/5 * * * 1-5
16|*/5 * * * 1-5
17|*/5 * * * 1-5
37|0 13 * * *
3|0 6 * * *
35|0 9 * * *
22|0-59/10 * * * *
77|0-59/30 * * * *
23|1-59/10 * * * *
20|1-59/5 * * * 1-5
38|10 13 * * *
15|10 21 * * 1-5
36|10 9 * * *
73|10-59/15 * * * *
44|11,26,41,56 * * * *
26|12 * * * *
51|12 * * * *
75|13-59/15 * * * *
43|13,43 * * * *
58|14 * * * *
50|14-59/15 * * * *
18|15 21 * * 1-5
67|16 * * * *
4|17 * * *
93|17 * * *
8|19 * * *
24|2-59/10 * * * *
21|2-59/5 * * * 1-5
48|2,17,32,47 * * * *
34|22 */6 * * *
5|22 5 * * *
10|23 * * * *
27|27 * * * *
59|27 * * * *
60|29 * * * *
29|29 6-14 * * 1-5
61|3-59/10 * * * *
33|3-59/5 * * * *
2|30 5 * * *
7|35 * * * *
42|35 5 * * *
62|4-59/10 * * * *
39|4-59/5 * * * *
11|40 6 * * 1
12|45 * * * *
31|47 * * * *
40|49 * * * *
1|5 */6 * * *
68|5-59/10 * * * *
28|59 5 * * 1-5
78|6-59/10 * * * *
30|6,21,36,51 * * * *
79|7-59/10 * * * *
41|7,22,37,52 * * * *
6|7,27,47 * * * *
81|8-59/10 * * * *
32|8,23,38,53 * * * *
95|9-59/10 * * * *`.trim().split('
').map(line=>{
 const [id,schedule]=line.split('|');
 return {jobid:Number(id),schedule,active:true};
});
const runs=Array.from({length:240},(_,i)=>({
 runid:9000-i,jobid:1+(i%40),status:'succeeded',
 start_time:iso(60000+i*20000),end_time:iso(55000+i*20000),
 return_message:''
}));
const snapshot={runs,observed_at:iso(30000)};
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('V309 observed 58 active cron schedules have nominal peak six starts/minute, not 58',()=>{
 assert.equal(observed.length,58);
 const v=auditNominalCronStarts(observed);
 assert.equal(v.ok,true);
 assert.equal(v.active_jobs,58);
 assert.equal(v.nominal_peak_starts,6);
 assert.equal(v.actual_concurrent_jobs_certified,false);
 assert.equal(v.running_overlap_or_disk_io_measured,false);
 assert.equal(v.safe_to_reschedule,false);
 assert.equal(v.commercial_launch_certified,false);
 assert.equal(observed.find(x=>x.jobid===44)?.schedule,'11,26,41,56 * * * *');
});
test('V309 unknown calendar grammar and job duplicates refuse nominal schedule conclusions',()=>{
 for(const cases of [
  [],[{jobid:1,active:true,schedule:'@hourly'}],
  [{jobid:1,active:true,schedule:'0 1 15 * *'}],
  [{jobid:1,active:true,schedule:'0 1 * * *'}, {jobid:1,active:true,schedule:'0 2 * * *'}],
  [{jobid:1,active:true,schedule:'0 1 * * MON'}],
  [{jobid:1,active:'yes',schedule:'0 1 * * *'}]
 ]){
  const v=auditNominalCronStarts(cases);
  assert.equal(v.ok,false);
  assert.equal(v.nominal_peak_starts,null);
 }
});
test('V309 synthetic bounded 240 success sample permits retesting only',()=>{
 const v=auditRecentCronRuns(snapshot,at);
 assert.equal(v.sample_size,240);
 assert.equal(v.sample_coverage_verified,true);
 assert.equal(v.recent_30m.startup_timeouts,0);
 assert.equal(v.eligible_for_independent_private_retest,true);
 assert.equal(v.state,'ELIGIBLE_FOR_INDEPENDENT_PRIVATE_RETEST');
 assert.equal(v.db_stability_certified,false);
 assert.equal(v.private_kernel_certified,false);
 assert.equal(v.authorized_to_modify_cron,false);
 assert.equal(v.authorized_to_apply_migration,false);
 assert.equal(v.commercial_launch_certified,false);
 assert.equal(v.live_trading_enabled,false);
 assert.equal(v.capital_permission,'0R');
});
test('V309 real-count-shaped 191 startup errors in 240 bounded run fixture MUST HOLD',()=>{
 const failures=runs.map((x,i)=>i<191?{...x,status:'failed',
  return_message:'job startup timeout'}:i<200?{...x,status:'failed',
  return_message:'statement timeout'}:x);
 const v=auditRecentCronRuns({...snapshot,runs:failures},at);
 assert.equal(failures.filter(x=>x.status==='failed').length,200);
 assert.equal(failures.filter(x=>x.return_message==='job startup timeout').length,191);
 assert.equal(v.eligible_for_independent_private_retest,false);
 assert.ok(v.blockers.includes('STARTUP_TIMEOUTS_STILL_PRESENT'));
 assert.equal(v.authorized_to_apply_migration,false);
});
test('V309 rejects stale, incomplete, duplicate, unordered or uncovered snapshots',()=>{
 const scenarios=[
  {...snapshot,runs:runs.slice(0,25)},
  {...snapshot,observed_at:iso(20*60000)},
  {...snapshot,runs:[runs[0],runs[0],...runs.slice(2)]},
  {...snapshot,runs:[runs[1],runs[0],...runs.slice(2)]},
  {...snapshot,runs:runs.map((x,i)=>({...x,start_time:iso(60000+i*1000)}))}
 ];
 for(const x of scenarios){
  const v=auditRecentCronRuns(x,at);
  assert.equal(v.eligible_for_independent_private_retest,false);
  assert.equal(v.commercial_launch_certified,false);
 }
});
test('V309 preserves protected core schedule and payment restrictions',()=>{
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(read('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
 assert.match(read('src/v306-core-recovery-admission.mjs'),/EXPECTED_SCHEDULE='11,26,41,56 * * * *'/);
 assert.match(read('src/v307-heartbeat-incident-admission.mjs'),/certified_private_kernel:false/);
 assert.doesNotMatch(read('src/v309-scheduler-reliability-audit.mjs'),
  /cron.alter_job|cron.unschedule|pg_terminate_backend|execute_trade|create-checkout/);
});
