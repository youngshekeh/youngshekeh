import { getVercelOidcToken } from '@vercel/oidc';

const RUNTIME='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v179-resource-governor';

function failClosed(res,status,error,detail){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Engine','V180');
  return res.status(status).json({
    ok:false,
    version:'v180.0.1-heartbeat-shell-v1',
    state:'FAIL_CLOSED',
    error,
    detail:detail?String(detail).slice(0,180):undefined,
    governance:{
      continuous_operations:true,
      internal_execution_only:true,
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
  const authHeader=req.headers.authorization||'';
  if(!cronSecret||authHeader!==`Bearer ${cronSecret}`){
    return failClosed(res,401,'unauthorized_cron_heartbeat');
  }

  console.log('V180_HEARTBEAT_ACCEPTED',{schedule:String(req.headers['x-vercel-cron-schedule']||'unknown'),at:new Date().toISOString()});

  let oidc='';
  try{oidc=await getVercelOidcToken();}catch{}
  if(!oidc)return failClosed(res,503,'vercel_workload_identity_unavailable');

  try{
    const response=await fetch(RUNTIME,{
      headers:{
        Authorization:`Bearer ${oidc}`,
        Accept:'application/json',
        'User-Agent':'TFA-V180.0-HEARTBEAT-SHELL/1.0',
        'X-TFA-Trigger':'CRON',
        'X-TFA-Cron-Schedule':String(req.headers['x-vercel-cron-schedule']||'*/5 * * * *')
      },
      cache:'no-store',
      signal:AbortSignal.timeout(60000)
    });
    const body=await response.json().catch(()=>null);
    if(!response.ok||!body?.ok){
      return failClosed(res,response.status||503,body?.error||'private_runtime_unavailable',body?.detail);
    }

    const results=Array.isArray(body.results)?body.results.map(({user_id,...safe})=>safe):[];
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-TFA-Runtime','PUBLIC-CRON-SHELL-PRIVATE-BRAIN');
    res.setHeader('X-TFA-Auth','CRON_SECRET+VERCEL_OIDC');
    res.setHeader('X-TFA-Engine','V180');
    console.log('V180_HEARTBEAT_SUCCEEDED',{owners_processed:body.owners_processed||0,at:new Date().toISOString()});
    return res.status(200).json({
      ok:true,
      version:'v180.0.1-heartbeat-shell-v1',
      generated_at:body.generated_at,
      owners_processed:body.owners_processed,
      owners_skipped:body.owners_skipped||0,
      state:body.state||'ACTIVE',
      results,
      governance:body.governance
    });
  }catch(error){
    return failClosed(res,503,'continuous_operations_bridge_unavailable',error);
  }
}
