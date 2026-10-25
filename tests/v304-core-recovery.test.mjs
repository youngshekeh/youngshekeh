import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const apply=read('supabase/recovery/v304_fingerprint_gated_core.sql');
const rollback=read('supabase/recovery/v304_fingerprint_gated_core_rollback.sql');
test('V304 source hash and one protected dynamic replacement only',()=>{
 assert.match(apply,/md5\(v_source\) <> v_expected/);
 assert.match(apply,/ad18646c899eaffd2e7f6dfae567ce71/);
 assert.match(apply,/pg_get_functiondef\(v_target::regprocedure\)/);
 assert.match(apply,/v_patched := replace\(replace\(v_source,v_decl_old,v_decl_new\),v_old,v_new\)/);
 assert.equal((apply.match(/EXECUTE v_patched/g)||[]).length,1);
 assert.equal((apply.match(/DO \$v304\$/g)||[]).length,1);
 assert.match(apply,/position\(v_old in substring\(v_source/);
 assert.match(apply,/position\(v_decl_old in substring\(v_source/);
 assert.match(apply,/v_cron_history_complete boolean := false;/);
 assert.match(apply,/limit 1025/);
 assert.match(apply,/order by runid desc/);
 assert.match(apply,/select start_time from recent order by runid asc limit 1/);
 assert.match(apply,/boundary\) < v_now - interval '2 hours'/);
 assert.match(apply,/if not coalesce\(v_cron_history_complete,false\)/);
 assert.match(apply,/raise exception 'V304 cron audit incomplete/);
 assert.doesNotMatch(apply,/\bTRUNCATE\b|\bDELETE FROM\b|\bDROP TABLE\b|cron\.unschedule|ALTER ROLE|SET ROLE/i);
});
test('V304 owner, definer, grants and scheduler retained',()=>{
 for(const f of [apply,rollback]){
  assert.match(f,/pg_get_userbyid\(p.proowner\)='postgres'/);
  assert.match(f,/p.prosecdef=true/);
  assert.match(f,/p.proacl::text='\{postgres=X\/postgres,service_role=X\/postgres\}'/);
  assert.match(f,/search_path=public, pg_temp/);
  assert.match(f,/SET LOCAL lock_timeout='1500ms'/);
  assert.match(f,/SET LOCAL statement_timeout='20s'/);
 }
 assert.match(apply,/jobid=44 AND jobname='tfa-v70-autonomous-core'/);
 assert.match(apply,/schedule='11,26,41,56 \* \* \* \*'/);
 assert.match(apply,/active=true AND command='select public.refresh_autonomous_machine_state\(\);'/);
 assert.equal((apply.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
 assert.equal((rollback.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
});
test('V304 verified rollback is inverse and requires original digest',()=>{
 assert.match(apply,/v_old text := \$v304_old\$  select count\(\*\)::int into v_cron_failures/);
 assert.match(rollback,/v_new text := \$v304_new\$  select count\(\*\)::int into v_cron_failures/);
 assert.match(rollback,/v_old text := \$v304_old\$  with recent as materialized/);
 assert.match(rollback,/IF md5\(v_patched\) <> v_expected/);
 assert.match(rollback,/OR md5\(pg_get_functiondef\(v_target::regprocedure\)\) <> v_expected/);
 assert.match(rollback,/V304 rollback no longer reconstructs original source/);
 assert.doesNotMatch(rollback,/\bTRUNCATE\b|\bDROP TABLE\b|cron\.unschedule|ALTER ROLE|SET ROLE/i);
});
test('V304 historical and financial controls unchanged',()=>{
 const all=apply+'\n'+rollback;
 assert.doesNotMatch(all,/UPDATE public\.autonomous_machine_state|INSERT INTO public\.autonomous_qa_runs|ENABLE_TRADING|APPROVE_BILLING/i);
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(read('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
 assert.match(read('src/v300-v79-semantic-http.mjs'),/engine_certified:false/);
});
