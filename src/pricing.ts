import {ALLOWED_PLANS} from './commercial-gates.mjs';
import {readPublicAcceptance} from './public-acceptance-connection.mjs';
import {assessCommercialCatalog} from './commercial-catalog.mjs';
function put(id:string,value:string){const el=document.getElementById(id);if(el)el.textContent=value}
const retry=document.getElementById('commercial-recheck') as HTMLButtonElement|null;
let pending=false;
// This page NEVER authorizes a charge; production checkout's server guard is unverified.
function render(state:ReturnType<typeof assessCommercialCatalog>){
 for(const plan of ALLOWED_PLANS){
  const row=state.plans[plan];
  put('price-'+plan,row.usd_per_month===null?'Price withheld':
   new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(row.usd_per_month)+'/month');
  put('note-'+plan,row.usd_per_month===null?'Price requires provider confirmation':
   'Provider-verified catalog price · Checkout requires separate approval');
 }
 put('commercial-state',state.state);
 put('commercial-detail',state.detail);
 put('commercial-proof',state.source_current
  ?'Provider catalog checked · '+state.verified_plan_count+'/'+ALLOWED_PLANS.length+' plan prices individually verified · Payment not enabled'
  :'Provider unverified · No inferred prices · Payment not enabled');
}
async function load(){
 if(pending)return;
 pending=true;
 if(retry){retry.disabled=true;retry.textContent='Checking provider…';}
 put('commercial-state','SELF-SERVICE PAYMENTS · ON HOLD');
 try{
  // Shared credentialless cross-origin GET avoids unnecessary CORS preflight.
  render(assessCommercialCatalog(await readPublicAcceptance('public-billing-acceptance')));
 }catch{render(assessCommercialCatalog(null))}
 finally{pending=false;if(retry){retry.disabled=false;retry.textContent='Recheck provider';}}
}
retry?.addEventListener('click',()=>void load());
void load();
