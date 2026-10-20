import {ALLOWED_PLANS,planEligible,priceFor,validProviderCheckout} from './commercial-gates.mjs';
import {evaluateLaunchReadiness} from './launch-readiness.mjs';
const BASE='https://mpcelmjiycjpdyyflisn.supabase.co';
const KEY='sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';
const params=new URLSearchParams(window.location.search);
const plan=String(params.get('plan')||'').toLowerCase();
const validPlan=ALLOWED_PLANS.includes(plan);
const $=(id:string)=>document.getElementById(id);
const btn=$('start-checkout') as HTMLButtonElement;
const verify=$('verify-checkout') as HTMLButtonElement;
let verified=false;
let verifying=false;
let charging=false;
function put(id:string,value:string){const el=$(id);if(el)el.textContent=value}
function lock(reason:string){verified=false;btn.disabled=true;put('checkout-state','PAYMENT HOLD');put('checkout-detail',reason)}
function sessionToken(){
  try{
    const payload=JSON.parse(sessionStorage.getItem('tfa_session')||'null');
    return typeof payload?.access_token==='string'&&payload.access_token.length>30
      ? payload.access_token:'';
  }catch{return ''}
}
async function edge(path:string,timeout=6000){
  const response=await fetch(BASE+'/functions/v1/'+path,{
    headers:{apikey:KEY,Accept:'application/json'},
    cache:'no-store',signal:AbortSignal.timeout(timeout)
  });
  const data=await response.json().catch(()=>({ok:false,error:'invalid_json'}));
  return {response,data};
}
async function local(path:string,timeout=7500){
  const response=await fetch(path,{headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(timeout)});
  const data=await response.json().catch(()=>({ok:false,error:'invalid_json'}));
  return {response,data};
}
async function validateMember(token:string){
  const response=await fetch(BASE+'/functions/v1/member-session',{
    headers:{apikey:KEY,Authorization:'Bearer '+token,Accept:'application/json'},
    cache:'no-store',signal:AbortSignal.timeout(6500)
  });
  const data=await response.json().catch(()=>({ok:false}));
  return response.ok&&data?.ok!==false&&data?.access_state!=='denied';
}
async function verifyCheckout(){
  if(verifying||charging)return;
  verifying=true;verify.disabled=true;lock('Running independent, bounded, read-only acceptance checks. No charge is being created.');
  try{
    if(!validPlan)throw new Error('Select a valid plan from the membership page.');
    const token=sessionToken();
    if(!token)throw new Error('Sign in through the Member Portal first, then return to checkout.');
    const [auth,readiness,billing,qa,member]=await Promise.allSettled([
      edge('public-auth-runtime-check'),
      edge('public-final-readiness'),
      edge('public-billing-acceptance'),
      local('/api/autonomous-qa-matrix?commercial_acceptance=1'),
      validateMember(token)
    ]);
    const good=(x:any)=>x.status==='fulfilled'?x.value:{response:{ok:false,headers:{get:()=>null}},data:{ok:false}};
    const a=good(auth),r=good(readiness),b=good(billing),q=good(qa);
    const loggedIn=member.status==='fulfilled'&&member.value===true;
    put('account-state',loggedIn?'Authenticated member session verified':'A current authenticated member session could not be verified.');
    const gate=evaluateLaunchReadiness({auth:a,readiness:r,billing:b,qa:q});
    const planOk=planEligible(plan,b.data);
    const cycles=q.data?.continuous_kernel?.consecutive_successes
      ??q.data?.runtime?.continuous_kernel?.consecutive_successes??0;
    const cyclesOk=Number.isInteger(cycles)&&cycles>=2;
    const allOk=loggedIn&&gate.ready&&planOk&&cyclesOk;
    const amount=planOk?priceFor(plan,b.data):null;
    put('provider-state',planOk&&amount!==null
      ? 'Verified provider amount: USD '+amount.toFixed(2)+'/month. '+(cyclesOk?'Kernel cycle verification passed.':'Two consecutive kernel cycles are not yet verified.')
      : 'Live, consistent recurring USD pricing or verified provider payment evidence is unavailable.');
    put('selected-plan',plan.toUpperCase()+(amount!==null?' · USD '+amount.toFixed(2)+'/month':' · Price not verified'));
    if(!allOk){
      const reasons=[!loggedIn?'membership authentication':null,...gate.blockers,!planOk?'payment provider or plan mapping':null,!cyclesOk?'two successful kernel cycles':null].filter(Boolean);
      lock('Checkout blocked until these checks pass: '+reasons.join(', ')+'. No charge has been created.');
    }else{
      verified=true;btn.disabled=false;
      put('checkout-state','VERIFIED · EXPLICIT PAYMENT AVAILABLE');
      put('checkout-detail','All current checks passed. Review monthly USD price and recurring terms on Flutterwave before confirming payment. Continuing will create a checkout intent.');
    }
    put('checkout-message','Last verified '+new Date().toLocaleTimeString()+'. Checkout is never automatic.');
  }catch(e){
    lock(e instanceof Error?e.message:'Unable to verify safe payment readiness.');
    put('checkout-message','No charge was created. Please use commercial enquiry while the platform is unavailable.');
  }finally{verifying=false;verify.disabled=false}
}
async function startCheckout(){
  if(!verified||btn.disabled||charging)return;
  charging=true;btn.disabled=true;verify.disabled=true;
  put('checkout-message','Creating a hosted provider checkout. No card or bank details are entered here.');
  try{
    const token=sessionToken();
    if(!token||!validPlan)throw new Error('Sign in and verify your plan again.');
    // Short-lived verification: rerun all checks at the actual intent point.
    verified=false;
    await verifyAcceptanceBeforeCharge(token);
    const response=await fetch(BASE+'/functions/v1/create-checkout',{
      method:'POST',
      headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({plan_id:plan}),cache:'no-store',signal:AbortSignal.timeout(15000)
    });
    const data=await response.json().catch(()=>({ok:false,error:'invalid_json'}));
    if(!response.ok||data?.ok!==true||!validProviderCheckout(data?.checkout_url))throw new Error('The provider checkout could not be validated. No payment confirmation is implied.');
    window.location.assign(data.checkout_url);
  }catch(e){
    lock(e instanceof Error?e.message:'Hosted provider checkout unavailable');
    put('checkout-message','No payment is confirmed. If a provider checkout was already opened, verify your membership ledger before retrying.');
  }finally{charging=false;verify.disabled=false;btn.disabled=true}
}
async function verifyAcceptanceBeforeCharge(token:string){
  // A prior green browser label is not authorization for a new purchase.
  const [a,r,b,q,member]=await Promise.all([
    edge('public-auth-runtime-check'),edge('public-final-readiness'),
    edge('public-billing-acceptance'),local('/api/autonomous-qa-matrix?commercial_acceptance=1'),
    validateMember(token)
  ]);
  const gate=evaluateLaunchReadiness({auth:a,readiness:r,billing:b,qa:q});
  const cycles=q.data?.continuous_kernel?.consecutive_successes
    ??q.data?.runtime?.continuous_kernel?.consecutive_successes??0;
  if(!member||!gate.ready||!planEligible(plan,b.data)||!Number.isInteger(cycles)||cycles<2)
    throw new Error('Payment readiness changed. Checkout remains on hold.');
}
put('selected-plan',validPlan?plan.toUpperCase():'INVALID PLAN');
if(!validPlan)lock('Unknown plan. Return to pricing and choose an available membership.');
verify.addEventListener('click',()=>{void verifyCheckout()});
btn.addEventListener('click',()=>{void startCheckout()});
