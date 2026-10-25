import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/recovery/v302_cron_failed_lookback_index.sql');
const rollback=read('supabase/recovery/v302_cron_failed_lookback_index_rollback.sql');
test('V302 creates one explicitly bounded failure-only cron lookup index',()=>{
 assert.equal((sql.match(/CREATE INDEX v302_failed_runs_by_time_idx/g)||[]).length,1);
 assert.ok(sql.includes("ON cron.job_run_details USING btree (start_time DESC)"));
 assert.ok(sql.includes("WHERE status NOT IN ('succeeded','running')"));
 assert.ok(sql.includes("SET LOCAL lock_timeout = '1500ms'"));
 assert.ok(sql.includes("SET LOCAL statement_timeout = '15s'"));
 assert.equal((sql.match(/CREATE INDEX/g)||[]).length,1);
 assert.equal((sql.match(/DO \$v302_/g)||[]).length,2);
 assert.ok(sql.includes("i.indisvalid=true AND i.indisready=true"));
 assert.ok(sql.includes("status <> ALL"));
 assert.ok(sql.includes("RAISE EXCEPTION 'V302: core cron migration or command drift'"));
 assert.doesNotMatch(sql,/\bTRUNCATE\b|\bDELETE FROM\b|\bGRANT\b|\bREVOKE\b|\bDROP INDEX\b|\bUPDATE\b|\bVACUUM FULL\b/i);
});
test('V302 exact-command and cadence guard leaves 58 existing cron jobs and monitoring untouched',()=>{
 assert.ok(sql.includes("jobid=44 AND jobname='tfa-v70-autonomous-core'"));
 assert.ok(sql.includes("command='select public.refresh_autonomous_machine_state();'"));
 assert.ok(sql.includes("active=true AND schedule='11,26,41,56 * * * *'"));
 assert.doesNotMatch(sql,/cron\.alter_job|cron\.unschedule|cron\.schedule\(|\bALTER ROLE\b/i);
 const prior=read('supabase/recovery/v301_autonomous_core_cron_stagger.sql');
 assert.ok(prior.includes("schedule := '11,26,41,56 * * * *'"));
});
test('V302 rollback only drops precisely the reviewed index after matching its definition',()=>{
 assert.ok(rollback.includes("SET LOCAL lock_timeout='1500ms'"));
 assert.ok(rollback.includes("SET LOCAL statement_timeout='8s'"));
 assert.ok(rollback.includes('pg_get_indexdef(i.indexrelid) LIKE'));
 assert.ok(rollback.includes('DROP INDEX cron.v302_failed_runs_by_time_idx;'));
 assert.equal((rollback.match(/DROP INDEX/g)||[]).length,1);
 assert.doesNotMatch(rollback,/\bTRUNCATE\b|\bDELETE FROM\b|\bGRANT\b|\bREVOKE\b|\bDROP TABLE\b|\bUPDATE\b/i);
});
test('V302 no change to Gold/Bitcoin data freshness, private OIDC, QA, finance or checkout safeguards',()=>{
 const whole=sql+'\n'+rollback;
 assert.doesNotMatch(whole,/autonomous_qa_runs|autonomous_machine_state\s+set|gold_live_snapshots|payment|trading_enabled|capital_permission|refresh_autonomous_machine_state\(\)\s*as|\bINSERT\b/i);
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(read('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
 assert.match(read('src/v300-v79-semantic-http.mjs'),/engine_certified:false/);
});
