import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  smokeCoreTimeout,SMOKE_CORE_MAX_DEADLINE_MS,SMOKE_CORE_DEFAULT_DEADLINE_MS
} from '../supabase/functions/production-smoke-sweep/smoke-latency-policy.mjs';
import {SMOKE_REQUIRED,assessSmokeProbes} from
  '../supabase/functions/production-smoke-sweep/smoke-policy.mjs';

test('V291: only two fixed expensive public aggregators have 12-second budgets',()=>{
  assert.equal(SMOKE_CORE_MAX_DEADLINE_MS,12000);
  assert.equal(SMOKE_CORE_DEFAULT_DEADLINE_MS,3000);
  for(const path of ['public-v55-executive-market-board','public-v50-production-integrity'])
    assert.equal(smokeCoreTimeout(path),12000);
  assert.equal(smokeCoreTimeout('public-app-config'),3000);
  for(const path of ['evil/path','/evil','public-v55-executive-market-board?unbounded=true','a'.repeat(101),''])
    if(path)assert.throws(()=>smokeCoreTimeout(path),/invalid_smoke_probe_path/);
});
test('V291: additional time is not proof of pass; missing, timed out or stale evidence remains failed',()=>{
  const records=SMOKE_REQUIRED.map(([path,kind,http_status])=>({path,kind,http_status,ok:true,ms:5}));
  assert.equal(assessSmokeProbes(records).ok,true);
  const slowIndex=records.findIndex(v=>v.path==='public-v55-executive-market-board');
  records[slowIndex]={...records[slowIndex],ok:false,http_status:0,ms:12000};
  const verdict=assessSmokeProbes(records);
  assert.equal(verdict.ok,false);
  assert.equal(verdict.passed,8);
  assert.equal(verdict.failed,1);
});
test('V291: smoke caller preserves transport authentication, strict semantic checks and checkout locks',()=>{
 const src=readFileSync(new URL('../supabase/functions/production-smoke-sweep/index.ts',import.meta.url),'utf8');
 const checkout=readFileSync(new URL('../supabase/functions/create-checkout/index.ts',import.meta.url),'utf8');
 assert.match(src,/signal:AbortSignal.timeout\(smokeCoreTimeout\(path\)\)/);
 assert.match(src,/assessSmokeProbes\(results\)/);
 assert.match(src,/const shield=assessSmokeShield\(await incident\(\)\)/);
 assert.match(src,/sha256Hex\(supplied\)/);
 assert.match(src,/privilegedRestHeaders\(k\)/);
 assert.match(src,/status:verdict.ok\?200:503/);
 assert.doesNotMatch(src,/AbortSignal.timeout\(18000\)/);
 assert.match(checkout,/V272_CHARGES_ENABLED=false/);
});
