import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../supabase/recovery/'+name,import.meta.url),'utf8');
test('V295.1 migration is exactly one balanced complete PL/pgSQL function',()=>{
 const src=read('v295_qa_matrix_transport_truth.sql');
 const before=read('v295_qa_matrix_transport_truth_rollback.sql');
 assert.equal((src.match(/CREATE OR REPLACE FUNCTION public\.reconcile_v78_qa_probes\(\)/g)||[]).length,1);
 assert.equal((src.match(/\$function\$/g)||[]).length,2);
 assert.equal((src.match(/v_state := case/g)||[]).length,1);
 assert.equal((src.match(/v_actual_total=v_total/g)||[]).length,1);
 assert.equal((src.match(/end loop;/g)||[]).length,1);
 assert.equal((src.match(/insert into public\.autonomous_qa_runs/g)||[]).length,1);
 assert.equal((src.match(/return jsonb_build_object\('ok',true,'inserted_runs'/g)||[]).length,1);
 assert.ok(src.trim().endsWith('$function$;'));
 assert.ok(src.length<10000,'regression: replacement-string expansion duplicates original function');
 assert.ok(src.length>before.length);
 const fallback=src.indexOf('if not v_matrix_valid then');
 const matrix=src.indexOf('insert into public.autonomous_qa_runs');
 assert.ok(fallback>0&&matrix>fallback,'transport failure branch must precede matrix persistence');
});
test('V295.1 SQL cannot grant access, create fake 0/1 matrices, or soften risk firewall',()=>{
 const src=read('v295_qa_matrix_transport_truth.sql');
 for(const column of ['passed','failed','total']){
  assert.ok(src.includes("and coalesce(b#>>'{summary,"+column+"}','') ~ '^[0-9]{1,4}$'"));
 }
 assert.match(src,/jsonb_array_length\(b->'tests'\)>=100/);
 assert.match(src,/v_total between 100 and 1000/);
 assert.match(src,/v_actual_passed=v_passed/);
 assert.match(src,/v_actual_failed=v_failed/);
 assert.match(src,/AS tests\(test_entry\)/);
 assert.match(src,/QA_TRANSPORT_UNVERIFIED/);
 assert.match(src,/'ops:v78_regression_matrix','critical','qa','open'/);
 assert.match(src,/b#>>'\{invariants,capital_permission\}'='0R'/);
 assert.match(src,/SECURITY DEFINER/);
 assert.match(src,/SET search_path TO 'public', 'net', 'extensions', 'pg_temp'/);
 assert.doesNotMatch(src,/\b(GRANT|REVOKE|DROP|ALTER ROLE)\b|\bcron\.schedule\b/i);
});
