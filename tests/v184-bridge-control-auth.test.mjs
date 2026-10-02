import test from 'node:test';
import assert from 'node:assert/strict';
import {createBridgeControlHandler} from '../supabase/functions/broker-sandbox-bridge-control/handler.mjs';
const user='12345678-1234-1234-1234-123456789012';
const token=aal=>`x.${Buffer.from(JSON.stringify({aal})).toString('base64url')}.x`;
function setup({body={action:'status'},aal='aal2',owner=true,valid=true,hasToken=true,rpcBody}={}){
 const calls=[];const fetchImpl=async(url,init)=>{calls.push({url,init});
  if(url.includes('/auth/v1/user'))return Response.json(valid?{id:user}:{error:'bad'},{status:valid?200:401});
  if(url.includes('/owner_users?'))return Response.json(owner?[{role:'owner',active:true}]:[]);
  if(url.endsWith('/list_v184_gold_sandbox_bridges'))return Response.json(rpcBody||{ok:true,bridges:[],governance:{capital_permission:'0R'}});
  if(url.endsWith('/create_v184_gold_sandbox_bridge'))return Response.json(rpcBody||{ok:true,state:'SANDBOX_BRIDGE_CREATED',bridge_id:9,bridge_label:'MT5 Demo',source_code:'MT5_DEMO',provider_symbol:'XAUUSD',mode:'BROKER_DEMO_SANDBOX',production_capable:false,live_order_submission_enabled:false,capital_permission:'0R'});
  if(url.endsWith('/revoke_v184_gold_sandbox_bridge'))return Response.json(rpcBody||{ok:true,state:'SANDBOX_BRIDGE_REVOKED',bridge_id:9,capital_permission:'0R',live_order_submission_enabled:false});
  return Response.json({ok:false},{status:500});
 };
 const h=createBridgeControlHandler({base:'https://test.invalid',serverKey:()=> 'sb_secret_test',fetchImpl});
 const headers={'Content-Type':'application/json'};if(hasToken)headers.Authorization=`Bearer ${token(aal)}`;
 return{calls,result:h(new Request('https://test.invalid/control',{method:'POST',headers,body:JSON.stringify(body)}))};
}
for(const [name,opts,status] of [['anonymous',{hasToken:false},401],['invalid session',{valid:false},401],['non-owner',{owner:false},403],['weak MFA',{aal:'aal1'},403]])
 test(name,async()=>assert.equal((await setup(opts).result).status,status));
test('create returns secret once but only a digest reaches database RPC',async()=>{
 const s=setup({body:{action:'create',bridge_label:'MT5 Demo',source_code:'MT5_DEMO',provider_symbol:'XAUUSD'}});
 const res=await s.result;assert.equal(res.status,200);const out=await res.json();
 assert.match(out.bridge_key,/^tfa_demo_[A-Za-z0-9_-]{40,80}$/);assert.equal(out.bridge_key_display_once,true);
 const call=s.calls.find(x=>x.url.endsWith('/create_v184_gold_sandbox_bridge'));const args=JSON.parse(call.init.body);
 assert.match(args.p_key_sha256,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(args).includes(out.bridge_key),false);
});
