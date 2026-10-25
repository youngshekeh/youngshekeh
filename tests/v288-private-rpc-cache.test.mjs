import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadOnlyState,STATE_TTL_MS,STATE_RPC_CACHE_MS} from '../supabase/functions/runtime-v70-autonomous-state/read-only-state.mjs';

const START=Date.parse('2026-10-25T06:00:00Z');
const packet=()=>({ok:true,generated_at:new Date(START).toISOString(),
  mode:'RESEARCH_ONLY',system_score:85,
  governance:{action_permitted:'WAIT',capital_permission:'0R',can_self_promote:false},
  health:{database:'ONLINE'},private_detail:'must-not-publish'});
const req=()=>new Request('https://private.example/ignored?user=none',{
  method:'GET',headers:{Authorization:'Bearer fixture-workload-identity'}});
test('V288: positive RPC cache is strictly bounded at 30 seconds, auth still runs per request',async()=>{
  assert.equal(STATE_RPC_CACHE_MS,30000);
  assert.ok(STATE_RPC_CACHE_MS<STATE_TTL_MS);
  let time=START,rpc=0,auth=0;
  const handler=createReadOnlyState({base:'https://fixed.example',serviceKey:'fixture-server-credential',now:()=>time,
    fetchImpl:async(url,options)=>{
      if(url.endsWith('oidc-probe')){auth++;return Response.json({ok:true,state:'VERCEL_WORKLOAD_VERIFIED'})}
      assert.equal(url,'https://fixed.example/rest/v1/rpc/get_v70_autonomous_state');
      assert.equal(options.method,'POST');
      assert.equal(options.body,'{}');rpc++;return Response.json(packet());
    }
  });
  for(const dt of [0,29000,29999,30001,59999,60002]){
    time=START+dt;
    const res=await handler(req());
    assert.equal(res.status,200);
    assert.equal(res.headers.get('cache-control'),'no-store');
    assert.equal((await res.json()).checkout_certified,false);
  }
  assert.equal(auth,6,'Every request requires independent workload authorization');
  assert.equal(rpc,3,'Only one canonical RPC per 30-second time slice in one isolate');
});
test('V288: cached observation cannot outrun 10-minute source freshness window',async()=>{
  let time=START,rpc=0;
  const handler=createReadOnlyState({base:'https://fixed.example',serviceKey:'fixture-server-credential',now:()=>time,
    fetchImpl:async url=>url.endsWith('oidc-probe')
      ?Response.json({ok:true,state:'VERCEL_WORKLOAD_VERIFIED'})
      :(rpc++,Response.json(packet()))});
  assert.equal((await handler(req())).status,200);
  time=START+STATE_TTL_MS+1;
  const res=await handler(req());
  assert.equal(res.status,503);
  const b=await res.json();
  assert.equal(b.state,'STALE_RESEARCH_SNAPSHOT');
  assert.equal(b.capital_permission,'0R');
  assert.equal(b.live_order_submission_enabled,false);
  assert.equal(rpc,2);
  assert.doesNotMatch(JSON.stringify(b),/must-not-publish|fixture-server-credential/);
});
test('V288: expired cache fails closed if canonical RPC cannot be refreshed',async()=>{
  let time=START,rpc=0;
  const handler=createReadOnlyState({base:'https://fixed.example',serviceKey:'fixture-server-credential',now:()=>time,
    fetchImpl:async url=>url.endsWith('oidc-probe')
      ?Response.json({ok:true,state:'VERCEL_WORKLOAD_VERIFIED'})
      :++rpc===1?Response.json(packet()):Promise.reject(new Error('sensitive internal details'))});
  assert.equal((await handler(req())).status,200);
  time+=STATE_RPC_CACHE_MS+1;
  const res=await handler(req()),b=await res.json();
  assert.equal(res.status,503);
  assert.equal(b.usable,false);
  assert.equal(b.capital_permission,'0R');
  assert.equal(b.governance.can_self_promote,false);
  assert.doesNotMatch(JSON.stringify(b),/sensitive internal details/);
  assert.equal(rpc,2);
});
