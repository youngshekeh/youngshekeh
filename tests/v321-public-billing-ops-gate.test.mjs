// V321 operational liveness release-gate tests on staged code only.
// Mock Supabase PostgREST and Flutterwave; no network, credentials or charges.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';

const textSource=readFileSync(
  new URL('../docs/release/V321-REVIEW-ONLY-public-billing-acceptance.ts',
  import.meta.url),'utf8');
const sql=readFileSync(
  new URL('../docs/release/V321-REVIEW-ONLY-BILLING-OPS-READINESS.sql',
  import.meta.url),'utf8');
const BASE='https://v321-fake-supabase.invalid';
const op=(gate='HOLD')=>({
  ok:true,ops_gate:gate,
  reconciliation:{stale_running:gate==='HOLD'?7:0,
    cron_failed_24h:gate==='HOLD'?35:0},
  subscription_watch:{stale_running:gate==='HOLD'?1:0,
    cron_failed_24h:gate==='HOLD'?5:0}
});
function json(value,status=200){return new Response(JSON.stringify(value),{
  status,headers:{'Content-Type':'application/json'}});
}
function sandbox({gate='HOLD',providerDown=false,rpcError=false}={}){
  const calls=[];let handler;let currentGate=gate;
  const endpoint=async(u)=>{
    if(u.pathname==='/rest/v1/rpc/billing_ops_readiness_v321')
      return rpcError?json({message:'unavailable'},503):json(op(currentGate));
    if(u.pathname==='/rest/v1/rpc/billing_transport_readiness_v322')
      return json({ok:true,state:'TRANSPORT_OBSERVABLE',transport_available:true,
        billing_event_attribution_verified:false,
        commercial_activation_permitted:false});
    if(u.pathname==='/rest/v1/plans')return json([{
      id:'pro',name:'Pro',price_monthly_usd:19,is_active:true
    }]);
    if(u.pathname==='/rest/v1/billing_plan_mappings')return json([{
      plan_id:'pro',provider_plan_id:'101',currency:'USD',
      recurring:true,is_active:true
    }]);
    if(u.pathname==='/rest/v1/payment_events')return json([{
      event_type:'charge.completed',plan_id:'pro',amount:19,
      currency:'USD',status:'successful',created_at:'2026-09-13T00:00:00Z',
      raw_payload:{verified:true,signature_mode:'hmac_sha256'}
    }]);
    if(u.pathname==='/rest/v1/checkout_intents')return json([{id:'synthetic'}]);
    if(u.pathname==='/rest/v1/subscriptions')return json([{id:'synthetic'}]);
    if(u.origin==='https://api.flutterwave.com'){
      if(providerDown)return json({status:'error'},503);
      return json({status:'success',data:{id:101,amount:19,
        currency:'USD',interval:'monthly',status:'active'}});
    }
    throw Error('unexpected fake route '+u.href);
  };
  runInNewContext(stripTypeScriptTypes(textSource,{mode:'strip'}),{
    Deno:{env:{get:k=>({
      SUPABASE_URL:BASE,FLW_SECRET_KEY:'v321-fake-key',
      FLW_SECRET_HASH:'v321-fake-hash',
      SUPABASE_SECRET_KEYS:JSON.stringify({default:'v321-fake-service-role'})
    })[k]??null},serve:fn=>{handler=fn;}},
    fetch:async(url,options={})=>{
      const u=new URL(String(url));calls.push({url:u.href,method:options.method||'GET'});
      if(!['GET'].includes(options.method||'GET'))
        throw Error('staged acceptance function must remain read-only');
      return endpoint(u);
    },
    URL,Date,Request,Response,AbortSignal,console,Map,Boolean,Promise
  },{timeout:4000});
  assert.equal(typeof handler,'function');
  return{calls,setGate:x=>currentGate=x,async request(method='GET'){
    const res=await handler(new Request('https://v321-review.invalid/billing',
      {method}));
    return {status:res.status,headers:res.headers,body:await res.json()};
  }};
}
test('eight stale billing runs and 40 recent timeouts block commercial readiness',async()=>{
  const h=sandbox();
  const r=await h.request();
  assert.equal(r.status,200);
  assert.equal(r.body.state,'BLOCKED_OPS_GATES');
  assert.equal(r.body.ready_for_checkout,false);
  assert.equal(r.body.live_flow_verified,false);
  assert.equal(r.body.commercial_activation_permitted,false);
  assert.equal(r.body.operational_evidence.reconciliation_stale,7);
  assert.equal(r.body.operational_evidence.subscription_stale,1);
  assert.equal(r.body.operational_evidence.reconciliation_failed_24h,35);
  assert.equal(r.body.operational_evidence.subscription_failed_24h,5);
  assert.equal(h.calls.length,1,'failure should not call merchant/provider lookups');
  assert.equal(r.headers.get('cache-control'),'private, no-store');
});
test('operational PASS cannot override the separately hard-sealed commercial launch switch',async()=>{
  const h=sandbox({gate:'PASS'});
  const r=await h.request();
  assert.equal(r.status,200);
  assert.equal(r.body.ops_gate,'PASS');
  assert.equal(r.body.ready_for_checkout,false);
  assert.equal(r.body.state,'BLOCKED');
  assert.equal(r.body.commercial_activation_permitted,false);
  assert.ok(h.calls.some(x=>x.url.includes('payment-plans/101')));
  assert.equal(r.headers.get('cache-control'),'private, no-store');
});
test('missing private Ops RPC or upstream error must fail closed',async()=>{
  const h=sandbox({rpcError:true});
  const r=await h.request();
  assert.equal(r.status,200);
  assert.equal(r.body.state,'BLOCKED_OPS_GATES');
  assert.equal(r.body.ready_for_checkout,false);
  assert.equal(r.body.ops_gate,'EVIDENCE_UNAVAILABLE');
  assert.equal(h.calls.length,1);
});
test('merchant provider down after Ops PASS still cannot declare a checkout release',async()=>{
  const h=sandbox({gate:'PASS',providerDown:true});
  const r=await h.request();
  assert.equal(r.status,200);
  assert.equal(r.body.ready_for_checkout,false);
  assert.equal(r.body.gates.provider_plan_parity,'FAIL');
});
test('stale public readiness cache is disabled and tracks new gate evidence',async()=>{
  const h=sandbox({gate:'HOLD'});
  const a=await h.request();
  assert.equal(a.body.ops_gate,'HOLD');
  h.setGate('PASS');
  const b=await h.request();
  assert.equal(b.body.ops_gate,'PASS');
  assert.equal(b.body.ready_for_checkout,false);
  assert.ok(h.calls.filter(x=>x.url.includes('/rpc/billing_ops_readiness_v321')).length>=2);
});
test('no POST mutation, no charges, no secrets or customer references in readout',async()=>{
  const h=sandbox();
  const a=await h.request();
  assert.ok(h.calls.every(x=>x.method==='GET'));
  const plain=JSON.stringify(a.body);
  for(const marker of ['v321-fake-service-role','v321-fake-key','customer_email',
    'provider_subscription_id','user_id','raw_payload'])
    assert.ok(!plain.includes(marker),'public readout leaked '+marker);
  const unsupported=await h.request('POST');
  assert.equal(unsupported.status,405);
});
test('source and SQL preserve private RPC permissions and immutable commercial HOLD',()=>{
  assert.match(textSource,/COMMERCIAL_ACTIVATION_RELEASED=false/);
  assert.match(textSource,/billing_ops_readiness_v321/);
  assert.match(textSource,/private, no-store/);
  assert.match(sql,/SECURITY DEFINER/);
  assert.match(sql,/STABLE/);
  assert.match(sql,/REVOKE ALL ON FUNCTION/);
  assert.match(sql,/FROM PUBLIC, anon, authenticated/);
  assert.match(sql,/TO service_role/);
  assert.match(sql,/'commercial_activation_permitted',false/);
  assert.doesNotMatch(sql,/\bINSERT INTO\b|\bUPDATE public\.agent_runs\b|\bDELETE FROM\b/);
});
