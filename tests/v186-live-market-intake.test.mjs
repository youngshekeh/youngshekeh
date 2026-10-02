import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveMarketIntakeHandler} from '../supabase/functions/broker-live-market-intake/handler.mjs';
const secret='tfa_live_'+'a'.repeat(43);
function fixture({auth=true}={}){
 const calls=[];const fetchImpl=async(url,init)=>{calls.push({url,init});
  if(url.endsWith('/get_v186_gold_live_market_status'))return Response.json({ok:true,state:'WAITING_FOR_LIVE_MARKET_BRIDGE'});
  if(url.endsWith('/authenticate_v186_gold_live_market_bridge'))return Response.json(auth?{ok:true,bridge_id:4,owner_user_id:'12345678-1234-1234-1234-123456789012',source_code:'MT5_LIVE_XAU',provider_symbol:'XAUUSD',capital_permission:'0R'}:{ok:false,error:'invalid_bridge_credential'});
  if(url.endsWith('/ingest_v186_gold_live_tick'))return Response.json({ok:true,state:'LIVE_XAUUSD_TICK_RECORDED',tick_id:8,inserted:true,capital_permission:'0R'});
  return Response.json({ok:false},{status:500});
 };
 return{calls,h:createLiveMarketIntakeHandler({base:'https://test.invalid',serverKey:()=> 'sb_secret_test',fetchImpl})};
}
const body={observed_at:'2026-10-02T18:20:00Z',sequence:1,trade_mode:'REAL',bid:4165.1,ask:4165.3,last:0,terminal_tick_time_msc:1790965200000,tick_flags:6,volume_real:0,terminal_build:6200,terminal_connected:true,digits:2,point:.01,relay_version:'v186.0',mt5_package_version:'5.0.6231',os_family:'Windows'};
test('public GET exposes live status without bridge secret',async()=>{const x=fixture();const r=await x.h(new Request('https://x/status'));assert.equal(r.status,200);});
test('invalid bridge secret fails closed',async()=>{const x=fixture({auth:false});const r=await x.h(new Request('https://x/intake',{method:'POST',headers:{'Content-Type':'application/json','X-TFA-Live-Bridge-Id':'4','X-TFA-Live-Bridge-Key':secret},body:JSON.stringify(body)}));assert.equal(r.status,401);});
test('authenticated REAL tick reaches V186 RPC and remains market-data only',async()=>{
 const x=fixture();const r=await x.h(new Request('https://x/intake',{method:'POST',headers:{'Content-Type':'application/json','X-TFA-Live-Bridge-Id':'4','X-TFA-Live-Bridge-Key':secret},body:JSON.stringify(body)}));assert.equal(r.status,200);
 const call=x.calls.find(c=>c.url.endsWith('/ingest_v186_gold_live_tick'));assert(call);const out=await r.json();assert.equal(out.governance.capital_permission,'0R');assert.equal(out.governance.market_data_only,true);
});
