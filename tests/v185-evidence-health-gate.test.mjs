import test from 'node:test';
import assert from 'node:assert/strict';
import {createBridgeIntakeHandler} from '../supabase/functions/broker-sandbox-bridge-intake/handler.mjs';
const secret='tfa_demo_'+'a'.repeat(43);
function handler(healthy){
 const calls=[];
 const fetchImpl=async(url,init)=>{calls.push({url,init});
  if(url.endsWith('/authenticate_v184_gold_sandbox_bridge'))return Response.json({ok:true,bridge_id:3,owner_user_id:'12345678-1234-1234-1234-123456789012',source_code:'MT5_DEMO',provider_symbol:'XAUUSD',capital_permission:'0R'});
  if(url.endsWith('/get_v185_gold_sandbox_bridge_health_status'))return Response.json({ok:true,clients:[{bridge_id:3,healthy,fresh:healthy}]});
  if(url.endsWith('/ingest_v183_gold_sandbox_receipt'))return Response.json({ok:true,state:'SANDBOX_RECEIPT_RECORDED',receipt_id:1,inserted:true,capital_permission:'0R'});
  return Response.json({ok:false},{status:500});
 };
 return{calls,h:createBridgeIntakeHandler({base:'https://test.invalid',serverKey:()=> 'sb_secret_test',fetchImpl})};
}
const event={sequence:1,observed_at:'2026-10-02T17:59:59Z',event_type:'QUOTE',bid:4200,ask:4200.2};
const req=()=>new Request('https://test.invalid/intake',{method:'POST',headers:{'Content-Type':'application/json','X-TFA-Bridge-Id':'3','X-TFA-Bridge-Key':secret},body:JSON.stringify(event)});
test('sandbox evidence is blocked until bridge health is fresh and healthy',async()=>{
 const x=handler(false);const r=await x.h(req());assert.equal(r.status,412);
 assert.equal(x.calls.some(c=>c.url.endsWith('/ingest_v183_gold_sandbox_receipt')),false);
});
test('healthy bridge may forward sandbox evidence but still cannot unlock capital',async()=>{
 const x=handler(true);const r=await x.h(req());assert.equal(r.status,200);
 assert.equal(x.calls.some(c=>c.url.endsWith('/ingest_v183_gold_sandbox_receipt')),true);
 const out=await r.json();assert.equal(out.governance.capital_permission,'0R');
});
