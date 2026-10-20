import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {ALLOWED_PLANS,priceFor,planEligible,validProviderCheckout,fresh} from '../src/commercial-gates.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const now=Date.parse('2026-10-20T18:00:00.000Z');
const acceptance=()=>({
  ok:true,generated_at:'2026-10-20T17:58:00Z',ready_for_checkout:true,
  live_flow_verified:true,state:'LIVE_FLOW_VERIFIED',
  plans:[{plan_id:'pro',local_price_usd:29,currency:'USD',recurring:true,provider_verified:true}]
});
test('only the four established paid plans are eligible',()=>{
  assert.deepEqual(ALLOWED_PLANS,['pro','executive','business','enterprise']);
  assert.equal(planEligible('free',acceptance(),now),false);
  assert.equal(planEligible('administrator',acceptance(),now),false);
});
test('fresh verified provider plan yields monthly USD price',()=>{
  assert.equal(priceFor('pro',acceptance(),now),29);
  assert.equal(planEligible('pro',acceptance(),now),true);
});
test('never infer a price if provider metadata disagrees',()=>{
  for(const mutation of [{currency:'NGN'},{recurring:false},{provider_verified:false},{local_price_usd:0}]){
    const x=acceptance();Object.assign(x.plans[0],mutation);
    assert.equal(priceFor('pro',x,now),null);
    assert.equal(planEligible('pro',x,now),false);
  }
});
test('billing data more than ten minutes old or in the future is not evidence',()=>{
  const x=acceptance();x.generated_at='2026-10-20T17:45:00Z';
  assert.equal(fresh(x.generated_at,now),false);
  assert.equal(planEligible('pro',x,now),false);
  x.generated_at='2026-10-20T18:02:00Z';
  assert.equal(priceFor('pro',x,now),null);
});
test('payment is held until previous signed live cycle is verified',()=>{
  const x=acceptance();
  for(const mutation of [{live_flow_verified:false},{ready_for_checkout:false},{state:'READY_FOR_CONTROLLED_LIVE_TEST'},{ok:false}]){
    const s={...x,...mutation};assert.equal(planEligible('pro',s,now),false);
  }
});
test('redirects may only target trusted HTTPS Flutterwave hosts',()=>{
  assert.equal(validProviderCheckout('https://checkout.flutterwave.com/v3/hosted/pay/abc'),true);
  for(const url of ['http://flutterwave.com/pay','https://flutterwave.com.evil.test/','https://evil.test/','javascript:alert(1)','https://username:pw@checkout.flutterwave.com/','https://checkout.flutterwave.com:8443/pay']){
    assert.equal(validProviderCheckout(url),false,url);
  }
});
test('new public pages are real Vite build entries, not 404 claims',()=>{
  const config=read('vite.config.ts'); const home=read('index.html');
  assert.match(config,/pricing: resolve\(root, 'pricing\/index.html'\)/);
  assert.match(config,/checkout: resolve\(root, 'checkout\/index.html'\)/);
  assert.match(home,/href="\.\/pricing\/"/);
  assert.match(read('pricing/index.html'),/id="commercial-state"/);
  assert.match(read('checkout/index.html'),/id="start-checkout"/);
});
test('public checkout requires fresh production, identity, kernel and billing evidence',()=>{
  const source=read('src/checkout.ts');
  assert.match(source,/evaluateLaunchReadiness\(\{auth:a,readiness:r,billing:b,qa:q\}\)/);
  assert.match(source,/planEligible\(plan,b\.data\)/);
  assert.match(source,/consecutive_successes/);
  assert.match(source,/cycles>=2/);
  assert.match(source,/validateMember\(token\)/);
  assert.match(source,/validProviderCheckout\(data\?\.checkout_url\)/);
  assert.match(source,/window\.location\.assign\(data\.checkout_url\)/);
  assert.match(source,/verified=false/);
});
test('private checkout endpoint performs acceptance BEFORE checkout DB writes or charges',()=>{
  const src=read('supabase/functions/create-checkout/index.ts');
  const gate=src.lastIndexOf('await requireCommercialAcceptance(base,key);');
  const insert=src.indexOf("const created=await insert(base,key,'checkout_intents'");
  const provider=src.indexOf("fetch('https://api.flutterwave.com/v3/payments'");
  const user=src.indexOf("const ur=await fetch");
  assert.ok(user>=0&&user<gate&&gate>=0&&gate<insert&&gate<provider);
  assert.match(src,/two_kernel_successes_not_verified/);
  assert.match(src,/commercial_acceptance_not_verified/);
  assert.match(src,/final\?\.state==='FULL_ACCEPTANCE_READY'/);
  assert.match(src,/billing\?\.state==='LIVE_FLOW_VERIFIED'/);
  assert.match(src,/new Set\(runs\.map/);
  assert.match(src,/status:'eq\.SUCCEEDED'/);
  assert.match(src,/throw new Error\('recent_kernel_receipts_unavailable'\)/);
});
test('blocked checkout cannot grant membership, manufacture price or place trades',()=>{
  const pages=[read('pricing/index.html'),read('checkout/index.html')].join('\n');
  assert.match(pages,/No charge|No payment/);
  const edge=read('supabase/functions/create-checkout/index.ts');
  assert.doesNotMatch(edge,/capital_permission|trade_order|execute_trade|ALTER SYSTEM/);
  assert.match(read('src/access.ts'),/data\?\.state === 'PASSWORD_AUTH_READY'/);
});
