import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const closure=fs.readFileSync(new URL('../api/production-closure.js',import.meta.url),'utf8');
const qa=fs.readFileSync(new URL('../supabase/functions/runtime-v115-autonomous-qa/index.ts',import.meta.url),'utf8');

test('V176 bounds production-closure downstream waits',()=>{
  assert.match(closure,/const DEPENDENCY_TIMEOUT_MS=12000;/);
  assert.match(closure,/privateHeaders\),/);
  assert.doesNotMatch(closure,/privateHeaders,18000/);
  assert.doesNotMatch(closure,/privateHeaders,30000/);
});

test('V176 adds short shared-edge pressure control without changing execution permission',()=>{
  assert.match(closure,/s-maxage=5/);
  assert.match(closure,/Retry-After','5'/);
  assert.match(closure,/X-TFA-Pressure-Control','V176'/);
  assert.match(closure,/qa_retry_recommended:false/);
  assert.match(closure,/capital_permission:'0R'/);
  assert.match(closure,/live_order_routing:false/);
  assert.match(closure,/order_submission_enabled:false/);
  assert.match(closure,/automatic_real_capital:false/);
});

test('V176 QA probes production closure once and fails closed on the observed result',()=>{
  assert.match(qa,/fetchAny\('\/api\/production-closure',12000\)/);
  assert.doesNotMatch(qa,/tfaRetry\(\(\)=>fetchAny\('\/api\/production-closure'/);
});
