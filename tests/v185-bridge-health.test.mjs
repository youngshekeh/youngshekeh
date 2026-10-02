import test from 'node:test';
import assert from 'node:assert/strict';
import {createBridgeHealthHandler} from '../supabase/functions/broker-sandbox-bridge-health/handler.mjs';
const secret='tfa_demo_'+'a'.repeat(43);
function setup({method='POST',body,authOk=true}={}){
 const heartbeat=body||{observed_at:'2026-10-02T17:59:59Z',heartbeat_sequence:1,relay_version:'v185.0',mt5_package_version:'5.0.6231',python_version:'3.12.14',os_family:'Windows',terminal_build:5000,terminal_connected:true,trade_mode:'DEMO',symbol_resolved:true,history_access:true,process_uptime_seconds:10};
 const calls=[];
 const fetchImpl=async(url,init)=>{calls.push({url,init});
  if(url.endsWith('/get_v185_gold_sandbox_bridge_health_status'))return Response.json({ok:true,state:'NO_ACTIVE_SANDBOX_BRIDGE',counts:{active_bridges:0},clients:[],governance:{capital_permission:'0R'}});
  if(url.endsWith('/authenticate_v184_gold_sandbox_bridge'))return Response.json(authOk?{ok:true,bridge_id:3,owner_user_id:'12345678-1234-1234-1234-123456789012',source_code:'MT5_DEMO',provider_symbol:'XAUUSD',capital_permission:'0R'}:{ok:false,error:'invalid_bridge_credential'});
  if(url.endsWith('/ingest_v185_gold_sandbox_bridge_heartbeat'))return Response.json({ok:true,state:'DEMO_BRIDGE_HEARTBEAT_RECORDED',heartbeat_id:7,inserted:true,capital_permission:'0R',production_capable:false,production_broker_verified:false,live_order_submission_enabled:false});
  return Response.json({ok:false},{status:500});
 };
 const h=createBridgeHealthHandler({base:'https://test.invalid',serverKey:()=> 'sb_secret_test',fetchImpl});
 const headers={'Content-Type':'application/json','X-TFA-Bridge-Id':'3','X-TFA-Bridge-Key':secret};
 return{calls,result:h(new Request('https://test.invalid/health',{method,headers,...(method==='POST'?{body:JSON.stringify(heartbeat)}:{})}))};
}
test('public GET exposes sanitized health only',async()=>assert.equal((await setup({method:'GET'}).result).status,200));
test('invalid bridge credential fails closed',async()=>assert.equal((await setup({authOk:false}).result).status,401));
test('REAL mode heartbeat is blocked before storage',async()=>{
 const s=setup({body:{observed_at:'2026-10-02T17:59:59Z',heartbeat_sequence:1,relay_version:'v185.0',mt5_package_version:'5.0.6231',python_version:'3.12.14',os_family:'Windows',terminal_build:5000,terminal_connected:true,trade_mode:'REAL',symbol_resolved:true,history_access:true,process_uptime_seconds:10}});
 assert.equal((await s.result).status,422);
 assert.equal(s.calls.some(x=>x.url.endsWith('/ingest_v185_gold_sandbox_bridge_heartbeat')),false);
});
test('authenticated DEMO heartbeat reaches canonical RPC',async()=>{
 const s=setup();const r=await s.result;assert.equal(r.status,200);
 const call=s.calls.find(x=>x.url.endsWith('/ingest_v185_gold_sandbox_bridge_heartbeat'));
 const args=JSON.parse(call.init.body);assert.equal(args.p_bridge_id,3);assert.equal(args.p_heartbeat.trade_mode,'DEMO');
 const out=await r.json();assert.equal(out.governance.capital_permission,'0R');assert.equal(out.governance.health_can_unlock_capital,false);
});
