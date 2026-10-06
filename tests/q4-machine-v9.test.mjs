import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/q4-machine-v9.js';

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
  'q4-machine-v8':{
    ok:true,
    orchestrator:{
      state:'BLOCKED',
      gates:[
        {key:'v7_prerequisites_reviewable',passed:false},
        {key:'authoritative_permission_positive',passed:false},
        {key:'contract_gate_open',passed:false},
        {key:'firewall_gate_open',passed:false},
        {key:'real_broker_quote_present',passed:false},
        {key:'prospective_contract_policy_ready',passed:true},
        {key:'exposure_firewall_policy_ready',passed:true},
        {key:'exposure_capacity_available',passed:true}
      ]
    },
    candidate:null
  },
  'public-gold-permission-transitions':{
    ok:true,
    current:{
      final_action:'WAIT',final_permission:'0R',final_r:0,
      data_gate:'CLOSED',engine_gate:'CLOSED',contract_gate:'CLOSED',firewall_gate:'CLOSED'
    },
    latest_transition:null
  },
  'public-gold-trigger-watch':{
    ok:true,state:'SHORT_FAILURE_REVIEW',
    long_watch:{scenario_state:'NOT_CONFIRMED',acceptance_confirmed:false,human_review_condition_reached:false},
    short_watch:{scenario_state:'NOT_CONFIRMED',acceptance_confirmed:false,human_review_condition_reached:true}
  },
  'public-gold-learning-state':{
    ok:true,
    capture_health:{state:'HEALTHY'},
    latest:{payload_sha256:'snap-a'}
  }
};

test('V9 produces a stable fingerprint for unchanged governed state',async()=>{
  const a=await run(blocked);
  const b=await run(blocked);
  assert.equal(a.statusCode,200);
  assert.equal(a.body.watch.watch_id,b.body.watch.watch_id);
  assert.equal(a.body.watch.state,'WATCHING_BLOCKED');
  assert.equal(a.body.watch.alert_recommendation,'STRUCTURAL_REVIEW');
  assert.equal(a.body.governance.capital_permission,'0R');
  assert.equal(a.body.watch_firewall.state_change_is_not_trade_signal,true);
});

test('V9 emits a human-review signal for an ephemeral V8 candidate without granting permission',async()=>{
  const fixtures=structuredClone(blocked);
  fixtures['q4-machine-v8'].orchestrator.state='CANDIDATE_PREPARATION_REVIEWABLE';
  fixtures['q4-machine-v8'].orchestrator.gates=fixtures['q4-machine-v8'].orchestrator.gates.map(g=>({...g,passed:true}));
  fixtures['q4-machine-v8'].candidate={candidate_id:'Q4V8-ABCDEF1234567890'};
  fixtures['public-gold-permission-transitions'].current={
    final_action:'EVALUATE',final_permission:'MAX_0.25R',final_r:0.25,
    data_gate:'OPEN',engine_gate:'OPEN',contract_gate:'OPEN',firewall_gate:'OPEN'
  };

  const res=await run(fixtures);
  assert.equal(res.body.watch.state,'CANDIDATE_REVIEW_SIGNAL');
  assert.equal(res.body.watch.alert_recommendation,'HUMAN_REVIEW');
  assert.equal(res.body.watch.candidate_ready,true);
  assert.equal(res.body.watch_firewall.alert_is_not_permission,true);
  assert.equal(res.body.decision_compression.action_permitted,'WAIT');
  assert.equal(res.body.decision_compression.capital_permission,'0R');
});

test('V9 prioritizes source recovery when a required watcher source is unavailable',async()=>{
  const fixtures=structuredClone(blocked);
  fixtures['public-gold-learning-state']={ok:false};

  const res=await run(fixtures);
  assert.equal(res.body.watch.state,'WATCHING_DEGRADED');
  assert.equal(res.body.watch.alert_recommendation,'SOURCE_RECOVERY');
  assert.equal(res.body.source_health.sources.learning_state,false);
  assert.equal(res.body.watch_firewall.no_orders,true);
  assert.equal(res.body.governance.action_permitted,'WAIT');
});
