import { getVercelOidcToken } from '@vercel/oidc';

const TARGET='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v147-connection-pressure-shadow';

function failClosed(res,status,error,detail){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Engine','V147');
  return res.status(status).json({
    ok:false,
    version:'v147-connection-pressure-shadow-bridge-v1',
    state:'FAIL_CLOSED',
    error,
    detail:detail?String(detail).slice(0,180):undefined,
    governance:{
      action_permitted:'WAIT',
      capital_permission:'0R',
      live_order_routing:false,
      automatic_connection_throttling:false,
      automatic_pool_reconfiguration:false,
      automatic_rescheduling:false
    }
  });
}

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return failClosed(res,405,'method_not_allowed');
  }
  let oidcToken='';
  try{oidcToken=await getVercelOidcToken();}catch{}
  if(!oidcToken)return failClosed(res,503,'vercel_workload_identity_unavailable');
  try{
    const upstream=await fetch(TARGET,{
      headers:{
        Authorization:`Bearer ${oidcToken}`,
        Accept:'application/json',
        'User-Agent':'THE-FATHER-ANALYTICS-V147-CONNECTION-PRESSURE/1.0'
      },
      cache:'no-store',
      signal:AbortSignal.timeout(15000)
    });
    const body=await upstream.json().catch(()=>null);
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-TFA-Runtime','PRIVATE_BRAIN');
    res.setHeader('X-TFA-Auth','VERCEL_OIDC');
    res.setHeader('X-TFA-Engine','V147');
    if(!body)return failClosed(res,upstream.status||503,'v147_private_runtime_unavailable');
    return res.status(upstream.status).json(body);
  }catch(error){
    return failClosed(res,503,'v147_private_runtime_unavailable',error);
  }
}
