import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/q4-machine-v7.js';

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

const currentLike={
  'q4-machine-v6':{ok:true,evidence_inventory:{trade_eligible_sources:0}},
  'public-gold-permission-transitions':{
    ok:true,
    current:{
      final_action:'WAIT',final_permission:'0R',final_r:0,
      data_gate:'CLOSED',engine_gate:'CLOSED',contract_gate:'CLOSED',firewall_gate:'CLOSED',
      reasons:['F1_DATA_NOT_FRESH','ENGINE_WAIT','NO_READY_PROSPECTIVE_CONTRACT','NO_ADMITTED_CANONICAL_EXPOSURE']
    }
  },
  'public-gold-execution-desk':{
    ok:true,
    market:{
      market_status:'DELAYED_LIVE',price:4172.7,
      live_xauusd:{state:'LIVE_MARKET_BRIDGE_WAITING_FOR_TICK',bid:null,ask:null,real_account_quote:false}
    },
    execution:{system_action:'WAIT',system_capital_permission:'0R',current_setup_executable_by_machine:false},
    current_read:{action_permitted:'EVALUATE',capital_permission:'MAX_0.25R'}
  },
  'public-gold-trigger-watch':{
    ok:true,
    long_watch:{human_review_condition_reached:false,acceptance_confirmed:false},
    short_watch:{human_review_condition_reached:true,acceptance_confirmed:false}
  },
  'public-gold-learning-state':{
    ok:true,prospective_sample_count:250,
    latest:{payload_sha256:'abc123'},
    capture_health:{state:'HEALTHY'},
    methodology:{prospective_only:true,append_only:true}
  },
  'public-gold-outcome-integrity':{
    ok:true,active:true,verdict:'DIVERGENCE_PRESENT',
    policy:{independent_signal_count:1,double_count_prevention:true}
  }
};

test('V7 keeps the current research state prospectively unqualified',async()=>{
  const res=await run(currentLike);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.qualification.state,'NOT_QUALIFIED');
  assert.equal(res.body.qualification.countable_as_trade_eligible_now,false);
  assert.equal(res.body.qualification.accepted_side,null);
  assert.equal(res.body.qualification.human_review_side,'SHORT');
  assert.equal(res.body.qualification.primary_blocker.key,'real_broker_execution_reference');
  assert.equal(res.body.current_governed_state.research_read_excluded_from_eligibility.excluded,true);
  assert.equal(res.body.evidence_firewall.research_sizing_counts_as_permission,false);
  assert.equal(res.body.governance.capital_permission,'0R');
});

test('V7 never promotes a research EVALUATE suggestion into executable permission',async()=>{
  const res=await run(currentLike);
  assert.equal(res.body.current_governed_state.research_read_excluded_from_eligibility.action,'EVALUATE');
  assert.equal(res.body.current_governed_state.research_read_excluded_from_eligibility.risk_suggestion,'MAX_0.25R');
  assert.equal(res.body.current_governed_state.permission_compiler.final_permission,'0R');
  assert.equal(res.body.current_governed_state.execution_desk.system_capital_permission,'0R');
  assert.equal(res.body.qualification.countable_as_trade_eligible_now,false);
});

test('V7 makes an all-green hypothetical state reviewable but cannot self-create eligibility',async()=>{
  const fixtures=structuredClone(currentLike);
  fixtures['public-gold-permission-transitions'].current={
    final_action:'EVALUATE',final_permission:'MAX_0.25R',final_r:0.25,
    data_gate:'OPEN',engine_gate:'OPEN',contract_gate:'OPEN',firewall_gate:'OPEN',
    reasons:[]
  };
  fixtures['public-gold-execution-desk'].market.live_xauusd={
    state:'LIVE_REAL_ACCOUNT',bid:4180.1,ask:4180.4,real_account_quote:true
  };
  fixtures['public-gold-execution-desk'].execution={
    system_action:'EVALUATE',system_capital_permission:'MAX_0.25R',current_setup_executable_by_machine:false
  };
  fixtures['public-gold-trigger-watch'].short_watch={
    human_review_condition_reached:true,acceptance_confirmed:true
  };

  const res=await run(fixtures);
  assert.equal(res.body.qualification.state,'PROSPECTIVE_CONTRACT_REVIEWABLE');
  assert.equal(res.body.qualification.prerequisite_pass_count,8);
  assert.equal(res.body.qualification.countable_as_trade_eligible_now,false);
  assert.equal(res.body.next_qualification_action.gate,'AUTHORITATIVE_CONTRACT_REVIEW');
  assert.equal(res.body.evidence_firewall.self_classification,false);
  assert.equal(res.body.governance.action_permitted,'WAIT');
  assert.equal(res.body.governance.capital_permission,'0R');
});
