import { getVercelOidcToken } from '@vercel/oidc';

const KERNEL='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v180-continuous-kernel';

export const config={maxDuration:90};

function safeDetail(value){
  return value===undefined||value===null?undefined:String(value).slice(0,180);
}
function failClosed(res,status,state,error,detail,stages={}){
  console.error('V180_HEARTBEAT_FAIL_CLOSED',{
    state,error,detail:safeDetail(detail),stages,at:new Date().toISOString()
  });
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Engine','V180-SEALED-KERNEL');
  return res.status(status).json({
    ok:false,
    version:'v207.0-bounded-kernel-heartbeat-v1',
    state,
    error,
    detail:safeDetail(detail),
    stages,
    governance:{
      recovery_mode:true,
      external_execution:false,
      action_permitted:'WAIT',
      capital_permission:'0R',
      funds_moved:false,
      trades_sent:false,
      human_release_required:true
    }
  });
}
async function callPrivate(url,token,timeout,userAgent,extraHeaders={}){
  const started=Date.now();
  try{
    const response=await fetch(url,{
      method:'GET',
      headers:{
        Authorization:`Bearer ${token}`,
        Accept:'application/json',
        'User-Agent':userAgent,
        ...extraHeaders
      },
      cache:'no-store',
      signal:AbortSignal.timeout(timeout)
    });
    const body=await response.json().catch(()=>null);
    return{
      ok:response.ok&&body?.ok===true,
      status:response.status,
      body,
      duration_ms:Date.now()-started
    };
  }catch(error){
    return{
      ok:false,
      status:503,
      body:{error:'private_runtime_request_failed',detail:safeDetail(error)},
      duration_ms:Date.now()-started
    };
  }
}
export default async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return failClosed(res,405,'FAIL_CLOSED','method_not_allowed');
  }

  const cronSecret=process.env.CRON_SECRET||'';
  const authHeader=String(req.headers.authorization||'');
  if(!cronSecret||authHeader!==`Bearer ${cronSecret}`){
    return failClosed(res,401,'FAIL_CLOSED','unauthorized_cron_heartbeat');
  }

  const schedule=String(req.headers['x-vercel-cron-schedule']||'4-59/15 * * * *');
  console.log('V180_HEARTBEAT_ACCEPTED',{schedule,mode:'SEALED_KERNEL_FIRST',at:new Date().toISOString()});

  let oidc='';
  try{oidc=await getVercelOidcToken();}catch(error){
    return failClosed(res,503,'FAIL_CLOSED','vercel_workload_identity_unavailable',error);
  }
  if(!oidc)return failClosed(res,503,'FAIL_CLOSED','vercel_workload_identity_unavailable');

  const kernel=await callPrivate(
    KERNEL,oidc,70000,'TFA-V180-CONTINUOUS-HEARTBEAT/5.0',
    {'X-TFA-Trigger':'VERCEL_CRON','X-TFA-Cron-Schedule':schedule}
  );

  if(kernel.ok){
    const runs=Array.isArray(kernel.body?.runs)?kernel.body.runs.map(({user_id,...safe})=>safe):[];
    console.log('V180_KERNEL_HEARTBEAT_SUCCEEDED',{
      owners_processed:kernel.body?.owners_processed??null,
      duration_ms:kernel.duration_ms,
      at:new Date().toISOString()
    });
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-TFA-Runtime','PUBLIC-CRON-SHELL-PRIVATE-BRAIN');
    res.setHeader('X-TFA-Auth','CRON_SECRET+VERCEL_OIDC');
    res.setHeader('X-TFA-Engine','V180-CONTINUOUS');
    return res.status(200).json({
      ok:true,
      version:'v181.0-nondisruptive-ops-heartbeat-v1',
      state:'CONTINUOUS_KERNEL_ACTIVE',
      generated_at:kernel.body?.generated_at,
      owners_processed:kernel.body?.owners_processed??null,
      runs,
      seal:kernel.body?.seal||null,
      stages:{
        kernel:{ok:true,status:kernel.status,duration_ms:kernel.duration_ms},
        quiesce:{skipped:true},
        recovery:{skipped:true},
        seal:{skipped:true},
        resume:{skipped:true}
      },
      governance:kernel.body?.governance
    });
  }

  // Recovery must never pause pg_cron globally because a failed private call
  // is not evidence that unrelated scheduled jobs should be stopped.
  // The sealed private kernel owns its own bounded retries and dispatch leases.
  return failClosed(
    res,503,'KERNEL_UNAVAILABLE_NON_DISRUPTIVE','private_kernel_unhealthy',
    kernel.body?.stage||kernel.body?.error||'private_kernel_request_failed',
    {
      kernel:{ok:false,status:kernel.status,duration_ms:kernel.duration_ms},
      database_scheduler:{changed:false,reason:'preserve_unrelated_cron_jobs'},
      recovery:{skipped:true,reason:'explicit_approved_runbook_required'},
      seal:{skipped:true},
      resume:{skipped:true}
    }
  );
}
