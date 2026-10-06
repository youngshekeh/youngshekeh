import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/q4-machine-v5.js';

function response(body){return {ok:true,async json(){return body}}}
function resMock(){return {
  headers:{},statusCode:200,body:null,
  setHeader(k,v){this.headers[k]=v},
  status(v){this.statusCode=v;return this},
  json(v){this.body=v;return v}
}}

async function run(fixtures){
  const original=globalThis.fetch;
  globalThis.fetch=async url=>{
    const key=Object.keys(fixtures).find(k=>String(url).includes(k));
    return response(key?fixtures[key]:{});
  };
  try{
    const res=resMock();
    await handler({method:'GET'},res);
    return res;
  }finally{globalThis.fetch=original}
}

const base={
  'q4-machine-v4':{ok:true,conflict_resolution:{state:'HIGH_CONFLICT',rule_score:100},regime_transition_pressure:{state:'HIGH_TRANSITION_PRESSURE',rule_score:100},frozen_snapshot:{snapshot_id:'TEST'}},
  'public-v47-probability-lab':{gold:{probability_estimate_pct:null},ai_probability:{probability_pct:null}},
  'public-market-calibration':{sample_size:0},
  'public-gold-benchmark-calibration':{canonical:{eligible_n:0,paired_resolutions:1},policy:{adaptive_weighting_enabled:false}},
  'public-setup-calibration':{resolved_120m_count:0},
  'public-gold-outcome-learning':{resolved_outcome_count:500,trade_eligible_source_count:0,horizons:[],calibration:{}},
  'public-gold-signal-reputation':{state:'EARLY_REPUTATION',pipeline:{max_sample_count:13}}
};

test('V5 withholds probability when evidence is missing instead of coercing null to zero evidence',async()=>{
  const res=await run(base);
  assert.equal(res.body.calibration_authority.state,'PROBABILITY_AUTHORITY_WITHHELD');
  assert.equal(res.body.calibration_authority.passed_gates,1);
  assert.equal(res.body.calibration_authority.readiness_index_pct,17);
  assert.equal(res.body.calibration_authority.probability_estimate_pct,null);
  assert.equal(res.body.learning_permission.capital_permission,'0R');
  assert.equal(res.body.learning_permission.automatic_orders,false);
});

test('V5 requires every authority gate even when an empirical probability is present',async()=>{
  const fixtures={...base,
    'public-v47-probability-lab':{gold:{probability_estimate_pct:72},ai_probability:{probability_pct:null}},
    'public-market-calibration':{sample_size:5},
    'public-gold-benchmark-calibration':{canonical:{eligible_n:5,paired_resolutions:5},policy:{adaptive_weighting_enabled:false}},
    'public-gold-outcome-learning':{resolved_outcome_count:500,trade_eligible_source_count:5,horizons:[],calibration:{}},
    'public-gold-signal-reputation':{state:'MATURE',pipeline:{max_sample_count:30}}
  };
  const res=await run(fixtures);
  assert.equal(res.body.calibration_authority.passed_gates,5);
  assert.equal(res.body.calibration_authority.state,'PROBABILITY_AUTHORITY_WITHHELD');
  assert.equal(res.body.calibration_authority.probability_estimate_pct,null);
});
