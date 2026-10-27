// V320 safe read-only Flutterwave reconciliation handler integration tests.
// Executes the *staged* Deno handler in an isolated Node VM with fake calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';

const source=readFileSync(new URL(
  '../docs/release/V320-REVIEW-ONLY-reconcile-flutterwave-payments.ts',
  import.meta.url),'utf8');
const SECRET='synthetic-not-a-real-cron-token-321';
const BASE='https://v320-fake-supabase.invalid';
const ref='TFA-v320-test-1';
function fakeIntent(status='pending'){
  return {id:'00000000-1111-4000-8000-111111111111',
    provider_reference:ref,status,amount:19,currency:'USD',
    created_at:'2026-08-01T00:00:00.000Z'};
}
function response(data,status=200){
  return new Response(JSON.stringify(data),{
    status,headers:{'Content-Type':'application/json'}
  });
}
function scenario({intents=[fakeIntent()],payment='successful',
  pages=1,tokenValid=true,providerError=false,wrongAmount=false}={}){
  const calls=[];
  let handler;
  const providerData=payment==='none'?[]:[{
    id:285,tx_ref:ref,status:payment==='failed'?'failed':'successful'
  }];
  const route=async(url,options={})=>{
    const u=new URL(url);
    if(u.pathname==='/rest/v1/runtime_tokens')return response([{
      token_hash:tokenValid
        ?createHash('sha256').update(SECRET).digest('hex')
        :'another-completely-invalid-hash'
    }]);
    if(u.pathname==='/rest/v1/checkout_intents')return response(intents);
    if(u.origin==='https://api.flutterwave.com'
      &&u.pathname==='/v3/transactions'){
      if(providerError)return response({status:'error'},503);
      const page=Number(u.searchParams.get('page')||'1');
      assert.equal(u.searchParams.get('tx_ref'),ref);
      return response({status:'success',data:page===1?providerData:[],
        meta:{page_info:{total_pages:pages}}});
    }
    if(u.origin==='https://api.flutterwave.com'
      &&u.pathname==='/v3/transactions/285/verify'){
      if(providerError)return response({status:'error'},500);
      return response({status:'success',data:{
        id:285,tx_ref:ref,status:'successful',
        amount:wrongAmount?5:19,currency:'USD'
      }});
    }
    throw Error('unexpected test URL '+url);
  };
  const ctx={
    Deno:{env:{get:name=>({
      SUPABASE_URL:BASE,FLW_SECRET_KEY:'synthetic-v320-provider-key',
      SUPABASE_SECRET_KEYS:JSON.stringify({default:'synthetic-service-key'})
    })[name]??null},serve:cb=>{handler=cb;}},
    fetch:async (url,options={})=>{
      calls.push({url:String(url),method:options.method||'GET'});
      return route(String(url),options);
    },
    crypto:webcrypto,TextEncoder,Request,Response,URL,AbortSignal,console
  };
  runInNewContext(stripTypeScriptTypes(source,{mode:'strip'}),
    ctx,{timeout:3500});
  assert.equal(typeof handler,'function');
  return{calls,async check(credential=SECRET,method='POST'){
    const req=new Request('https://v320-fake-server.invalid/cron',{
      method,headers:credential?{'x-tfa-cron-secret':credential}:{},
      ...(method==='POST'?{body:'{}'}:{})
    });
    const res=await handler(req);
    return {status:res.status,body:await res.json()};
  }};
}
function onlyReads(calls){
  assert.ok(calls.every(c=>c.method==='GET'),
    'reconciliation must not POST, PATCH, DELETE or charge');
  assert.ok(!calls.some(c=>c.url.includes('/functions/v1/flutterwave-webhook')));
}
test('unauthorized cron secret does not access provider or local checkout records',async()=>{
  const h=scenario();
  assert.equal((await h.check('')).status,401);
  assert.equal(h.calls.length,0);
  const wrong=await h.check('incorrect-secret');
  assert.equal(wrong.status,401);
  assert.equal(h.calls.filter(x=>x.url.includes('/checkout_intents')).length,0);
  onlyReads(h.calls);
});
test('no open intents yields safe read-only report, zero writes and no fake charges',async()=>{
  const h=scenario({intents:[]});
  const r=await h.check();
  assert.equal(r.status,200);
  assert.equal(r.body.state,'SAFE_READ_ONLY_AUDIT');
  assert.equal(r.body.checkout_rows_checked,0);
  assert.equal(r.body.charge_initiated,false);
  assert.equal(r.body.checkout_expired_by_this_run,0);
  onlyReads(h.calls);
});
test('verified old pending checkout requires manual commit, never auto-replays webhook',async()=>{
  const h=scenario();
  const r=await h.check();
  assert.equal(r.status,503);
  assert.equal(r.body.counts.VERIFIED_SUCCESS_MANUAL_COMMIT_REQUIRED,1);
  assert.equal(r.body.provider_webhook_replayed,false);
  assert.equal(r.body.customer_entitlement_changed,false);
  onlyReads(h.calls);
});
test('expired legacy checkout is audited without altering its status',async()=>{
  const h=scenario({intents:[fakeIntent('expired')],payment:'none'});
  const r=await h.check();
  assert.equal(r.status,200);
  assert.equal(r.body.counts.NO_CONFIRMED_PROVIDER_PAYMENT,1);
  assert.equal(r.body.checkout_expired_by_this_run,0);
  onlyReads(h.calls);
});
test('provider failure or amount mismatch holds, never calls hosted payment flow',async()=>{
  for(const opts of [{providerError:true},{wrongAmount:true}]){
    const h=scenario(opts);
    const r=await h.check();
    assert.equal(r.status,503);
    assert.equal(r.body.manual_review_required,true);
    assert.equal(r.body.charge_initiated,false);
    onlyReads(h.calls);
  }
});
test('pagination incomplete is held rather than treated as no payment',async()=>{
  const h=scenario({pages:5,payment:'none'});
  const r=await h.check();
  assert.equal(r.status,503);
  assert.equal(r.body.counts.PAGINATION_INCOMPLETE_MANUAL_HOLD,1);
  onlyReads(h.calls);
});
test('two-page search with matching transaction commits nothing and requires review',async()=>{
  const h=scenario({pages:2,payment:'successful'});
  const r=await h.check();
  assert.equal(r.status,503);
  assert.equal(r.body.counts.VERIFIED_SUCCESS_MANUAL_COMMIT_REQUIRED,1);
  assert.equal(h.calls.filter(c=>c.url.includes('/v3/transactions?')).length,2);
  onlyReads(h.calls);
});
test('batch cap is explicit, never silently certifies a truncated reconciliation scan',async()=>{
  const h=scenario({intents:Array.from({length:26},()=>fakeIntent()),payment:'none'});
  const r=await h.check();
  assert.equal(r.status,503);
  assert.equal(r.body.state,'PARTIAL_SCAN_MANUAL_HOLD');
  assert.equal(r.body.checkout_rows_checked,25);
  assert.equal(r.body.scan_truncated,true);
  assert.equal(r.body.manual_review_required,true);
  onlyReads(h.calls);
});
test('method gate and malformed provider pagination fail closed',async()=>{
  const h=scenario();
  assert.equal((await h.check(SECRET,'GET')).status,405);
  const other=scenario({pages:0});
  const r=await other.check();
  assert.equal(r.status,503);
  assert.equal(r.body.counts.UNVERIFIED_PAGINATION_MANUAL_HOLD,1);
  onlyReads(other.calls);
});
