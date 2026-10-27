// V319: run real staged Deno.serve handler logic in an isolated Node 24 VM.
// NO network, customer data, provider key, Supabase calls or merchant charges.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {createHmac,webcrypto} from 'node:crypto';

const source=readFileSync(new URL('../docs/release/V317-REVIEW-ONLY-flutterwave-webhook.ts',import.meta.url),'utf8');
const BASE='https://v319-fake-supabase.invalid';
const KEY='synthetic-v319-only-never-a-real-key';
const SECRET='synthetic-v319-webhook-verification-secret';
const payment=()=>({event:'charge.completed',data:{id:285,status:'successful'}});
const cancellation=()=>({event:'subscription.cancelled',data:{
  subscription_id:7654,customer:{id:543},plan:{id:101}}});
function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
}
function successRoute(url,init={}){
  const u=new URL(url);
  if(u.origin==='https://api.flutterwave.com'&&u.pathname==='/v3/transactions/285/verify'){
    return json({status:'success',data:{id:285,tx_ref:'TFA-v319-1',
      status:'successful',amount:19,currency:'USD',
      customer:{id:543},subscription_id:7654}});
  }
  if(u.origin==='https://api.flutterwave.com'&&u.pathname==='/v3/subscriptions'){
    return json({status:'success',data:[{id:7654,customer:{id:543},plan:101,
      status:'cancelled'}],meta:{page_info:{total_pages:1}}});
  }
  if(u.pathname==='/rest/v1/checkout_intents')return json([{
    id:'20000000-0000-4000-8000-000000000001',
    user_id:'10000000-0000-4000-8000-000000000001',
    plan_id:'pro',amount:19,currency:'USD',
    provider_reference:'TFA-v319-1',status:'pending'}]);
  if(u.pathname==='/rest/v1/plans')return json([{id:'pro',price_monthly_usd:19,is_active:true}]);
  if(u.pathname==='/rest/v1/billing_plan_mappings')
    return json([{plan_id:'pro',provider_plan_id:'101',currency:'USD',is_active:true}]);
  if(u.pathname==='/rest/v1/rpc/commit_verified_flutterwave_payment_v317')
    return json({ok:true,state:'COMMITTED'});
  if(u.pathname==='/rest/v1/rpc/commit_verified_flutterwave_cancellation_v318')
    return json({ok:true,state:'CANCELED_RENEWAL_OFF'});
  throw Error('unexpected fake URL '+url);
}
function harness({releasePaid=false,releaseCancel=false,route=successRoute}={}){
  const calls=[];
  let handler=null;
  let code=source;
  if(releasePaid)code=code.replace('const V317_ATOMIC_PAYMENT_RPC_RELEASED=false;',
    'const V317_ATOMIC_PAYMENT_RPC_RELEASED=true;');
  if(releaseCancel)code=code.replace('const V318_ATOMIC_CANCELLATION_RPC_RELEASED=false;',
    'const V318_ATOMIC_CANCELLATION_RPC_RELEASED=true;');
  const ctx={
    Deno:{
      env:{get:(name)=>({
        SUPABASE_URL:BASE,FLW_SECRET_KEY:KEY,FLW_SECRET_HASH:SECRET,
        SUPABASE_SECRET_KEYS:JSON.stringify({default:'synthetic-v319-service'})
      })[name]??null},
      serve:(cb)=>{handler=cb;}
    },
    fetch:async (url,init={})=>{
      const req={url:String(url),method:init.method||'GET',
        body:init.body??null,headers:init.headers};
      calls.push(req);
      return await route(req.url,init);
    },
    crypto:webcrypto,TextEncoder,Request,Response,Headers,URL,AbortSignal,
    console:{error:()=>{}}
  };
  runInNewContext(stripTypeScriptTypes(code,{mode:'strip'}),ctx,{timeout:5000});
  assert.equal(typeof handler,'function');
  return {
    calls,
    async send(payload,{signature='hmac',valid=true}={}){
      const body=JSON.stringify(payload);
      const hmac=createHmac('sha256',SECRET).update(body).digest('base64');
      const headers={'Content-Type':'application/json'};
      if(signature==='hmac')headers['flutterwave-signature']=valid?hmac:'fake-invalid-hmac';
      if(signature==='legacy')headers['verif-hash']=valid?SECRET:'fake-invalid-hash';
      const req=new Request('https://v319-test.invalid/webhook',{method:'POST',
        body,headers});
      return await handler(req);
    },
    async get(){return await handler(new Request('https://v319-test.invalid/webhook'));}
  };
}
function rpcCount(h){return h.calls.filter(x=>x.url.includes('/rpc/')).length;}
test('unsigned and false HMAC/legacy signed webhooks are rejected before fetching data',async()=>{
  for(const signature of ['hmac','legacy']){
    const h=harness();
    const bad=await h.send(payment(),{signature,valid:false});
    assert.equal(bad.status,401);
    assert.equal(h.calls.length,0);
  }
  const h=harness();
  assert.equal((await h.get()).status,405);
  assert.equal(h.calls.length,0);
});
test('genuine HMAC and legacy signature variants both honor checkout hold',async()=>{
  for(const signature of ['hmac','legacy']){
    const h=harness();
    const resp=await h.send(payment(),{signature});
    assert.equal(resp.status,503);
    assert.match(await resp.text(),/atomic paid payment release pending/);
    assert.equal(rpcCount(h),0,'guard must not write ledger');
  }
});
test('signed unsupported events are deliberately ignored without provider or ledger writes',async()=>{
  const h=harness({releasePaid:true});
  const result=await h.send({event:'transfer.completed',data:{id:285}});
  assert.equal(result.status,200);
  assert.equal(h.calls.length,0);
});
test('signed charge with missing provider transaction id fails closed, no 200',async()=>{
  const h=harness({releasePaid:true});
  const response=await h.send({event:'charge.completed',data:{status:'successful'}});
  assert.equal(response.status,503);
  assert.match(await response.text(),/transaction ID missing/);
  assert.equal(h.calls.length,0);
});
test('provider 5xx, malformed response or unverified transaction ID must not be acknowledged as settled',async()=>{
  for(const mode of ['http-fail','bad-status','wrong-id']){
    const h=harness({releasePaid:true,route:(url,init)=>{
      if(url.includes('/v3/transactions/')){
        if(mode==='http-fail')return json({status:'error'},500);
        if(mode==='bad-status')return json({status:'error'});
        if(mode==='wrong-id')return json({status:'success',data:{
          id:999,status:'successful',amount:19,currency:'USD'}});
      }
      return successRoute(url,init);
    }});
    const response=await h.send(payment());
    assert.equal(response.status,500,mode);
    assert.equal(rpcCount(h),0,mode);
  }
});
test('confirmed failed charge acknowledged without creating entitlement, pending held for retry',async()=>{
  for(const status of ['failed','pending']){
    const h=harness({releasePaid:true,route:(url,init)=>{
      if(url.includes('/v3/transactions/'))return json({
        status:'success',data:{id:285,status}});
      return successRoute(url,init);
    }});
    const r=await h.send(payment());
    assert.equal(r.status,status==='failed'?200:503);
    assert.equal(rpcCount(h),0);
  }
});
test('successful but unmatched charge is NOT acknowledged, unlike old webhook',async()=>{
  const h=harness({releasePaid:true,route:(url,init)=>{
    if(url.includes('/rest/v1/checkout_intents')||
      url.includes('/rest/v1/subscriptions'))return json([]);
    return successRoute(url,init);
  }});
  const response=await h.send(payment());
  assert.equal(response.status,503);
  assert.match(await response.text(),/unmatched successful charge/);
  assert.equal(rpcCount(h),0);
});
test('successful charge with incorrect amount, currency or missing plan mapping goes to HOLD',async()=>{
  for(const mode of ['amount','currency','plan']){
    const h=harness({releasePaid:true,route:(url,init)=>{
      if(mode==='plan'&&url.includes('/rest/v1/billing_plan_mappings'))return json([]);
      if((mode==='amount'||mode==='currency')&&url.includes('/v3/transactions/'))
        return json({status:'success',data:{id:285,tx_ref:'TFA-v319-1',
          status:'successful',amount:mode==='amount'?5:19,
          currency:mode==='currency'?'EUR':'USD',customer:{id:543}}});
      return successRoute(url,init);
    }});
    const response=await h.send(payment());
    assert.equal(response.status,503,mode);
    assert.equal(rpcCount(h),0,mode);
  }
});
test('verified charge commits once by RPC, duplicate receipts return idempotent success',async()=>{
  let rpcCalls=0;
  const h=harness({releasePaid:true,route:(url,init)=>{
    if(url.includes('/rpc/commit_verified_flutterwave_payment_v317')){
      rpcCalls++;
      const body=JSON.parse(init.body);
      assert.equal(body.p_transaction_id,'285');
      assert.equal(body.p_amount,19);
      assert.equal(body.p_currency,'USD');
      assert.equal(body.p_tx_ref,'TFA-v319-1');
      return json({ok:true,state:rpcCalls===1?'COMMITTED':'ALREADY_COMMITTED'});
    }
    return successRoute(url,init);
  }});
  assert.equal((await h.send(payment())).status,200);
  assert.equal((await h.send(payment())).status,200);
  assert.equal(rpcCalls,2);
  assert.equal(h.calls.filter(x=>x.url.includes('/rpc/activate_subscription_from_payment')).length,0);
});
test('failed atomic RPC must fail HTTP and remain retryable',async()=>{
  const h=harness({releasePaid:true,route:(url,init)=>{
    if(url.includes('/rpc/commit_verified_flutterwave_payment_v317'))
      return json({message:'synthetic database unavailable'},503);
    return successRoute(url,init);
  }});
  const response=await h.send(payment());
  assert.equal(response.status,500);
  assert.equal(rpcCount(h),1);
});
test('cancellation release hard lock responds retryably and never calls provider',async()=>{
  const h=harness();
  const response=await h.send(cancellation());
  assert.equal(response.status,503);
  assert.equal(h.calls.length,0);
});
test('cancellation missing identity is held without looking up email',async()=>{
  const h=harness({releaseCancel:true});
  const response=await h.send({event:'subscription.cancelled',data:{
    customer:{email:'fake@example.invalid'},plan:{id:101}}});
  assert.equal(response.status,503);
  assert.equal(h.calls.length,0);
});
test('exact verified cancellation commits atomic RPC and preserves provider fields',async()=>{
  const h=harness({releaseCancel:true,route:(url,init)=>{
    if(url.includes('/rpc/commit_verified_flutterwave_cancellation_v318')){
      const args=JSON.parse(init.body);
      assert.equal(args.p_provider_customer_id,'543');
      assert.equal(args.p_subscription_id,'7654');
      assert.equal(args.p_provider_plan_id,'101');
      assert.equal(args.p_provider_status,'cancelled');
    }
    return successRoute(url,init);
  }});
  const response=await h.send(cancellation());
  assert.equal(response.status,200);
  assert.equal(rpcCount(h),1);
});
test('provider cancelled list with unrelated subscription, or error, cannot revoke account',async()=>{
  for(const mode of ['not-matched','error']){
    const h=harness({releaseCancel:true,route:(url,init)=>{
      if(url.includes('/v3/subscriptions')){
        if(mode==='error')return json({status:'error'},500);
        return json({status:'success',data:[{id:9999,plan:101,
          customer:{id:543},status:'cancelled'}],
          meta:{page_info:{total_pages:1}}});
      }
      return successRoute(url,init);
    }});
    const response=await h.send(cancellation());
    assert.equal(response.status,mode==='error'?500:503);
    assert.equal(rpcCount(h),0);
  }
});
test('cancellation DB failure returns 500, never falsely confirms cancellation',async()=>{
  const h=harness({releaseCancel:true,route:(url,init)=>{
    if(url.includes('/rpc/commit_verified_flutterwave_cancellation_v318'))
      return json({message:'synthetic rollback'},503);
    return successRoute(url,init);
  }});
  const response=await h.send(cancellation());
  assert.equal(response.status,500);
  assert.equal(rpcCount(h),1);
});
