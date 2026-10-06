import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/q4-machine-v12.js';

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

const stalled={
  '/api/q4-machine-v11':{ok:true,broker_reference:{quote_ready:false,grade:'NO_BROKER_REFERENCE'}},
  '/api/gold-bridge-readiness-v195':{
    ok:true,gates:{bridge_enrolled:{pass:true}},
    public_counts:{active_bridges:1},
    next_step_code:'RUN_MT5_RELAY_ON_WINDOWS'
  },
  '/api/gold-relay-observability-v199':{
    ok:true,state:'CREDENTIAL_ISSUED_AWAITING_RELAY',
    bridge:{authentication_reached:false,total_authenticated_requests:0,age_seconds:3600},
    relay:{first_tick_seen:false,accepted_ticks_examined:0,ticks_60s:0,streaming:false,terminal_connected:false}
  },
  '/api/gold-relay-event-ledger-v202':{
    ok:true,state:'HASH_CHAIN_VERIFIED',
    counts:{events:1,chain_failures:0},
    latest_event_at:'2026-10-02T21:58:52Z',
    current_relay:{state:'CREDENTIAL_ISSUED_AWAITING_RELAY'}
  },
  '/api/gold-activation-orchestrator-v204':{
    ok:true,state:'RELAY_NOT_STARTED',
    phase:{number:1,total:6,passed_gates:1},
    commissioning_progress_pct:17,
    next_step_code:'RUN_V201_THEN_V200_ON_WINDOWS',
    operator_next_action:'Run the V201 doctor on the Windows MT5 host, then execute the V200 one-shot smoke test.',
    machine_next_action:'Watch V199 for intake authentication.'
  }
};

test('V12 classifies the current credential as stalled and gives two safe operator paths',async()=>{
  const res=await run(stalled);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.bootstrap.state,'CREDENTIAL_ISSUED_RELAY_NOT_STARTED');
  assert.equal(res.body.bootstrap.stalled_credential,true);
  assert.equal(res.body.bootstrap.operator_path,'RUN_V205_OR_ROTATE_LOST_KEY');
  assert.equal(res.body.bootstrap.paths.length,2);
  assert.equal(res.body.bootstrap.paths[0].code,'KEY_AVAILABLE');
  assert.equal(res.body.bootstrap.paths[1].code,'KEY_LOST');
  assert.equal(res.body.bootstrap.paths[1].secret_recovery_available,false);
  assert.equal(res.body.secret_boundary.bridge_key_public,false);
  assert.equal(res.body.secret_boundary.bridge_key_recoverable,false);
  assert.equal(res.body.secret_boundary.rotation_requires_owner_mfa,true);
});

test('V12 never turns relay bootstrap completion into trade permission',async()=>{
  const fixtures=structuredClone(stalled);
  fixtures['/api/q4-machine-v11'].broker_reference={quote_ready:true,grade:'READ_ONLY_BROKER_MARKET_REFERENCE_VERIFIED'};
  fixtures['/api/gold-relay-observability-v199']={
    ok:true,state:'RELAY_STREAMING',
    bridge:{authentication_reached:true,total_authenticated_requests:50,age_seconds:100},
    relay:{
      first_tick_seen:true,accepted_ticks_examined:500,ticks_60s:30,streaming:true,
      terminal_connected:true,relay_version:'V186',mt5_package_version:'5.0.6231',os_family:'Windows'
    }
  };
  fixtures['/api/gold-activation-orchestrator-v204']={
    ok:true,state:'LIVE_DATA_READY',
    phase:{number:6,total:6,passed_gates:6},
    commissioning_progress_pct:100,
    next_step_code:'NONE'
  };

  const res=await run(fixtures);
  assert.equal(res.body.bootstrap.state,'RELAY_STREAMING');
  assert.equal(res.body.bootstrap.operator_path,'NO_BOOTSTRAP_ACTION_REQUIRED');
  assert.equal(res.body.gates.passed_count,6);
  assert.equal(res.body.bootstrap_firewall.successful_tick_is_not_execution_permission,true);
  assert.equal(res.body.bootstrap_firewall.no_orders,true);
  assert.equal(res.body.governance.action_permitted,'WAIT');
  assert.equal(res.body.governance.capital_permission,'0R');
});

test('V12 keeps the public artifact list free of bridge secrets',async()=>{
  const res=await run(stalled);
  const serialized=JSON.stringify(res.body);
  assert.equal(serialized.includes('tfa_live_'),false);
  assert.equal('bridge_key' in res.body.public_artifacts,false);
  assert.equal(res.body.public_artifacts.owner_control_path,'/owner/');
});
