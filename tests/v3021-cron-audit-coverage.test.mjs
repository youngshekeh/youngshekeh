import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {admitRecentCronFailureCount,CRON_AUDIT_MAX_RUNS,CRON_AUDIT_WINDOW_MS}
 from '../src/v3021-cron-audit-coverage.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const NOW=Date.parse('2026-10-25T11:00:00Z');
test('V302.1 count admitted only when indexed runID history strictly covers 2h',()=>{
 for(const hours of [2.01,4,26]){
  const x=admitRecentCronFailureCount({nowMs:NOW,boundaryMs:NOW-hours*3600000,failedCount:17,inspectedRuns:884});
  assert.equal(x.ok,true);assert.equal(x.failed_2h,17);
  assert.equal(x.commercial_launch_certified,false);assert.equal(x.capital_permission,'0R');
 }
});
test('V302.1 missing or time-truncated history never becomes zero failures',()=>{
 for(const boundaryMs of [NOW-2*3600000,NOW-1*3600000,NOW+1000,undefined]){
  const x=admitRecentCronFailureCount({nowMs:NOW,boundaryMs,failedCount:0,inspectedRuns:900});
  assert.equal(x.ok,false);assert.equal(x.failed_2h,null);
  assert.equal(x.state,'HOLD_INCOMPLETE_AUDIT');
 }
 for(const [n,f] of [[1025,0],[1024,-1],[25,26],[NaN,2]]){
  const r=admitRecentCronFailureCount({nowMs:NOW,boundaryMs:NOW-15000000,inspectedRuns:n,failedCount:f});
  assert.equal(r.ok,false);
 }
});
test('V302.1 only SELECT reads, exact PK bounds, no pressure-increasing DB work',()=>{
 const sql=read('supabase/recovery/v3021_recent_cron_failure_readonly.sql');
 assert.equal(CRON_AUDIT_MAX_RUNS,1024);
 assert.equal(CRON_AUDIT_WINDOW_MS,7200000);
 assert.match(sql,/max\(runid\)/);
 assert.match(sql,/runid <= h\.maxid - 1024 ORDER BY runid DESC LIMIT 1/);
 assert.match(sql,/runid > \(SELECT maxid - 1024 FROM high\)/);
 assert.match(sql,/boundary\.boundary_start < now\(\) - interval '2 hours'/);
 assert.match(sql,/THEN recent\.failed_2h ELSE NULL/);
 assert.match(sql,/HOLD_INCOMPLETE_AUDIT/);
 assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|GRANT|REVOKE|DROP|CALL|VACUUM)\b/i);
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(read('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
});
