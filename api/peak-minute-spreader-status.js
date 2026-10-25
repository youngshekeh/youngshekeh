import { getVercelOidcToken } from '@vercel/oidc';
import { checkHeartbeatIncident } from '../src/v307-heartbeat-incident-admission.mjs';

const TARGET='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v1461-peak-spreader-status';

function failClosed(res,status,error,detail){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Engine','V146.1');
  return res.status(status).json({
    ok:false,
    version:'v146.1-controlled-peak-spreader-bridge-v1',
    state:'FAIL_CLOSED',
    error,
    detail:detail?String(detail).slice(0,180):undefined,
    governance:{
      action_permitted:'WAIT',
      capital_permission:'0R',
      live_order_routing:false,
      automatic_rescheduling:false,
      automatic_policy_promotion:false
    }
  });
}

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return failClosed(res,405,'method_not_allowed');
  }

  // V308: a *current, independently consistent* incident can defer this
  // expensive private diagnostic. Missing/stale/contradictory evidence
  // automatically falls through to the original OIDC authenticated path.
  const incident=await checkHeartbeatIncident();
  if(incident.defer_private_kernel){
    res.setHeader('Retry-After','300');
    res.setHeader('X-TFA-Diagnostic','READONLY-INCIDENT-LOAD-SHED');
    console.warn('V308_PRIVATE_DIAGNOSTIC_DEFERRED',{bridge:'V146.1',
      private_request_attempted:false,at:new Date().toISOString()});
    return failClosed(res,503,'verified_database_incident_diagnostic_deferred',
      'private_diagnostic_request_skipped');
  }

  let oidcToken='';
  try{oidcToken=await getVercelOidcToken();}catch{}
  if(!oidcToken)return failClosed(res,503,'vercel_workload_identity_unavailable');

  try{
    const upstream=await fetch(TARGET,{
      headers:{
        Authorization:`Bearer ${oidcToken}`,
        Accept:'application/json',
        'User-Agent':'THE-FATHER-ANALYTICS-V146.1-PEAK-SPREADER/1.0'
      },
      cache:'no-store',
      // Existing 25s database limit + Edge auth/transport margin; no retries.
      signal:AbortSignal.timeout(35000)
    });
    const body=await upstream.json().catch(()=>null);
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-TFA-Runtime','PRIVATE_BRAIN');
    res.setHeader('X-TFA-Auth','VERCEL_OIDC');
    res.setHeader('X-TFA-Engine','V146.1');
    if(!body)return failClosed(res,upstream.status||503,'v1461_private_runtime_unavailable');
    return res.status(upstream.status).json(body);
  }catch(error){
    return failClosed(res,503,'v1461_private_runtime_unavailable',error);
  }
}
