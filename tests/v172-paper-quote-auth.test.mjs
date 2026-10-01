import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuoteIntakeHandler } from '../supabase/functions/paper-broker-quote-intake/handler.mjs';
const user='12345678-1234-1234-1234-123456789012';
const token=aal=>`test.${Buffer.from(JSON.stringify({aal})).toString('base64url')}.signature`;
function scenario({valid=true,owner=true,aal='aal2',rpcResult={ok:true,inserted:true},method='POST',body='{}',origin,contentType='application/json',hasToken=true}={}) {
 const calls=[];
 const fetchImpl=async(url,init)=>{
  calls.push({url,init});
  if(url.includes('/auth/v1/user'))return Response.json(valid?{id:user}:{error:'invalid'},{status:valid?200:401});
  if(url.includes('/owner_users?'))return Response.json(owner?[{role:'owner',active:true}]:[]);
  if(url.endsWith('/get_v172_gold_paper_quote_status'))return Response.json({ok:true,state:'NOT_CONNECTED',governance:{capital_permission:'0R'}});
  return Response.json(rpcResult);
 };
 const handler=createQuoteIntakeHandler({base:'https://test.invalid',serverKey:()=> 'sb_secret_test',fetchImpl});
 const headers={};
 if(hasToken)headers.Authorization=`Bearer ${token(aal)}`;
 if(contentType)headers['Content-Type']=contentType;
 if(origin)headers.Origin=origin;
 const request=new Request('https://test.invalid/intake',{method,headers,...(method==='POST'?{body}:{})});
 return {calls,result:handler(request)};
}
for(const [name,options,status] of [
 ['anonymous write',{hasToken:false},401],['invalid session',{valid:false},401],['non-owner',{owner:false},403],
 ['weak MFA',{aal:'aal1'},403],['hostile origin',{origin:'https://evil.invalid'},403],
 ['malformed JSON',{body:'{'},400],['oversized body',{body:'x'.repeat(16385)},413],['non-JSON body',{contentType:'text/plain'},415],
 ['wrong method',{method:'DELETE'},405]
])test(name,async()=>{const s=scenario(options);const r=await s.result;assert.equal(r.status,status);assert.equal((await r.json()).governance.capital_permission,'0R');assert(!s.calls.some(x=>x.url.endsWith('/ingest_v172_gold_paper_quote')));});
test('verified owner uses server-resolved identity',async()=>{
 const s=scenario({body:JSON.stringify({owner_user_id:'attacker',bid:4200,ask:4200.5})});
 const r=await s.result;assert.equal(r.status,200);const call=s.calls.find(x=>x.url.endsWith('/ingest_v172_gold_paper_quote'));
 assert.equal(JSON.parse(call.init.body).p_owner_user_id,user);assert.equal(call.init.headers.apikey,'sb_secret_test');assert.equal(call.init.headers.Authorization,undefined);
 assert.equal((await r.json()).governance.live_order_submission_enabled,false);
});
test('anonymous GET only reads sanitized status',async()=>{const s=scenario({method:'GET',hasToken:false});assert.equal((await s.result).status,200);assert.equal(s.calls.length,1);assert(s.calls[0].url.endsWith('/get_v172_gold_paper_quote_status'));});
for(const [error,status] of [['paper_intake_rate_limit',429],['conflicting_replay',409],['out_of_order_quote',409],['quote_rejected',422]])
 test(error,async()=>{const s=scenario({rpcResult:{ok:false,error}});assert.equal((await s.result).status,status);});
