import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
import {boundedJson,curateVerifiedTransaction,fulfillVerifiedCharge}
 from '../supabase/functions/flutterwave-webhook/charge.mjs';
const NOW=Date.parse('2026-10-24T00:00:00Z');
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const transaction=()=>({id:735001,tx_ref:'fixture-checkout',status:'successful',amount:79,
 currency:'USD',created_at:'2026-10-23T23:59:00Z',customer:{id:1234,email:'fixture@example.invalid'},
 subscription_id:5678,payment_plan:9012,meta:{plan_id:'pro',user_id:'fixture-user'}});
const receipt=()=>({atomic_fulfillment_committed:true,event_dedupe_record_committed:true,
 entitlement_upsert_committed:true,observed_at:'2026-10-24T00:00:00Z'});
const json=(data,status=200)=>Response.json(data,{status});
const options=()=>({payload:{event:'charge.completed',data:{id:735001}},base:'https://project.example.invalid',
 key:'fixture-service-key',flwKey:'fixture-provider-key',signatureMode:'verif_hash',now:()=>NOW});
const provider=(data=transaction())=>json({status:'success',data});

test('successful charge is acknowledged only after the atomic RPC returns a committed receipt',async()=>{
 const calls=[];
 const response=await fulfillVerifiedCharge({...options(),fetchImpl:async(url,init)=>{
  calls.push({url,init});
  return calls.length===1?provider():json({ok:true,state:'COMMITTED',receipt:receipt()});
 }});
 assert.equal(response.status,200);assert.equal((await response.json()).state,'COMMITTED');
 assert.equal(calls.length,2);
 assert.equal(calls[0].url,'https://api.flutterwave.com/v3/transactions/735001/verify');
 assert.equal(calls[0].init.method,'GET');
 assert.equal(calls[1].url,'https://project.example.invalid/rest/v1/rpc/fulfill_flutterwave_charge');
 const body=JSON.parse(calls[1].init.body);
 assert.equal(body.p_verified.tx_ref,'fixture-checkout');
 assert.equal(body.p_verified.verified_at,new Date(NOW).toISOString());
 assert.equal(body.p_signature_mode,'verif_hash');
 assert.ok(calls.every(c=>c.init.redirect==='error'&&c.init.cache==='no-store'));
});
test('provider transport, HTTP and invalid JSON failures stay retryable without a database write',async()=>{
 for(const invoke of [()=>{throw Error('offline')},()=>json({},503),()=>new Response('{')]){
  let calls=0;
  const r=await fulfillVerifiedCharge({...options(),fetchImpl:async()=>{calls++;return invoke()}});
  assert.equal(r.status,503);assert.equal(calls,1);
 }
});
test('provider pending state is retryable; finalized failed/cancelled payments never activate access',async()=>{
 for(const status of ['pending','failed','cancelled','unknown']){
  let calls=0;
  const r=await fulfillVerifiedCharge({...options(),fetchImpl:async()=>{calls++;return provider({...transaction(),status})}});
  assert.equal(r.status,['failed','cancelled'].includes(status)?200:503,status);
  assert.equal(calls,1,status);
 }
});
test('missing or malformed transaction IDs never become provider paths or root-payload fallbacks',async()=>{
 for(const id of [null,0,-1,'../1','1?x=2',1.5,'0','0001','9999999999999999999999999999999']){
  let calls=0;
  const r=await fulfillVerifiedCharge({...options(),payload:{id:735001,data:{id}},fetchImpl:async()=>{calls++;return provider()}});
  assert.equal(r.status,400,String(id));assert.equal(calls,0);
 }
});
test('provider ID, amount, currency, customer and timestamp failures never reach fulfillment',async()=>{
 const invalid=[{id:735002},{amount:0},{amount:-1},{amount:'NaN'},{amount:'7e1'},
  {currency:'usd'},{currency:'USDD'},{customer:{id:1234}},
  {customer:{id:0,email:'fixture@example.invalid'}},{created_at:'invalid'},
  {created_at:'2026-10-24T00:06:00Z'},{subscription_id:'../x'},{payment_plan:{id:9012}}];
 for(const patch of invalid){
  let calls=0;
  const r=await fulfillVerifiedCharge({...options(),fetchImpl:async()=>{calls++;return provider({...transaction(),...patch})}});
  assert.equal(r.status,409,JSON.stringify(patch));assert.equal(calls,1);
 }
});
test('database outage, rollback, missing receipt and partial receipt never produce HTTP 200',async()=>{
 const invalid=[()=>json({},503),()=>json({ok:false,state:'REVIEW_REQUIRED'}),
  ()=>json({ok:true,state:'COMMITTED'}),
  ()=>json({ok:true,state:'COMMITTED',receipt:{...receipt(),entitlement_upsert_committed:false}}),
  ()=>json({ok:true,state:'UNKNOWN',receipt:receipt()}),()=>{throw Error('connection_lost')}];
 for(const invoke of invalid){
  let calls=0;
  const r=await fulfillVerifiedCharge({...options(),fetchImpl:async()=>++calls===1?provider():invoke()});
  assert.notEqual(r.status,200);assert.equal(calls,2);
 }
});
test('retry after a lost commit response accepts the original committed receipt without exposing it',async()=>{
 let attempts=0;
 const call=()=>fulfillVerifiedCharge({...options(),fetchImpl:async url=>{
  if(url.includes('api.flutterwave.com'))return provider();
  if(++attempts===1)throw Error('response_lost_after_commit');
  return json({ok:true,state:'ALREADY_COMMITTED',receipt:{...receipt(),private_member:'never-expose'}});
 }});
 assert.equal((await call()).status,503);
 const r=await call();assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{ok:true,state:'ALREADY_COMMITTED'});
 assert.equal(r.headers.get('cache-control'),'no-store');
});
test('verified transaction curation drops cards, tokens, IPs and unrelated metadata',()=>{
 const t=transaction();t.card={token:'secret-card-token'};t.ip='192.0.2.1';t.meta.untrusted='ignored';
 t.customer.name='Not needed';
 const r=curateVerifiedTransaction(t,'735001',NOW);
 assert.equal(r.card,undefined);assert.equal(r.ip,undefined);assert.equal(r.meta.untrusted,undefined);
 assert.deepEqual(Object.keys(r.customer).sort(),['email','id']);
 assert.equal(r.created_at,'2026-10-23T23:59:00.000Z');
});
test('old payment timestamps are retained for database expiry checks',()=>{
 const r=curateVerifiedTransaction({...transaction(),created_at:'2026-09-13T10:00:00Z'},'735001',NOW);
 assert.equal(r.created_at,'2026-09-13T10:00:00.000Z');
 assert.notEqual(r.created_at,r.verified_at);
});
test('dependency deadlines include a hanging body and a fetch that ignores cancellation',async()=>{
 for(const fetchImpl of [()=>new Promise(()=>{}),async()=>({ok:true,json:()=>new Promise(()=>{})})]){
  await assert.rejects(boundedJson('https://fixture.example.invalid',{},10,fetchImpl),/deadline/);
 }
});

function webhook(fetchImpl){
 let handler;
 const source=file('supabase/functions/flutterwave-webhook/index.ts')
  .replace("import {fulfillVerifiedCharge} from './charge.mjs';",'');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const env={SUPABASE_URL:'https://project.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-service-key',
  FLW_SECRET_KEY:'fixture-provider-key',FLW_SECRET_HASH:'fixture-webhook-secret'};
 runInNewContext(code,{Deno:{env:{get:k=>env[k]},serve:h=>{handler=h}},
  crypto:webcrypto,TextEncoder,Response,Request,URL,fetch:fetchImpl,btoa,
  fulfillVerifiedCharge:args=>fulfillVerifiedCharge({...args,fetchImpl,now:()=>NOW})});
 return handler;
}
const request=(body,headers={})=>new Request('https://fixture.example.invalid/webhook',
 {method:'POST',body,headers:{'Content-Type':'application/json',...headers}});
test('missing, wrong and invalid HMAC signatures cannot trigger provider or database access',async()=>{
 let calls=0;const handler=webhook(async()=>{calls++;throw Error('unexpected')});
 for(const headers of [{},{'verif-hash':'wrong'},
  {'flutterwave-signature':'wrong','verif-hash':'fixture-webhook-secret'}]){
  const r=await handler(request(JSON.stringify(options().payload),headers));assert.equal(r.status,401);
 }
 assert.equal(calls,0);
});
test('legacy secret hash preserves mandatory authentication before atomic fulfillment',async()=>{
 let calls=0;const handler=webhook(async()=>++calls===1?provider():json({ok:true,state:'COMMITTED',receipt:receipt()}));
 const r=await handler(request(JSON.stringify(options().payload),{'verif-hash':'fixture-webhook-secret'}));
 assert.equal(r.status,200);assert.equal(calls,2);
});
test('HMAC validates exact request bytes and does not accept a modified body',async()=>{
 const body=JSON.stringify(options().payload);
 const key=await webcrypto.subtle.importKey('raw',new TextEncoder().encode('fixture-webhook-secret'),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=Buffer.from(await webcrypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))).toString('base64');
 let calls=0;const handler=webhook(async()=>++calls===1?provider():json({ok:true,state:'COMMITTED',receipt:receipt()}));
 assert.equal((await handler(request(body,{'flutterwave-signature':signature}))).status,200);
 assert.equal((await handler(request(body+' ',{'flutterwave-signature':signature}))).status,401);
 assert.equal(calls,2);
});
test('unknown signed events never become charges and overlarge payloads are rejected',async()=>{
 let calls=0;const handler=webhook(async()=>{calls++;throw Error('unexpected')});
 const headers={'verif-hash':'fixture-webhook-secret'};
 assert.equal((await handler(request(JSON.stringify({event:'refund.completed',data:{id:735001}}),headers))).status,200);
 assert.equal((await handler(request('x'.repeat(65537),headers))).status,413);
 assert.equal(calls,0);
});
test('checkout remains hard locked and charge handling cannot call payment creation or legacy activation',()=>{
 assert.match(file('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 const source=file('supabase/functions/flutterwave-webhook/charge.mjs');
 assert.doesNotMatch(source,/\/v3\/payments|activate_subscription_from_payment|console\.log|console\.error/);
 const sql=file('supabase/recovery/v263-atomic-flutterwave-charge.sql');
 assert.match(sql,/public\.fulfill_flutterwave_charge[\s\S]*security invoker/);
 assert.match(sql,/revoke all on function public\.fulfill_flutterwave_charge\(jsonb,text\) from public, anon, authenticated/);
 assert.match(sql,/alter table private\.flutterwave_charge_fulfillments enable row level security/);
});
