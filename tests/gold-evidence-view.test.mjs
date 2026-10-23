import test from 'node:test';
import assert from 'node:assert/strict';
import {goldEvidenceView} from '../src/gold-evidence-view.mjs';
const now=Date.parse('2026-10-23T12:00:00Z');
const good=()=>({ok:true,generated_at:new Date(now-1000).toISOString(),calibration:{performance_state:'OBSERVED_RESEARCH'}});
test('missing or failed model evidence never presents market confidence as available',()=>{
 for(const body of [null,{}, {...good(),ok:false},{...good(),calibration:{performance_state:'UNKNOWN'}},{...good(),performance_state:'EVIDENCE_STORE_UNAVAILABLE',calibration:null}]){
  const view=goldEvidenceView(body,98,now);assert.equal(view.confidence,null);assert.match(view.copy,/not verified/);assert.doesNotMatch(view.copy,/evidence is available/);
 }
});
test('stale, missing and future model timestamps withhold confidence',()=>{
 for(const generated_at of [undefined,'invalid',new Date(now-600001).toISOString(),new Date(now+1001).toISOString()])assert.equal(goldEvidenceView({...good(),generated_at},88,now).confidence,null);
});
test('current explicitly successful evidence preserves reported state without claiming calibrated edge',()=>{
 const view=goldEvidenceView(good(),72,now);assert.equal(view.state,'OBSERVED_RESEARCH');assert.equal(view.confidence,72);assert.match(view.copy,/does not establish a calibrated edge/);
 for(const n of ['72',NaN,Infinity,-1,101,null])assert.equal(goldEvidenceView(good(),n,now).confidence,null);
});
test('explicitly gated calibration states cannot expose confidence',()=>{
 for(const state of ['INSUFFICIENT_SAMPLE','UNVERIFIED','NOT_READY','PENDING','ERROR','WITHHELD'])assert.equal(goldEvidenceView({...good(),calibration:{performance_state:state}},90,now).confidence,null);
});
