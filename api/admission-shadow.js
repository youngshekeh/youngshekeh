import { getVercelOidcToken } from '@vercel/oidc';

const TARGET='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v145-admission-shadow';

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }

  let oidcToken='';
  try{ oidcToken=await getVercelOidcToken(); }catch{}

  if(!oidcToken){
    res.setHeader('Cache-Control','no-store');
    return res.status(503).json({
      ok:false,
      version:'v145.2-connection-admission-shadow-bridge-v2',
      state:'FAIL_CLOSED',
      error:'vercel_workload_identity_unavailable',
      governance:{
        action_permitted:'WAIT',
        capital_permission:'0R',
        live_order_routing:false,
        automatic_policy_promotion:false,
        automatic_rescheduling:false
      }
    });
  }

  try{
    const upstream=await fetch(TARGET,{
      headers:{
        Authorization:`Bearer ${oidcToken}`,
        Accept:'application/json',
        'User-Agent':'THE-FATHER-ANALYTICS-V145.2-ADMISSION/2.0'
      },
      cache:'no-store',
      signal:AbortSignal.timeout(15000)
    });
    const body=await upstream.json().catch(()=>null);
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-TFA-Runtime','PRIVATE_BRAIN');
    res.setHeader('X-TFA-Auth','VERCEL_OIDC');
    res.setHeader('X-TFA-Admission','V145.2');
    return res.status(upstream.ok?200:upstream.status).json(body??{
      ok:false,
      version:'v145.2-connection-admission-shadow-bridge-v2',
      state:'FAIL_CLOSED',
      error:'private_admission_runtime_unavailable',
      governance:{
        action_permitted:'WAIT',
        capital_permission:'0R',
        live_order_routing:false,
        automatic_policy_promotion:false,
        automatic_rescheduling:false
      }
    });
  }catch(error){
    res.setHeader('Cache-Control','no-store');
    return res.status(503).json({
      ok:false,
      version:'v145.2-connection-admission-shadow-bridge-v2',
      state:'FAIL_CLOSED',
      error:'private_admission_runtime_unavailable',
      detail:String(error).slice(0,160),
      governance:{
        action_permitted:'WAIT',
        capital_permission:'0R',
        live_order_routing:false,
        automatic_policy_promotion:false,
        automatic_rescheduling:false
      }
    });
  }
}
