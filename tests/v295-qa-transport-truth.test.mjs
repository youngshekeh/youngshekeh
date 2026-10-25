import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyScheduledPrivateQa} from '../src/v295-qa-transport-truth.mjs';
const good=()=>({
 ok:false,version:'v205.0-one-command-relay-activation-certification-v69',
 state:'FAIL',summary:{passed:77,failed:30,total:107},
 tests:Array.from({length:107},(_,i)=>({name:'case_'+i,pass:i<77})),
 invariants:{capital_permission:'0R',automatic_promotion:false}
});
test('V295 real failing 107-check matrix is recorded faithfully without commercial certification',()=>{
 const r=classifyScheduledPrivateQa({httpStatus:200,body:good()});
 assert.equal(r.insert_qa_matrix,true);assert.equal(r.kind,'COMPLETE_QA_MATRIX');
 assert.equal(r.passed,77);assert.equal(r.failed,30);assert.equal(r.total,107);
 assert.equal(r.incident_state,'open');assert.equal(r.incident_severity,'critical');
 assert.equal(r.certified,false);assert.equal(r.commercial_launch_allowed,false);
});
test('V295 timeouts and HTTP 503 cannot create synthetic 0/1 matrix or clear incident',()=>{
 for(const data of [
 {httpStatus:null,timedOut:true,body:null},
 {httpStatus:503,body:{state:'FAIL',summary:{passed:0,failed:1,total:1},tests:[]}},
 {httpStatus:200,body:{version:'v78-unknown',state:'FAIL',summary:{passed:0,failed:1,total:1},tests:[],invariants:{}}},
 {httpStatus:200,body:{state:'FAIL'}},
 {httpStatus:0,body:null},
 ]){
  const x=classifyScheduledPrivateQa(data);
  assert.equal(x.kind,'QA_TRANSPORT_UNVERIFIED');
  assert.equal(x.insert_qa_matrix,false);
  assert.equal(x.incident_state,'open');assert.equal(x.incident_severity,'critical');
  assert.equal(x.capital_permission,'0R');
 }
});
test('V295 a forged summary, partial payload or false pass is withheld',()=>{
 const cases=[
 {...good(),summary:{passed:107,failed:0,total:107}},
 {...good(),tests:good().tests.slice(0,99)},
 {...good(),invariants:{capital_permission:'1R'}},
 {...good(),version:'v78-unknown'},
 {...good(),state:'PASS',ok:true},
 {...good(),state:'PASS',ok:false,summary:{passed:107,failed:0,total:107}},
 {...good(),tests:[...good().tests.slice(0,106),{name:'broken',pass:'false'}]}
 ];
 for(const body of cases)assert.equal(classifyScheduledPrivateQa({httpStatus:200,body}).insert_qa_matrix,false);
});
test('V295 correctly shaped 107-pass matrix is still not independent launch certification',()=>{
 const body=good();
 body.state='PASS';body.ok=true;body.summary={passed:107,failed:0,total:107};
 body.tests=body.tests.map(t=>({...t,pass:true}));
 const x=classifyScheduledPrivateQa({httpStatus:200,body});
 assert.equal(x.insert_qa_matrix,true);assert.equal(x.incident_state,'cleared');
 assert.equal(x.certified,false);assert.equal(x.commercial_launch_allowed,false);
});
test('V295 reviewed SQL uses same strict minimum, stores transport evidence separately and leaves grants unchanged',()=>{
 const sql=readFileSync(new URL('../supabase/recovery/v295_qa_matrix_transport_truth.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.reconcile_v78_qa_probes\(\)/);
 assert.match(sql,/SECURITY DEFINER/);
 assert.match(sql,/SET search_path TO 'public', 'net', 'extensions', 'pg_temp'/);
 assert.match(sql,/b->>'version'<>'v78-unknown'/);
 assert.match(sql,/jsonb_array_length\(b->'tests'\)>=100/);
 assert.match(sql,/v_total=v_passed\+v_failed/);
 assert.match(sql,/v_actual_passed=v_passed/);
 assert.match(sql,/v_actual_failed=v_failed/);
 assert.match(sql,/if not v_matrix_valid then/);
 assert.match(sql,/continue;/);
 assert.match(sql,/QA_TRANSPORT_UNVERIFIED/);
 assert.match(sql,/'ops:v78_regression_matrix','critical','qa','open'/);
 assert.match(sql,/insert into public\.autonomous_qa_runs/);
 assert.doesNotMatch(sql,/\bGRANT\b|\bREVOKE\b|\bALTER ROLE\b|\bcron\.schedule\b/i);
});
