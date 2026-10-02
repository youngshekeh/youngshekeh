import test from 'node:test';
import assert from 'node:assert/strict';
import {createSandboxReceiptHandler} from '../supabase/functions/broker-sandbox-receipt-intake/handler.mjs';
const user='12345678-1234-1234-1234-123456789012';
const token=aal=>`test.${Buffer.from(JSON.stringify({aal})).toString('base64url')}.sig`;
function setup({owner=true,aal='aal2',valid=true,method='POST',body='{}',hasToken=true,rpc={ok:true,sandbox_only:true,capital_permission:'0R',execution_grade:false,production_broker_verified:false,live_order_submission_enabled:false,state:'SANDBOX_RECEIPT_RECORDED',inserted:true,receipt_id:1}}={}){
 const calls=[];const fetchImpl=async(url,init)=>{calls.push({url,init});
   if(url.includes('/auth/v1/user'))return Response.json(valid?{id:user}:{error:'bad'},{status:valid?200:401});
   if(url.includes('/owner_users?'))return Response.json(owner?[{role:'owner',active:true}]:[]);
   if(url.endsWith('/get_v183_gold_sandbox_certification_status'))return Response.json({ok:true,state:'WAITING_FOR_SANDBOX_RECEIPTS',governance:{capital_permission:'0R'}});
   return Response.json(rpc);
 };
 const h=createSandboxReceiptHandler({base:'https://test.invalid',serverKey:()=> 'sb_secret_test',fetchImpl});
 const headers={'Content-Type':'application/json'};if(hasToken)headers.Authorization=`Bearer ${token(aal)}`;
 return{calls,result:h(new Request('https://test.invalid/intake',{method,headers,...(method==='POST'?{body}:{})}))};
}
for(const [name,opts,status] of [['anon',{hasToken:false},401],['bad session',{valid:false},401],['non-owner',{owner:false},403],['aal1',{aal:'aal1'},403],['bad method',{method:'DELETE'},405]])
 test(name,async()=>assert.equal((await setup(opts).result).status,status));
test('GET exposes only sanitized aggregate status',async()=>{const s=setup({method:'GET',hasToken:false});const r=await s.result;assert.equal(r.status,200);assert.equal((await r.json()).state,'WAITING_FOR_SANDBOX_RECEIPTS');});
test('owner identity is server resolved and service credential is not copied from caller',async()=>{const s=setup({body:JSON.stringify({owner_user_id:'attacker'})});const r=await s.result;assert.equal(r.status,200);
 const call=s.calls.find(x=>x.url.endsWith('/ingest_v183_gold_sandbox_receipt'));const b=JSON.parse(call.init.body);assert.equal(b.p_owner_user_id,user);assert.equal(call.init.headers.apikey,'sb_secret_test');assert.equal(call.init.headers.Authorization,undefined);
 const out=await r.json();assert.equal(out.governance.capital_permission,'0R');assert.equal(out.governance.production_broker_verified,false);
});
