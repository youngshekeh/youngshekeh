// Public commercial decisions must be supported by fresh provider and runtime evidence.
// Never interpret an HTTP 200 alone as authorization to create a charge.
export const COMMERCIAL_EVIDENCE_TTL_MS=10*60*1000;
export const ALLOWED_PLANS=Object.freeze(['pro','executive','business','enterprise']);
export function fresh(time,now=Date.now()){
  const t=Date.parse(String(time??''));
  return Number.isFinite(t)&&t<=now+60000&&now-t<=COMMERCIAL_EVIDENCE_TTL_MS;
}
export function priceFor(plan,acceptance,now=Date.now()){
  const row=Array.isArray(acceptance?.plans)
    ? acceptance.plans.find(x=>x?.plan_id===plan):null;
  return acceptance?.ok===true&&fresh(acceptance?.generated_at,now)
    &&row?.provider_verified===true&&Number.isFinite(row?.local_price_usd)
    &&row.local_price_usd>0&&row.currency==='USD'&&row.recurring===true
      ? row.local_price_usd:null;
}
export function planEligible(plan,acceptance,now=Date.now()){
  return ALLOWED_PLANS.includes(plan)
    &&acceptance?.ok===true&&fresh(acceptance?.generated_at,now)
    &&acceptance?.ready_for_checkout===true
    &&acceptance?.live_flow_verified===true
    &&acceptance?.state==='LIVE_FLOW_VERIFIED'
    &&acceptance?.gates?.provider_plan_parity==='PASS'
    &&acceptance?.gates?.signed_payment_evidence==='PASS'
    &&acceptance?.gates?.active_entitlement_evidence==='PASS'
    &&priceFor(plan,acceptance,now)!==null;
}
export function validProviderCheckout(value){
  try{
    const url=new URL(String(value||''));
    return url.protocol==='https:'&&!url.username&&!url.password&&!url.port
      &&['checkout.flutterwave.com','flutterwave.com','www.flutterwave.com','app.flutterwave.com'].includes(url.hostname);
  }catch{return false}
}
