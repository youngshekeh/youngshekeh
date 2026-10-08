import { getVercelOidcToken } from '@vercel/oidc';

const RUNTIME='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v180-kernel-seal';

export const config={maxDuration:90};

function failClosed(res,status,error,detail){
  console.error('V180_KERNEL_SEAL_HEARTBEAT_FAILED',{status,error,detail:detail?String(detail).slice(0,160):null,at:new Date().toISOString()});
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Engine','V180-SEAL');
  return res.status(status).json({
    ok:false,
    version:'v180-kernel-seal-heartbeat-v1',
    state:'FAIL_CLOSED',
    error,
    detail:detail?String(detail).slice(0,180):undefined,
    governance:{
      recovery_mode:true,
      external_execution:false,
      action_permitted:'WAIT',
      capital_permission:'0R',
      funds_moved:false,
      trades_sent:false
    }
  });
}

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return failClosed(res,405,'method_not_allowed');
  }

  const cronSecret=process.env.CRON_SECRET||'';
  const authHeader=String(req.headers.authorization||'');
  if(!cronSecret||authHeader!==`Bearer ${cronSecret}`){
    return failClosed(res,401,'unauthorized_cron_heartbeat');
  }

  const schedule=String(req.headers['x-vercel-cron-schedule']||'*/5 * * * *');
  console.log('V180_KERNEL_SEAL_HEARTBEAT_ACCEPTED',{schedule,at:new Date().toISOString()});

  let oidc='';
  try{oidc=await getVercelOidcToken();}catch(error){
    return failClosed(res,503,'vercel_workload_identity_unavailable',error);
  }
  if(!oidc)return failClosed(res,503,'vercel_workload_identity_unavailable');

  try{
    const response=await fetch(RUNTIME,{
      method:'GET',
      headers:{
        Authorization:`Bearer ${oidc}`,
        Accept:'application/json',
        'User-Agent':'TFA-V180-KERNEL-SEAL-HEARTBEAT/1.0',
        'X-TFA-Cron-Schedule':schedule
      },
      cache:'no-store',
      signal:AbortSignal.timeout(80000)
    });
    const body=await response.json().catch(()=>null);
    if(!response.ok||!body?.ok){
      return failClosed(res,response.status||503,body?.error||'scheduler_recovery_runtime_unavailable',body?.detail||body?.state);
    }

    const tables=Array.isArray(body.tables)?body.tables:[];
    const functions=Array.isArray(body.functions)?body.functions:[];

    console.log('V180_KERNEL_SEAL_HEARTBEAT_SUCCEEDED',{
      state:body.state,
      changed:body.changed||0,
      missing:Array.isArray(body.missing)?body.missing:[],
      active_jobs:body.active_jobs??null,
      duration_ms:body.duration_ms??null,
      at:new Date().toISOString()
    });

    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-TFA-Runtime','PUBLIC-CRON-SHELL-PRIVATE-BRAIN');
    res.setHeader('X-TFA-Auth','CRON_SECRET+VERCEL_OIDC');
    res.setHeader('X-TFA-Engine','V180-SEAL');
    return res.status(200).json({
      ok:true,
      version:'v180-kernel-seal-heartbeat-v1',
      generated_at:body.generated_at,
      state:body.state,
      duration_ms:body.duration_ms??null,
      tables,
      functions,
      governance:body.governance
    });
  }catch(error){
    return failClosed(res,503,'scheduler_recovery_bridge_unavailable',error);
  }
}
