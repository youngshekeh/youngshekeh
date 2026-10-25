import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {homeQaLabel} from '../src/v286-public-qa-label.mjs';
const homepage=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const status=readFileSync(new URL('../src/status.ts',import.meta.url),'utf8');
const privateApi=readFileSync(new URL('../api/autonomous-qa-matrix.js',import.meta.url),'utf8');
const checkout=readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8');
const pay=readFileSync(new URL('../supabase/functions/create-checkout/index.ts',import.meta.url),'utf8');

test('public QA score has explicit non-certification even when a cached score says PASS',()=>{
  for(const v of ['PASS','107/107 PASS','77/107 FAIL',100,'NOT READY']){
    const label=homeQaLabel(v);
    assert.match(label,/NOT CERTIFIED$/);
    assert.notEqual(label,'QA PASS');
  }
  assert.equal(homeQaLabel('WITHHELD'),'NOT CERTIFIED');
  assert.equal(homeQaLabel(undefined),'NOT CERTIFIED');
  assert.equal(homeQaLabel(NaN),'NOT CERTIFIED');
  assert.equal(homeQaLabel('  77/107\nFAILED  '),'77/107 FAILED · NOT CERTIFIED');
  assert.ok(homeQaLabel('x'.repeat(500)).length<=62);
});
test('minute-by-minute homepage refresh uses bounded mission brief, not 107 private tests',()=>{
  const tail=homepage.slice(homepage.indexOf('async function refreshMissionExperience()'));
  assert.match(tail,/await loadMissionBrief\(\)/);
  assert.match(tail,/if \(allowDeepQaForThisHost\(\)\) await loadQaMatrix\(\)/);
  assert.match(tail,/location\.hostname === 'localhost'/);
  assert.match(tail,/window\.setInterval\(\(\) => void refreshMissionExperience\(\), 60_000\)/);
  assert.equal((tail.match(/loadQaMatrix\(\)/g)||[]).length,1);
  assert.match(homepage,/missionText\('briefQA', homeQaLabel\(changed\?\.qa_score\)\)/);
  assert.match(homepage,/missionText\('calibrationQA', homeQaLabel\(calibration\?\.qa_score\)\)/);
});
test('full private QA routine and the existing gated status surface are preserved',()=>{
  assert.match(homepage,/async function loadQaMatrix\(\)/);
  assert.match(homepage,/fetch\(`\/api\/autonomous-qa-matrix\?ui_bucket=\$\{qaBucket\}`/);
  assert.match(status,/const qaAdmission = assessQaAdmission\(\{auth, readiness, billing, gold\}\)/);
  assert.match(status,/qaAdmission\.admitted[\s\S]*readSite\('\/api\/autonomous-qa-matrix\?status_surface=1'\)/);
  assert.match(privateApi,/await preflightV285QaAdmission\(\)/);
});
test('public research, market refresh and WAIT-0R remain intact',()=>{
  assert.match(homepage,/await loadMissionBrief\(\)/);
  assert.match(homepage,/renderGlobalMarkets\(brief\?\.global_market_dashboard\)/);
  assert.match(homepage,/renderQuantAccountability\(brief\?\.quant_accountability\)/);
  assert.match(status,/WAIT \/ 0R/);
  assert.match(checkout,/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
  assert.match(pay,/V272_CHARGES_ENABLED=false/);
});
