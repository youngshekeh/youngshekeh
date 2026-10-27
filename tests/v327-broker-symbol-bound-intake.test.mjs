import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveMarketIntakeHandler} from '../docs/release/V327-REVIEW-ONLY-broker-live-market-intake.mjs';

const origin='https://mt5-v327-tests.invalid';
const bridgeKey='tfa_live_'+'k'.repeat(48);
const bridgeId=13;
const governance={action_permitted:'WAIT',capital_permission:'0R',
  live_order_submission_enabled:false,machine_execution_allowed:false,
  market_data_only:true};
const detailedStatus={
  ok:true,state:'BROKER_LIVE',
  source:{connected:true,bridge_id:13,bridge_label:'do-not-leak',
    owner_user_id:'private-owner',provider_symbol:'XAUUSD.r'},
  quote:{observed_at:new Date().toISOString(),mid:4390.45,
    bid:4390.2,ask:4390.7,age_seconds:1,trade_mode:'REAL'},
  quality:{fresh:true,tick_count_60s:8},
  governance
};
const data=()=>({
  observed_at:new Date().toISOString(),sequence:1,trade_mode:'DEMO',
  bid:4390.2,ask:4390.7,terminal_tick_time_msc:Date.now(),
  tick_flags:6,volume_real:0,terminal_build:5600,
  terminal_connected:true,digits:2,point:0.01,
  relay_version:'v186.0',mt5_package_version:'5.0.6231',
  os_family:'Windows'
});
function fake(opts={}){
  const calls=[];
  const handler=createLiveMarketIntakeHandler({
    base:'https://only-fake-supabase.invalid',
    serverKey:()=> 'service-role-test-only',
    fetchImpl:async(url,init)=>{
      const path=new URL(url).pathname;
      calls.push({path,method:init?.method,body:init?.body});
      let response;
      if(path.endsWith('/get_v186_gold_live_market_status'))
        response=opts.status??detailedStatus;
      else if(path.endsWith('/authenticate_v186_gold_live_market_bridge'))
        response={ok:opts.authOk!==false,
          source_code:'FAKE_MT5',
          provider_symbol:opts.enrolledSymbol??'XAUUSD.r',
          bridge_id:13,owner_user_id:'SECRET_OWNER'};
      else if(path.endsWith('/ingest_v186_gold_live_tick'))
        response=opts.ingest??{
          ok:true,inserted:true,state:'LIVE_XAUUSD_TICK_RECORDED',
          tick_id:202,bridge_id:13,source_code:'INTERNAL',
          bid:4390.2,ask:4390.7
        };
      else throw Error('unexpected fake REST path '+path);
      return new Response(JSON.stringify(response),{
        status:opts.rpcError?.includes(path.split('/').at(-1))?503:200,
        headers:{'Content-Type':'application/json'}});
    }
  });
  return {calls,call:async(method='GET',{symbol='XAUUSD.r',
    key=bridgeKey,payload=data(),id=bridgeId}={})=>{
    const headers={'x-tfa-live-bridge-id':String(id),
      'x-tfa-live-bridge-key':key,'x-tfa-mt5-symbol':symbol};
    if(method==='POST')headers['content-type']='application/json';
    const request=new Request(origin+'/broker',{method,headers,
      ...(method==='POST'?{body:JSON.stringify(payload)}:{})});
    const res=await handler(request);
    return{status:res.status,body:await res.json(),
      cache:res.headers.get('cache-control')};
  }};
}
test('anonymous GET is a redacted health response with no broker prices, account or bridge IDs',async()=>{
  const x=fake();const r=await x.call();
  assert.equal(r.status,200);
  assert.equal(r.cache,'no-store');
  assert.equal(r.body.first_tick_received,true);
  assert.equal(r.body.quote_fresh,true);
  assert.equal(r.body.quote_price,null);
  assert.equal(r.body.governance.capital_permission,'0R');
  assert.equal(r.body.governance.machine_execution_allowed,false);
  const p=JSON.stringify(r.body);
  for(const secret of ['4390.45','4390.2','4390.7','private-owner','SECRET_OWNER',
      'do-not-leak','"bridge_id":','"provider_symbol":','trade_mode','tick_count_60s'])
    assert.ok(!p.includes(secret),'public leaked '+secret);
  assert.equal(Object.hasOwn(r.body,'bridge_id'),false);
  assert.equal(Object.hasOwn(r.body,'source'),false);
  assert.equal(Object.hasOwn(r.body,'quote'),false);
  assert.equal(x.calls.length,1);
});
test('no tick remains clearly absent, never fake BROKER_LIVE',async()=>{
  const x=fake({status:{ok:true,state:'LIVE_MARKET_BRIDGE_WAITING_FOR_TICK',
    quote:null,source:{connected:false},quality:{fresh:false}}});
  const r=await x.call();
  assert.equal(r.status,200);
  assert.equal(r.body.first_tick_received,false);
  assert.equal(r.body.quote_fresh,false);
  assert.equal(r.body.quote_observed_at,null);
});
test('stale recorded broker tick is not a fresh quote',async()=>{
  const x=fake({status:{...detailedStatus,
    state:'BROKER_STALE',quality:{fresh:false},
    quote:{...detailedStatus.quote,age_seconds:4400}}});
  const r=await x.call();
  assert.equal(r.body.first_tick_received,true);
  assert.equal(r.body.quote_fresh,false);
  assert.equal(r.body.quote_price,null);
});
test('authenticated writer must declare broker symbol before credentials are checked',async()=>{
  const x=fake();const r=await x.call('POST',{symbol:''});
  assert.equal(r.status,422);
  assert.equal(r.body.error,'missing_or_invalid_broker_symbol');
  assert.equal(x.calls.length,0);
});
test('correct bridge key but wrong broker suffix cannot ingest or contaminate XAUUSD',async()=>{
  const x=fake();const r=await x.call('POST',{symbol:'XAUUSD'});
  assert.equal(r.status,422);
  assert.equal(r.body.error,'bridge_symbol_mismatch');
  assert.equal(x.calls.filter(c=>c.path.includes('authenticate_')).length,1);
  assert.equal(x.calls.filter(c=>c.path.includes('ingest_')).length,0);
});
test('correct symbol and key ingest only one valid tick and return a minimal ACK',async()=>{
  const x=fake();const r=await x.call('POST');
  assert.equal(r.status,200);
  assert.equal(r.cache,'no-store');
  assert.equal(r.body.ok,true);
  assert.equal(r.body.inserted,true);
  assert.equal(r.body.state,'LIVE_XAUUSD_TICK_RECORDED');
  assert.equal(r.body.symbol_binding_verified,true);
  assert.equal(r.body.governance.machine_execution_allowed,false);
  assert.equal(x.calls.filter(c=>c.path.includes('ingest_')).length,1);
  assert.equal(x.calls.filter(c=>c.path.includes('authenticate_')).length,1);
  const upstreamTick=JSON.parse(x.calls.at(-1).body).p_tick;
  assert.equal(upstreamTick.trade_mode,'DEMO');
  assert.equal(upstreamTick.relay_version,'v186.0');
  assert.equal(upstreamTick.mt5_package_version,'5.0.6231');
  assert.equal(upstreamTick.account_id,undefined);
  assert.equal(upstreamTick.symbol,undefined);
  const publicText=JSON.stringify(r.body);
  for(const secret of ['FAKE_MT5','202','bridge_id','4390.2','4390.7',
    'SECRET_OWNER','source_code','provider_symbol'])
    assert.ok(!publicText.includes(secret),'ACK leaked '+secret);
});
test('incorrect bridge credential never ingests a tick',async()=>{
  const x=fake({authOk:false});const r=await x.call('POST');
  assert.equal(r.status,401);
  assert.equal(r.body.error,'invalid_bridge_credential');
  assert.equal(x.calls.filter(c=>c.path.includes('ingest_')).length,0);
});
test('missing or malformed auth header rejects without Supabase call',async()=>{
  const x=fake();const r=await x.call('POST',{key:'invalid'});
  assert.equal(r.status,401);
  assert.equal(x.calls.length,0);
});
test('server duplicate receipt is idempotent, redacted and still capital WAIT/0R',async()=>{
  const x=fake({ingest:{ok:true,inserted:false,
    state:'DUPLICATE_TICK_ALREADY_RECORDED',tick_id:999,
    bridge_id:13}});
  const r=await x.call('POST');
  assert.equal(r.status,200);
  assert.equal(r.body.state,'DUPLICATE_TICK_ALREADY_RECORDED');
  assert.equal(r.body.inserted,false);
  assert.equal(r.body.governance.capital_permission,'0R');
  assert.equal(r.body.tick_id,undefined);
});
test('stale/out-of-order provider rejection cannot masquerade as a stored tick',async()=>{
  const x=fake({ingest:{ok:false,error:'out_of_order_tick',
    state:'REJECTED',tick_id:1000}});
  const r=await x.call('POST');
  assert.equal(r.status,409);
  assert.equal(r.body.ok,false);
  assert.equal(r.body.inserted,false);
  assert.equal(r.body.error,'out_of_order_tick');
  assert.equal(r.body.state,'TICK_VALIDATION_REJECTED');
  assert.equal(r.body.tick_id,undefined);
});
test('unknown provider RPC error is generic and cannot leak raw response',async()=>{
  const x=fake({ingest:{ok:false,error:'sensitive_account_or_provider_data',
    price:4390.5,customer_id:'private'}});
  const r=await x.call('POST');
  assert.equal(r.status,422);
  assert.equal(r.body.error,'tick_validation_rejected');
  assert.equal(r.body.price,undefined);
  assert.equal(r.body.customer_id,undefined);
});
test('upstream RPC unavailable cannot be treated as a valid quote',async()=>{
  const x=fake({rpcError:['ingest_v186_gold_live_tick']});
  const r=await x.call('POST');
  assert.equal(r.status,503);
  assert.equal(r.body.error,'live_tick_intake_unavailable');
  assert.equal(r.body.governance.live_order_submission_enabled,false);
});
test('public GET upstream failure returns 503 and no leaked details',async()=>{
  const x=fake({rpcError:['get_v186_gold_live_market_status']});
  const r=await x.call();
  assert.equal(r.status,503);
  assert.equal(r.body.error,'live_market_status_unavailable');
  assert.equal(r.cache,'no-store');
});
test('unknown HTTP method remains denied before upstream calls',async()=>{
  const x=fake();const r=await x.call('DELETE');
  assert.equal(r.status,405);
  assert.equal(r.body.governance.machine_execution_allowed,false);
  assert.equal(x.calls.length,0);
});
