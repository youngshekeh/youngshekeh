import test from 'node:test';
import assert from 'node:assert/strict';
import {createBridgeIntakeHandler} from '../supabase/functions/broker-sandbox-bridge-intake/handler.mjs';
const secret='tfa_demo_'+'a'.repeat(43);
function setup({method='POST',headers={},body={sequence:1,observed_at:'2026-10-02T17:00:00Z',event_type:'QUOTE',bid:4200,ask:4200.2},authOk=true}={}){
 const calls=[];const fetchImpl=async(url,init)=>{calls.push({url,init});
  if(url.endsWith('/get_v184_gold_sandbox_bridge_transport_status'))return Response.json({ok:true,state:'NO_ACTIVE_SANDBOX_BRIDGE',governance:{capital_permission:'0R'}});
  if(url.endsWith('/authenticate_v184_gold_sandbox_bridge'))return Response.json(authOk?{ok:true,bridge_id:3,owner_user_id:'12345678-1234-1234-1234-123456789012',source_code:'MT5_DEMO',provider_symbol:'XAUUSDm',production_capable:false,live_order_submission_enabled:false,capital_permission:'0R'}:{ok:false,error:'invalid_bridge_credential'});
  if(url.endsWith('/get_v185_gold_sandbox_bridge_health_status'))return Response.json({ok:true,state:'SANDBOX_BRIDGE_HEALTHY',clients:[{bridge_id:3,healthy:true,fresh:true}]});
  if(url.endsWith('/ingest_v183_gold_sandbox_receipt'))return Response.json({ok:true,sandbox_only:true,capital_permission:'0R',execution_grade:false,production_broker_verified:false,live_order_submission_enabled:false,state:'SANDBOX_RECEIPT_RECORDED',receipt_id:12,inserted:true});
  return Response.json({ok:false},{status:500});
 };
 const h=createBridgeIntakeHandler({base:'https://test.invalid',serverKey:()=> 'sb_secret_test',fetchImpl});
 const all={'Content-Type':'application/json','X-TFA-Bridge-Id':'3','X-TFA-Bridge-Key':secret,...headers};
 return{calls,result:h(new Request('https://test.invalid/intake',{method,headers:all,...(method==='POST'?{body:JSON.stringify(body)}:{})}))};
}
test('public GET exposes aggregate transport status',async()=>assert.equal((await setup({method:'GET'}).result).status,200));
test('invalid bridge credential fails closed',async()=>assert.equal((await setup({authOk:false}).result).status,401));
test('authenticated bridge canonicalizes identity server-side',async()=>{
 const s=setup();const r=await s.result;assert.equal(r.status,200);
 const call=s.calls.find(x=>x.url.endsWith('/ingest_v183_gold_sandbox_receipt'));const args=JSON.parse(call.init.body);
 assert.equal(args.p_receipt.source_code,'MT5_DEMO');assert.equal(args.p_receipt.provider_symbol,'XAUUSDm');
 assert.equal(args.p_receipt.mode,'BROKER_DEMO_SANDBOX');assert.equal(args.p_receipt.provenance,'DEMO_BROKER_USER_SUPPLIED');
});
test('bridge cannot override enrolled source identity',async()=>{
 const s=setup({body:{sequence:1,observed_at:'2026-10-02T17:00:00Z',event_type:'QUOTE',bid:4200,ask:4200.2,source_code:'ATTACK'}});
 assert.equal((await s.result).status,422);assert.equal(s.calls.some(x=>x.url.endsWith('/ingest_v183_gold_sandbox_receipt')),false);
});
