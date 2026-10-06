import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/q4-machine-v10.js';

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
  'broker-live-market-intake':{
    ok:true,quote:null,state:'LIVE_MARKET_BRIDGE_WAITING_FOR_TICK',
    source:{kind:'MT5_READ_ONLY_BROKER',connected:false},
    symbol:'XAUUSD',quality:{fresh:false,tick_count_5m:0,tick_count_60s:0}
  },
  'public-gold-execution-reality':{
    ok:true,state:'LOCKED · RESEARCH SAMPLE',
    research:{resolved_sample:19,mature_research_sample:30},
    execution_gate:{
      infrastructure:[
        {name:'BROKER ADAPTER',passed:false},
        {name:'EXECUTION QUOTE',passed:false},
        {name:'SPREAD MEASURED',passed:false},
        {name:'SLIPPAGE MEASURED',passed:false},
        {name:'RECONCILIATION',passed:false},
        {name:'KILL SWITCH',passed:false}
      ]
    },
    methodology:{
      broker_spread_measured:false,
      slippage_measured:false,
      delayed_reference_not_execution_quote:true
    }
  },
  'public-gold-broker-adapter-lab':{
    ok:true,state:'PASS_SIMULATION_ONLY',
    lab:{tests_passed:6,tests_total:6,real_orders_sent:0}
  },
  'public-gold-execution-qualification':{
    ok:true,state:'DRY_RUN_READY_LIVE_LOCKED',
    dry_run_order:{route:'DRY_RUN_ONLY'},
    qualification:{
      dry_run_order_ready:true,
      live_order_qualified:false,
      blocker_codes:['PRODUCTION_BROKER_NOT_VERIFIED']
    },
    safety:{
      production_broker_verified:false,
      real_broker_connected:false,
      live_order_route_present:false
    },
    methodology:{dry_run_order_is_not_broker_order:true},
    governance:{human_control_required_for_any_future_live_release:true}
  }
};

test('V10 keeps the current missing-tick bridge unverified and 0R',async()=>{
  const res=await run(currentLike);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.broker_reference.state,'WAITING_FOR_REAL_TICK');
  assert.equal(res.body.broker_reference.reference_grade,'NO_BROKER_REFERENCE');
  assert.equal(res.body.broker_reference.quote_present,false);
  assert.equal(res.body.verification.primary_blocker.key,'mt5_read_only_source');
  assert.equal(res.body.reference_firewall.broker_market_reference_can_unlock_capital,false);
  assert.equal(res.body.governance.capital_permission,'0R');
});

test('V10 can verify a fresh read-only MT5 market reference without calling it execution-grade',async()=>{
  const fixtures=structuredClone(currentLike);
  fixtures['broker-live-market-intake']={
    ok:true,
    quote:{
      observed_at:new Date().toISOString(),
      bid:4180.1,ask:4180.4,last:4180.2
    },
    state:'LIVE_MARKET_REFERENCE_ACTIVE',
    source:{kind:'MT5_READ_ONLY_BROKER',connected:true},
    symbol:'XAUUSD',
    quality:{fresh:true,tick_count_5m:120,tick_count_60s:24}
  };

  const res=await run(fixtures);
  assert.equal(res.body.broker_reference.reference_grade,'READ_ONLY_BROKER_MARKET_REFERENCE_VERIFIED');
  assert.equal(res.body.broker_reference.state,'BROKER_MARKET_REFERENCE_READY_EXECUTION_LOCKED');
  assert.equal(res.body.broker_reference.observed_spread_points,0.3);
  assert.equal(res.body.broker_reference.spread_claim,'OBSERVED_QUOTE_SPREAD_ONLY');
  assert.equal(res.body.execution_reality.execution_evidence_grade,'NOT_EXECUTION_GRADE');
  assert.equal(res.body.reference_firewall.observed_spread_counts_as_realized_execution_cost,false);
  assert.equal(res.body.governance.action_permitted,'WAIT');
});

test('V10 never converts simulation success into production broker verification',async()=>{
  const res=await run(currentLike);
  assert.equal(res.body.simulation_boundary.simulation_pass,true);
  assert.equal(res.body.simulation_boundary.simulation_success_counts_as_broker_verification,false);
  assert.equal(res.body.simulation_boundary.simulation_success_counts_as_execution_evidence,false);
  assert.equal(res.body.execution_reality.production_broker_verified,false);
  assert.equal(res.body.execution_reality.real_broker_connected,false);
  assert.equal(res.body.reference_firewall.automatic_orders,false);
});
