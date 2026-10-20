import {ALLOWED_PLANS,priceFor,fresh} from './commercial-gates.mjs';
const BASE='https://mpcelmjiycjpdyyflisn.supabase.co';
const KEY='sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';
function el(id:string){return document.getElementById(id)}
function put(id:string,value:string){const target=el(id);if(target)target.textContent=value}
async function load(){
  try{
    const response=await fetch(BASE+'/functions/v1/public-billing-acceptance',{
      headers:{apikey:KEY,Accept:'application/json'},cache:'no-store',
      signal:AbortSignal.timeout(6500)
    });
    if(!response.ok)throw new Error('billing_acceptance_unavailable');
    const data=await response.json();
    const valid=data?.ok===true&&fresh(data?.generated_at);
    for(const plan of ALLOWED_PLANS){
      const amount=valid?priceFor(plan,data):null;
      put('price-'+plan,amount===null?'Price withheld':
        new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(amount)+'/month');
      put('note-'+plan,amount===null?'Price requires provider confirmation':'Provider plan verified · Payment acceptance checked separately');
    }
    const commerciallyReady=valid&&data?.ready_for_checkout===true&&data?.live_flow_verified===true&&data?.state==='LIVE_FLOW_VERIFIED';
    put('commercial-state',commerciallyReady?'PAYMENT PROVIDER · VERIFIED':'COMMERCIAL ENQUIRIES · OPEN');
    put('commercial-detail',commerciallyReady
      ? 'Provider pricing and historical payment evidence verified. Each new checkout still requires fresh platform, identity, subscription and kernel acceptance.'
      : 'Self-service payment is on hold until the billing provider and live system pass acceptance. You can request a research quote or commercial membership information without any charge.');
  }catch{
    for(const plan of ALLOWED_PLANS){
      put('price-'+plan,'Price withheld');
      put('note-'+plan,'Live provider verification unavailable');
    }
    put('commercial-state','COMMERCIAL ENQUIRIES · OPEN');
    put('commercial-detail','Payment provider verification is temporarily unavailable. No plan price or subscription purchase is being inferred. Request a confirmed quote by email.');
  }
}
void load();
