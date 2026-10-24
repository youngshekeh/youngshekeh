// V271 catalog evidence is not permission to collect a payment.
import {ALLOWED_PLANS,priceFor,planEligible,fresh} from './commercial-gates.mjs';
export function assessCommercialCatalog(probe,{now=Date.now()}={}){
 const data=probe?.data;
 const current=probe?.response?.ok===true&&data?.ok===true&&fresh(data?.generated_at,now);
 const plans=Object.fromEntries(ALLOWED_PLANS.map(id=>{
  const amount=current?priceFor(id,data,now):null;
  return [id,Object.freeze({usd_per_month:amount,catalog_verified:amount!==null,
   provider_acceptance_checked:current&&planEligible(id,data,now)})];
 }));
 const reported=current&&data.ready_for_checkout===true&&data.live_flow_verified===true
  &&data.state==='LIVE_FLOW_VERIFIED'&&data.gates?.provider_plan_parity==='PASS'
  &&data.gates?.signed_payment_evidence==='PASS'
  &&data.gates?.active_entitlement_evidence==='PASS';
 return Object.freeze({
  version:'v271-commercial-catalog-v1',
  state:'SELF-SERVICE PAYMENTS · ON HOLD',
  detail:!current
   ?'Provider verification is unavailable or outdated. Plan prices are withheld. Research and membership enquiries remain open without payment.'
   :reported
   ?'Provider pricing and historical payment gates reported as verified. This does not authorize checkout: the server charge guard, member session, private kernel and live entitlements require separate verification.'
   :'Provider catalog prices are separate from checkout authorization. Subscription payments remain blocked until provider and live-system gates pass.',
  source_current:Boolean(current),provider_acceptance_reported:Boolean(reported),
  verified_plan_count:Object.values(plans).filter(x=>x.catalog_verified).length,
  plans:Object.freeze(plans),research_enquiries_open:true,
  self_service_charge_permitted:false,private_kernel_certified:false,
  active_member_entitlement_verified:false,trading:'WAIT / 0R'
 });
}
