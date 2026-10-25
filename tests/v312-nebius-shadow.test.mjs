import test from 'node:test';
import assert from 'node:assert/strict';
import { GOVERNANCE, validateSource, assessProbe } from '../infrastructure/nebius/shadow-core.mjs';

test('V312 only observes the fixed public read-only triage endpoint', () => {
  assert.equal(validateSource('https://thefatheranalytics.com/api/public-recovery-triage'),
    'https://thefatheranalytics.com/api/public-recovery-triage');
  for (const bad of ['http://thefatheranalytics.com/api/public-recovery-triage',
    'https://evil.example/x', 'https://thefatheranalytics.com/api/ops-heartbeat',
    'https://thefatheranalytics.com/api/public-recovery-triage?x=1']) {
    assert.throws(() => validateSource(bad));
  }
});
test('V312 HTTP success never claims fresh prices, recovered DB or operational machine', () => {
  const o = assessProbe({status:200,body:{state:'ACTIVE_HEALTHY',ok:true},
    checkedAt:'2026-10-25T17:30:00Z'});
  assert.equal(o.observation_ok,true);
  assert.equal(o.machine_operational_verified,false);
  assert.equal(o.market_data_freshness_verified,false);
  assert.equal(o.database_recovery_verified,false);
  assert.equal(o.autonomous_cycles_verified,false);
});
test('V312 fails closed on HTTP errors and malformed payloads', () => {
  assert.equal(assessProbe({status:503,body:{ok:false}}).observation_ok,false);
  assert.equal(assessProbe({status:200,body:'html'}).observation_ok,false);
  assert.equal(assessProbe({status:0,body:null}).observation_ok,false);
});
test('V312 governance forbids payments and live trading promotion', () => {
  assert.equal(GOVERNANCE.mode,'READ_ONLY_SHADOW');
  assert.equal(GOVERNANCE.capital_permission,'0R');
  assert.equal(GOVERNANCE.automatic_execution,false);
  assert.equal(GOVERNANCE.live_order_submission_enabled,false);
  assert.equal(GOVERNANCE.commercial_launch_approved,false);
});
