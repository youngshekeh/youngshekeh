import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessCommercialCatalog} from '../src/commercial-catalog.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const now=Date.parse('2026-10-24T06:50:00Z'),stamp=ms=>new Date(ms).toISOString();
const good=()=>({response:{ok:true},data:{
 ok:true,generated_at:stamp(now-1000),ready_for_checkout:true,live_flow_verified:true,
 state:'LIVE_FLOW_VERIFIED',
 gates:{provider_plan_parity:'PASS',signed_payment_evidence:'PASS',active_entitlement_evidence:'PASS'},
 plans:['pro','executive','business','enterprise'].map((plan_id,i)=>({
  plan_id,local_price_usd:[29,89,249,749][i],currency:'USD',recurring:true,provider_verified:true
 }))
}});
const assess=p=>assessCommercialCatalog(p,{now});
test('provider-verified catalog NEVER grants checkout or claims kernel certification',()=>{
 const v=assess(good());assert.equal(v.source_current,true);
 assert.equal(v.verified_plan_count,4);assert.equal(v.plans.pro.usd_per_month,29);
 assert.equal(v.provider_acceptance_reported,true);
 assert.equal(v.state,'SELF-SERVICE PAYMENTS · ON HOLD');
 assert.equal(v.self_service_charge_permitted,false);
 assert.equal(v.private_kernel_certified,false);
 assert.equal(v.active_member_entitlement_verified,false);
 assert.equal(v.trading,'WAIT / 0R');
});
test('provider outage, invalid response or stale timestamp never guesses prices',()=>{
 const p=good();
 for(const bad of [null,{response:{ok:false},data:p.data},
  {...p,data:{...p.data,ok:false}},
  {...p,data:{...p.data,generated_at:stamp(now-11*60_000)}},
  {...p,data:{...p.data,generated_at:stamp(now+120_000)}}]){
  const v=assess(bad);
  assert.equal(v.verified_plan_count,0);
  assert.deepEqual(Object.values(v.plans).map(x=>x.usd_per_month),[null,null,null,null]);
  assert.equal(v.self_service_charge_permitted,false);
 }
});
test('per-plan source rights, USD amount, and recurring mapping must match',()=>{
 for(const mutation of [{currency:'NGN'},{recurring:false},{provider_verified:false},
  {local_price_usd:0},{local_price_usd:'99'},{local_price_usd:NaN}]){
  const p=good();Object.assign(p.data.plans[0],mutation);
  const v=assess(p);assert.equal(v.plans.pro.usd_per_month,null);
  assert.equal(v.plans.business.usd_per_month,249);
  assert.equal(v.verified_plan_count,3);
 }
});
test('provider billing hold cannot be presented as active subscription',()=>{
 const p=good();
 for(const update of [{state:'READY_FOR_CONTROLLED_LIVE_TEST'},{live_flow_verified:false},
  {ready_for_checkout:false},
  {gates:{provider_plan_parity:'PASS',signed_payment_evidence:'FAIL',active_entitlement_evidence:'PASS'}}]){
  const v=assess({...p,data:{...p.data,...update}});
  assert.equal(v.provider_acceptance_reported,false);
  assert.equal(v.self_service_charge_permitted,false);
 }
});
test('pricing uses credentialless reader and keeps actual payment guard disabled',()=>{
 const src=read('src/pricing.ts'),reader=read('src/public-acceptance-connection.mjs'),
  page=read('pricing/index.html'),checkout=read('src/checkout.ts'),
  research=read('src/research.ts');
 assert.match(src,/readPublicAcceptance\('public-billing-acceptance'\)/);
 assert.doesNotMatch(src,/apikey|Authorization:|create-checkout|window\.location\.assign/);
 assert.match(reader,/credentials:'omit'/);
 assert.match(checkout,/const CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(page,/id="commercial-proof"/);
 assert.match(page,/id="commercial-recheck"/);
 for(const id of ['pro','executive','business','enterprise'])
  assert.ok(page.includes('href="../research/?plan='+id+'"'));
 assert.match(research,/\['pro','executive','business','enterprise'\]\.includes\(enquiryPlan\)/);
 assert.match(page,/No charge is created by sending an enquiry/);
});
