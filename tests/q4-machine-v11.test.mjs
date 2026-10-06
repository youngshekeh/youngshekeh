import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/q4-machine-v11.js';

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

const liveBlocked={
  '/api/q4-machine-v8':{
    ok:true,
    orchestrator:{state:'BLOCKED'},
    candidate:null,
    exposure_firewall:{admitted_objects:0}
  },
  '/api/q4-machine-v9':{
    ok:true,
    watch:{watch_id:'Q4V9-TEST',state:'WATCHING_BLOCKED',candidate_ready:false},
    readiness_state:{
      v7_upstream_reviewable:false,
      permission:{
        final_action:'WAIT',final_permission:'0R',final_r:0,
        contract_gate:'CLOSED',firewall_gate:'CLOSED'
      }
    }
  },
  '/api/q4-machine-v10':{
    ok:true,
    broker_reference:{
      state:'WAITING_FOR_REAL_TICK',
      reference_grade:'NO_BROKER_REFERENCE',
      source_connected:false,
      bid:null,ask:null,age_seconds:null,tick_count_60s:0
    },
    verification:{primary_blocker:{key:'mt5_read_only_source'}},
    execution_reality:{
      execution_evidence_grade:'NOT_EXECUTION_GRADE',
      infrastructure_missing:['BROKER ADAPTER','EXECUTION QUOTE'],
      production_broker_verified:false,
      real_broker_connected:false,
      live_order_route_present:false,
      live_order_qualified:false
    },
    qualification_boundary:{human_release_required:true}
  }
};

test('V11 converges the current stack to the MT5 bridge as the first blocker',async()=>{
  const res=await run(liveBlocked);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.convergence.state,'BLOCKED_AT_MARKET_REFERENCE');
  assert.equal(res.body.convergence.readiness_pct,0);
  assert.equal(res.body.convergence.primary_blocker.key,'connect_read_only_mt5_reference');
  assert.equal(res.body.next_action.source,'V10');
  assert.equal(res.body.convergence_firewall.readiness_pct_is_not_probability,true);
  assert.equal(res.body.governance.capital_permission,'0R');
});

test('V11 advances to qualification only after a fresh broker market reference exists',async()=>{
  const fixtures=structuredClone(liveBlocked);
  fixtures['/api/q4-machine-v10'].broker_reference={
    state:'BROKER_MARKET_REFERENCE_READY_EXECUTION_LOCKED',
    reference_grade:'READ_ONLY_BROKER_MARKET_REFERENCE_VERIFIED',
    source_connected:true,
    bid:4180.1,ask:4180.4,age_seconds:2,tick_count_60s:20
  };

  const res=await run(fixtures);
  assert.equal(res.body.convergence.state,'BROKER_REFERENCE_READY_WAITING_QUALIFICATION');
  assert.equal(res.body.convergence.passed_count,2);
  assert.equal(res.body.convergence.readiness_pct,25);
  assert.equal(res.body.convergence.primary_blocker.key,'prospective_qualification_reviewable');
  assert.equal(res.body.execution_boundary.execution_evidence_grade,'NOT_EXECUTION_GRADE');
  assert.equal(res.body.convergence_firewall.broker_reference_is_not_capital_permission,true);
});

test('V11 never converts full prerequisite completion into order authority',async()=>{
  const fixtures=structuredClone(liveBlocked);
  fixtures['/api/q4-machine-v10'].broker_reference={
    state:'BROKER_MARKET_REFERENCE_READY_EXECUTION_LOCKED',
    reference_grade:'READ_ONLY_BROKER_MARKET_REFERENCE_VERIFIED',
    source_connected:true,
    bid:4180.1,ask:4180.4,age_seconds:1,tick_count_60s:30
  };
  fixtures['/api/q4-machine-v9'].watch={
    watch_id:'Q4V9-GREEN',state:'CANDIDATE_REVIEW_SIGNAL',candidate_ready:true
  };
  fixtures['/api/q4-machine-v9'].readiness_state={
    v7_upstream_reviewable:true,
    permission:{
      final_action:'EVALUATE',final_permission:'MAX_0.25R',final_r:0.25,
      contract_gate:'OPEN',firewall_gate:'OPEN'
    }
  };
  fixtures['/api/q4-machine-v8'].candidate={candidate_id:'Q4V8-GREEN'};
  fixtures['/api/q4-machine-v8'].exposure_firewall.admitted_objects=1;

  const res=await run(fixtures);
  assert.equal(res.body.convergence.readiness_pct,100);
  assert.equal(res.body.convergence.state,'CANONICAL_ADMISSION_OBSERVED_EXECUTION_STILL_SEPARATE');
  assert.equal(res.body.convergence.primary_blocker,null);
  assert.equal(res.body.convergence_firewall.canonical_admission_is_not_order_submission,true);
  assert.equal(res.body.convergence_firewall.no_orders,true);
  assert.equal(res.body.decision_compression.action_permitted,'WAIT');
  assert.equal(res.body.decision_compression.capital_permission,'0R');
});
