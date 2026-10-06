import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/q4-machine-v8.js';

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

const blocked={
  'q4-machine-v7':{
    ok:true,
    qualification:{state:'NOT_QUALIFIED',prerequisite_pass_count:2,prerequisite_total:8,accepted_side:null},
    current_governed_state:{
      permission_compiler:{final_action:'WAIT',final_permission:'0R',final_r:0,contract_gate:'CLOSED',firewall_gate:'CLOSED'},
      execution_desk:{real_broker_quote:false}
    },
    prospective_ledger:{latest_payload_sha256:'snapshot-1'}
  },
  'public-gold-signal-contract':{
    ok:true,
    policy:{version:'TFA_GOLD_SIGNAL_CONTRACT_V1'},
    coverage:{historical_total:3,prospective_total:0,contract_ready_n:0,contract_blocked_n:0},
    latest:{F1:{contract_state:'LEGACY_INCOMPLETE'}},
    governance:{prospective_only:true,historical_geometry_not_backfilled:true,directional_validation_required:true}
  },
  'public-gold-exposure-firewall':{
    ok:true,
    policy:{version:'TFA_GOLD_EXPOSURE_FIREWALL_V1',max_live_gold_r:0.25,aggregation_rule:'MAX_MEMBER_R_NOT_SUM',manual_review_required:true},
    exposure:{open_canonical_objects:0,admitted_objects:0,blocked_objects:0,allocated_r:0,remaining_r:0.25}
  },
  'public-daily-contract-ledger':{ok:true,contract_count:0,open_count:0,resolved_120m_count:0},
  'public-contract-performance-board':{ok:true,performance_state:'NO_RESOLVED_SAMPLE',overall_120m:{accuracy_pct:null}}
};

test('V8 keeps the live blocked state non-candidate and 0R',async()=>{
  const res=await run(blocked);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.orchestrator.state,'BLOCKED');
  assert.equal(res.body.candidate,null);
  assert.equal(res.body.orchestrator.primary_blocker.key,'v7_prerequisites_reviewable');
  assert.equal(res.body.admission_firewall.v8_may_admit_exposure,false);
  assert.equal(res.body.admission_firewall.v8_may_grant_capital,false);
  assert.equal(res.body.governance.capital_permission,'0R');
});

test('V8 prepares only an ephemeral candidate when every gate is green',async()=>{
  const fixtures=structuredClone(blocked);
  fixtures['q4-machine-v7'].qualification={
    state:'PROSPECTIVE_CONTRACT_REVIEWABLE',
    prerequisite_pass_count:8,
    prerequisite_total:8,
    accepted_side:'SHORT'
  };
  fixtures['q4-machine-v7'].current_governed_state.permission_compiler={
    final_action:'EVALUATE',
    final_permission:'MAX_0.25R',
    final_r:0.25,
    data_gate:'OPEN',
    engine_gate:'OPEN',
    contract_gate:'OPEN',
    firewall_gate:'OPEN'
  };
  fixtures['q4-machine-v7'].current_governed_state.execution_desk={real_broker_quote:true};

  const res=await run(fixtures);
  assert.equal(res.body.orchestrator.state,'CANDIDATE_PREPARATION_REVIEWABLE');
  assert.ok(res.body.candidate.candidate_id.startsWith('Q4V8-'));
  assert.equal(res.body.candidate.requested_r,0.25);
  assert.equal(res.body.candidate.persistence,'EPHEMERAL_CANDIDATE_ONLY');
  assert.equal(res.body.candidate.admission_authority,'EXISTING_CANONICAL_CONTRACT_AND_EXPOSURE_SYSTEM');
  assert.equal(res.body.admission_firewall.v8_may_persist_candidate,false);
  assert.equal(res.body.admission_firewall.v8_may_open_contract_gate,false);
  assert.equal(res.body.admission_firewall.v8_may_place_orders,false);
  assert.equal(res.body.governance.action_permitted,'WAIT');
  assert.equal(res.body.governance.capital_permission,'0R');
});

test('V8 caps candidate risk at remaining canonical capacity',async()=>{
  const fixtures=structuredClone(blocked);
  fixtures['q4-machine-v7'].qualification={
    state:'PROSPECTIVE_CONTRACT_REVIEWABLE',
    prerequisite_pass_count:8,
    prerequisite_total:8,
    accepted_side:'LONG'
  };
  fixtures['q4-machine-v7'].current_governed_state.permission_compiler={
    final_action:'EVALUATE',final_permission:'MAX_0.25R',final_r:0.25,
    data_gate:'OPEN',engine_gate:'OPEN',contract_gate:'OPEN',firewall_gate:'OPEN'
  };
  fixtures['q4-machine-v7'].current_governed_state.execution_desk={real_broker_quote:true};
  fixtures['public-gold-exposure-firewall'].exposure.remaining_r=0.1;

  const res=await run(fixtures);
  assert.equal(res.body.candidate.requested_r,0.1);
  assert.equal(res.body.exposure_firewall.remaining_r,0.1);
  assert.equal(res.body.admission_firewall.v8_may_admit_exposure,false);
});
