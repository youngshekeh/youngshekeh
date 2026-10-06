import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/q4-machine-v6.js';

function response(body){return {ok:true,async json(){return body}}}
function resMock(){return {
  headers:{},statusCode:200,body:null,
  setHeader(k,v){this.headers[k]=v},
  status(v){this.statusCode=v;return this},
  json(v){this.body=v;return v}
}}

async function run(v5){
  const original=globalThis.fetch;
  globalThis.fetch=async()=>response(v5);
  try{
    const res=resMock();
    await handler({method:'GET'},res);
    return res;
  }finally{globalThis.fetch=original}
}

function gate(key,current,required,passed=false,available=true){
  return {key,label:key,available,passed,state:available?(passed?'PASS':'FAIL'):'SOURCE_UNAVAILABLE',current:available?current:null,required};
}

const liveLike={
  ok:true,
  calibration_authority:{
    state:'PROBABILITY_AUTHORITY_WITHHELD',
    gates:[
      gate('structural_outcome_volume',500,30,true),
      gate('trade_eligible_sources',0,5),
      gate('canonical_calibration_sample',0,5),
      gate('market_calibration_sample',0,5),
      gate('mature_signal_reputation',13,30),
      gate('independent_oos_probability_model',0,1)
    ]
  },
  evidence_inventory:{
    resolved_structural_outcomes:500,
    trade_eligible_source_count:0,
    canonical_eligible_n:0,
    market_calibration_sample_size:0,
    max_signal_sample_count:13
  },
  source_health:{available_count:6,total_count:7},
  learning_permission:{probability_publication:'WITHHELD',adaptive_weighting:'FROZEN'}
};

test('V6 identifies governed trade-eligible evidence as the primary live bottleneck',async()=>{
  const res=await run(liveLike);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.evidence_recovery.maturity_state,'OBSERVATION_RICH_EDGE_UNPROVEN');
  assert.equal(res.body.evidence_recovery.primary_bottleneck.key,'trade_eligible_sources');
  assert.equal(res.body.evidence_recovery.primary_bottleneck.gap,5);
  assert.equal(res.body.evidence_recovery.readiness_progress_pct,24);
  assert.equal(res.body.next_research_action.lane,'GOVERNED_OUTCOMES');
  assert.equal(res.body.learning_firewall.capital_permission,'0R');
  assert.equal(res.body.learning_firewall.automatic_promotion,false);
});

test('V6 restores unavailable sources before ranking evidence maturity',async()=>{
  const degraded=structuredClone(liveLike);
  degraded.calibration_authority.gates[2]=gate('canonical_calibration_sample',null,5,false,false);
  const res=await run(degraded);
  assert.equal(res.body.evidence_recovery.state,'SOURCE_RECOVERY_REQUIRED');
  assert.equal(res.body.evidence_recovery.primary_bottleneck.key,'canonical_calibration_sample');
  assert.equal(res.body.evidence_recovery.primary_bottleneck.lane,'SOURCE_RECOVERY');
  assert.equal(res.body.evidence_recovery.primary_bottleneck.current,null);
  assert.equal(res.body.evidence_recovery.primary_bottleneck.gap,null);
});

test('V6 never turns fully clear research gates into capital authority',async()=>{
  const clear={
    ok:true,
    calibration_authority:{
      state:'PROBABILITY_PUBLICATION_ELIGIBLE',
      gates:[
        gate('structural_outcome_volume',500,30,true),
        gate('trade_eligible_sources',5,5,true),
        gate('canonical_calibration_sample',5,5,true),
        gate('market_calibration_sample',5,5,true),
        gate('mature_signal_reputation',30,30,true),
        gate('independent_oos_probability_model',1,1,true)
      ]
    },
    evidence_inventory:{
      resolved_structural_outcomes:500,
      trade_eligible_source_count:5,
      canonical_eligible_n:5,
      market_calibration_sample_size:5,
      max_signal_sample_count:30
    },
    learning_permission:{probability_publication:'REVIEWABLE',adaptive_weighting:'ENABLED'}
  };
  const res=await run(clear);
  assert.equal(res.body.evidence_recovery.state,'AUTHORITY_GATES_CLEAR');
  assert.equal(res.body.evidence_recovery.readiness_progress_pct,100);
  const capital=res.body.research_permission_ladder.find(x=>x.level==='CAPITAL_PROMOTION');
  assert.equal(capital.permitted,false);
  assert.equal(res.body.learning_firewall.automatic_orders,false);
  assert.equal(res.body.governance.action_permitted,'WAIT');
});
