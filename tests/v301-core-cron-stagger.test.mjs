import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/recovery/v301_autonomous_core_cron_stagger.sql');
const rollback=read('supabase/recovery/v301_autonomous_core_cron_rollback.sql');
test('V301 changes exactly one schedule, guarded by name/command/status and protected ops watch',()=>{
 assert.equal((migration.match(/PERFORM cron\.alter_job/g)||[]).length,1);
 assert.ok(migration.includes("job_id := 44, schedule := '11,26,41,56 * * * *'"));
 assert.ok(migration.includes("v_job.schedule <> '7-59/15 * * * *'"));
 assert.ok(migration.includes("v_job.command <> 'select public.refresh_autonomous_machine_state();'"));
 assert.ok(migration.includes("jobid=41"));
 assert.ok(migration.includes("tfa-autonomous-ops-watch"));
 assert.ok(migration.includes("RAISE EXCEPTION 'V301 drift"));
 assert.ok(migration.includes("RAISE EXCEPTION 'V301 postcondition"));
 assert.ok(migration.includes("v_job.active IS DISTINCT FROM TRUE"));
 assert.doesNotMatch(migration,/\bTRUNCATE\b|\bDELETE FROM\b|\bGRANT\b|\bREVOKE\b|cron\.unschedule\b|cron\.schedule\(|\bDROP\b/i);
});
test('V301 separately reviewed rollback restores original timing with drift checks',()=>{
 assert.equal((rollback.match(/PERFORM cron\.alter_job/g)||[]).length,1);
 assert.ok(rollback.includes("job_id := 44, schedule := '7-59/15 * * * *'"));
 assert.ok(rollback.includes("v_job.schedule <> '11,26,41,56 * * * *'"));
 assert.ok(rollback.includes("v_job.active IS DISTINCT FROM TRUE"));
 assert.ok(rollback.includes("RAISE EXCEPTION 'V301 rollback drift"));
 assert.doesNotMatch(rollback,/\bTRUNCATE\b|\bDELETE FROM\b|\bGRANT\b|\bREVOKE\b|cron\.unschedule\b|\bDROP\b/i);
});
test('V301 exact 15-minute cadence is retained, four minutes offset from ops watch',()=>{
 const old=[7,22,37,52],next=[11,26,41,56];
 assert.deepEqual(next.map((x,i)=>x-old[i]),[4,4,4,4]);
 assert.deepEqual(next.map((x,i)=>(next[(i+1)%4]-x+60)%60),[15,15,15,15]);
 assert.equal(next.some(x=>old.includes(x)),false);
});
test('V301 creates no capital, billing, QA matrix or source-freshness changes',()=>{
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(read('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
 assert.match(read('src/v300-v79-semantic-http.mjs'),/engine_certified:false/);
 assert.doesNotMatch(migration+rollback,/autonomous_qa_runs|gold_live_snapshots|payment|trading_enabled|capital_permission|UPDATE public/i);
});
