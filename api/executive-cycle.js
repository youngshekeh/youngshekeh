import { getVercelOidcToken } from '@vercel/oidc';

const RUNTIME='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v176-capability-router';

function failClosed(res,status,error,detail){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Engine','V176');
  return res.status(status).json({
    ok:false,
    version:'v176.2-capability-router-bridge-v1',
    state:'FAIL_CLOSED',
    error,
    detail:detail?String(detail).slice(0,180):undefined,
    governance:{planning_only:true,action_permitted:'WAIT',capital_permission:'0R',funds_moved:false,trades_sent:false,human_approval_bypassed:false}
  });
}

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return failClosed(res,405,'method_not_allowed');
  }
  let oidc='';
  try{oidc=await getVercelOidcToken();}catch{}
  if(!oidc)return failClosed(res,503,'vercel_workload_identity_unavailable');

  try{
    const response=await fetch(RUNTIME,{
      headers:{Authorization:`Bearer ${oidc}`,Accept:'application/json','User-Agent':'TFA-V176.2-CAPABILITY-ROUTER-BRIDGE/1.0'},
      cache:'no-store',
      signal:AbortSignal.timeout(45000)
    });
    const body=await response.json().catch(()=>null);
    if(!response.ok||!body?.ok)return failClosed(res,response.status||503,body?.error||'private_runtime_unavailable',body?.detail);

    const results=Array.isArray(body.results)?body.results.map(({user_id,...safe})=>safe):[];
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-TFA-Runtime','PUBLIC-SHELL-PRIVATE-BRAIN');
    res.setHeader('X-TFA-Auth','VERCEL_OIDC');
    res.setHeader('X-TFA-Engine','V176');
    return res.status(200).json({
      ok:true,
      version:'v176.2-capability-router-bridge-v1',
      generated_at:body.generated_at,
      owners_processed:body.owners_processed,
      results,
      governance:body.governance
    });
  }catch(error){
    return failClosed(res,503,'executive_cycle_bridge_unavailable',error);
  }
}
