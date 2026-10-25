import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildV303FromExactSource,OLD_LOOKUP,NEW_LOOKUP} from '../scripts/v303-build-core-migration.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function originalFixture(){
 const required=[
 'from public.source_connectors',
 'from cron.job where active = true',
 'from public.agent_runs',
 'from public.status_incidents',
 'from public.trend_snapshots',
 'from public.intelligence_events',
 'production_smoke_sweep',
 'from public.gold_compiled_permission_snapshots',
 'insert into public.autonomous_machine_state',
 'insert into public.autonomous_ops_events',
 "'can_self_promote',false"
 ].map(s=>'  -- '+s+'\n').join('');
 return "CREATE OR REPLACE FUNCTION public.refresh_autonomous_machine_state()\n"+
 " RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public', 'pg_temp'\n"+
 "AS $function$\ndeclare\n  v_cron_failures integer := 0;\n"+
 "  v_now timestamptz := now();\nbegin\n"+
 required+OLD_LOOKUP+"\n"+'  -- unrelated original body must remain byte-identical\n'+
 '  -- archived no-op padding\n'.repeat(380)+
 "  return jsonb_build_object('mode','WAIT','capital_permission','0R');\nend;\n$function$\n";
}
test('V303 requires complete database source and only adjusts one lookback plus guard',()=>{
 const base=originalFixture(),v=buildV303FromExactSource(base);
 assert.ok(base.length>10000&&base.length<14000);
 assert.equal((v.apply.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
 assert.equal((v.rollback.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
 assert.equal((v.apply.match(/SET search_path TO 'public', 'pg_temp'/g)||[]).length,1);
 assert.equal((v.apply.match(/SECURITY DEFINER/g)||[]).length,1);
 assert.ok(v.apply.includes(NEW_LOOKUP));
 assert.ok(!v.apply.includes(OLD_LOOKUP));
 assert.ok(v.rollback.includes(OLD_LOOKUP));
 assert.ok(!v.rollback.includes(NEW_LOOKUP));
 assert.match(v.apply,/limit 1025/);
 assert.match(v.apply,/materialized/);
 assert.match(v.apply,/raise exception 'V303 cron audit incomplete/);
 assert.match(v.apply,/SET LOCAL lock_timeout='1500ms'/);
 assert.match(v.apply,/SET LOCAL statement_timeout='15s'/);
 assert.match(v.apply,/exact live function fingerprint mismatch/);
 assert.match(v.apply,/search_path=public, pg_temp/);
 assert.match(v.apply,/service_role=X\/postgres/);
 assert.ok(v.apply.includes(v.originalMd5));
 assert.ok(v.apply.includes(v.updatedMd5));
 assert.ok(v.rollback.includes(v.originalMd5));
 assert.ok(v.rollback.includes(v.updatedMd5));
 assert.equal(createHash('md5').update(base).digest('hex'),v.originalMd5);
 assert.match(v.apply,/-- unrelated original body must remain byte-identical/);
 assert.match(v.rollback,/-- unrelated original body must remain byte-identical/);
});
test('V303 aborts on incomplete, duplicate, tampered or unaudited baseline',()=>{
 const base=originalFixture();
 for(const variant of [
  base.slice(0,2000),base.replace(OLD_LOOKUP,'select 1;'),
  base.replace(OLD_LOOKUP,OLD_LOOKUP+'\n'+OLD_LOOKUP),
  base.replace("SECURITY DEFINER","SECURITY INVOKER"),
  base.replace("SET search_path TO 'public', 'pg_temp'","SET search_path TO 'public'"),
  base.replace('from public.agent_runs','from malicious.agent_runs'),
  base.replace('CREATE OR REPLACE FUNCTION public.refresh_autonomous_machine_state()','CREATE OR REPLACE FUNCTION public.other()'),
  base+'\nREVOKE ALL ON ALL TABLES FROM public'
 ]){
  assert.throws(()=>buildV303FromExactSource(variant));
 }
});
test('V303 never erases incomplete audit state or relaxes financial permissions',()=>{
 const script=read('scripts/v303-build-core-migration.mjs');
 assert.match(script,/v_cron_history_complete boolean := false/);
 assert.match(script,/if not coalesce\(v_cron_history_complete,false\)/);
 assert.match(script,/boundary\) < v_now - interval '2 hours'/);
 assert.match(script,/count\(\*\) from recent\) = 1025/);
 assert.match(script,/LIMIT|limit 1025/);
 assert.doesNotMatch(script,/pg_query.*execute|postgresql:\/\/|service_role_key|SupabaseClient|cron\.unschedule|cron\.alter_job/);
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(read('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
 assert.match(read('src/v300-v79-semantic-http.mjs'),/engine_certified:false/);
});
test('V303 live benchmark SQL is SELECT-only and uses the reviewed single runid index path',()=>{
 const sql=read('supabase/recovery/v303_readonly_cron_benchmark.sql');
 assert.match(sql,/as materialized/);
 assert.match(sql,/order by runid desc limit 1025/);
 assert.match(sql,/boundary_time/);
 assert.match(sql,/complete_coverage/);
 assert.match(sql,/status not in \('succeeded','running'\)/);
 assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|GRANT|REVOKE|DROP|CALL|VACUUM)\b/i);
});
