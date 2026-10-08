import { getVercelOidcToken } from '@vercel/oidc';

const KERNEL='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v180-continuous-kernel';
const GOVERNOR='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v180-emergency-scheduler-governor';
const SEAL='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v180-kernel-seal';
const CRON_GATE='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v180-cron-launch-gate';

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
    version:'v180.9-sealed-kernel-heartbeat-v1',
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
async function resumeCron(oidc,schedule){
  return await callPrivate(
    CRON_GATE+'?mode=on',oidc,12000,'TFA-V180-CRON-GATE/2.0',
    {'X-TFA-Cron-Schedule':schedule}
  );
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

  const schedule=String(req.headers['x-vercel-cron-schedule']||'*/5 * * * *');
  console.log('V180_HEARTBEAT_ACCEPTED',{schedule,mode:'SEALED_KERNEL_FIRST',at:new Date().toISOString()});

  let oidc='';
  try{oidc=await getVercelOidcToken();}catch(error){
    return failClosed(res,503,'FAIL_CLOSED','vercel_workload_identity_unavailable',error);
  }
  if(!oidc)return failClosed(res,503,'FAIL_CLOSED','vercel_workload_identity_unavailable');

  const kernel=await callPrivate(
    KERNEL,oidc,22000,'TFA-V180-CONTINUOUS-HEARTBEAT/5.0',
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
      version:'v180.9-sealed-kernel-heartbeat-v1',
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

  const quiesce=await callPrivate(
    CRON_GATE+'?mode=off',oidc,12000,'TFA-V180-CRON-GATE/3.0',
    {'X-TFA-Cron-Schedule':schedule}
  );

  if(!quiesce.ok){
    return failClosed(
      res,503,'RECOVERY_QUIESCE_BLOCKED','cron_launch_gate_unavailable',
      quiesce.body?.detail||quiesce.body?.error||quiesce.body?.state,
      {
        kernel:{ok:false,status:kernel.status,error:kernel.body?.error||kernel.body?.stage||'kernel_unavailable',duration_ms:kernel.duration_ms},
        quiesce:{ok:false,status:quiesce.status,state:quiesce.body?.state||null,duration_ms:quiesce.duration_ms}
      }
    );
  }

  const governor=await callPrivate(
    GOVERNOR,oidc,25000,'TFA-V180-RECOVERY-HEARTBEAT/6.0',
    {'X-TFA-Cron-Schedule':schedule}
  );

  if(!governor.ok){
    return failClosed(
      res,503,'RECOVERY_BLOCKED_CRON_QUIESCED','scheduler_recovery_unavailable',
      governor.body?.detail||governor.body?.error,
      {
        quiesce:{ok:true,status:quiesce.status,state:quiesce.body?.state||null,duration_ms:quiesce.duration_ms},
        kernel:{ok:false,status:kernel.status,error:kernel.body?.error||kernel.body?.stage||'kernel_unavailable',duration_ms:kernel.duration_ms},
        recovery:{ok:false,status:governor.status,error:governor.body?.error||'scheduler_recovery_unavailable',duration_ms:governor.duration_ms},
        seal:{skipped:true},
        resume:{skipped:true}
      }
    );
  }

  const seal=await callPrivate(
    SEAL,oidc,30000,'TFA-V180-KERNEL-SEAL-HEARTBEAT/3.0',
    {'X-TFA-Cron-Schedule':schedule}
  );

  if(!seal.ok){
    return failClosed(
      res,503,'SECURITY_SEAL_PENDING_CRON_QUIESCED','kernel_security_seal_unavailable',
      seal.body?.detail||seal.body?.error,
      {
        quiesce:{ok:true,status:quiesce.status,state:quiesce.body?.state||null,duration_ms:quiesce.duration_ms},
        kernel:{ok:false,status:kernel.status,error:kernel.body?.error||kernel.body?.stage||'kernel_unavailable',duration_ms:kernel.duration_ms},
        recovery:{ok:true,status:governor.status,state:governor.body?.state||null,changed:governor.body?.changed||0,missing:governor.body?.missing||[],duration_ms:governor.duration_ms},
        seal:{ok:false,status:seal.status,error:seal.body?.error||'kernel_security_seal_unavailable',duration_ms:seal.duration_ms},
        resume:{skipped:true}
      }
    );
  }

  const resume=await resumeCron(oidc,schedule);
  if(!resume.ok){
    return failClosed(
      res,503,'SEALED_CRON_QUIESCED','cron_resume_blocked',
      resume.body?.detail||resume.body?.error||resume.body?.state,
      {
        quiesce:{ok:true,status:quiesce.status,state:quiesce.body?.state||null,duration_ms:quiesce.duration_ms},
        kernel:{ok:false,status:kernel.status,duration_ms:kernel.duration_ms},
        recovery:{ok:true,status:governor.status,state:governor.body?.state||null,changed:governor.body?.changed||0,duration_ms:governor.duration_ms},
        seal:{ok:true,status:seal.status,state:seal.body?.state||null,duration_ms:seal.duration_ms},
        resume:{ok:false,status:resume.status,state:resume.body?.state||null,duration_ms:resume.duration_ms}
      }
    );
  }

  console.log('V180_RECOVERY_AND_SEAL_SUCCEEDED',{
    recovery_state:governor.body?.state,
    changed:governor.body?.changed||0,
    seal_state:seal.body?.state,
    at:new Date().toISOString()
  });

  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Runtime','PUBLIC-CRON-SHELL-PRIVATE-BRAIN');
  res.setHeader('X-TFA-Auth','CRON_SECRET+VERCEL_OIDC');
  res.setHeader('X-TFA-Engine','V180-SEALED');
  return res.status(200).json({
    ok:true,
    version:'v180.9-sealed-kernel-heartbeat-v1',
    state:'SEALED_AWAITING_KERNEL_HEARTBEAT',
    generated_at:seal.body?.generated_at||new Date().toISOString(),
    stages:{
      quiesce:{ok:true,status:quiesce.status,state:quiesce.body?.state||null,duration_ms:quiesce.duration_ms},
      kernel:{ok:false,status:kernel.status,error:kernel.body?.error||kernel.body?.stage||'kernel_not_sealed',duration_ms:kernel.duration_ms},
      recovery:{ok:true,status:governor.status,state:governor.body?.state||null,changed:governor.body?.changed||0,missing:governor.body?.missing||[],duration_ms:governor.duration_ms},
      seal:{ok:true,status:seal.status,state:seal.body?.state||null,receipt:seal.body?.receipt||null,duration_ms:seal.duration_ms},
      resume:{ok:true,status:resume.status,state:resume.body?.state||null,duration_ms:resume.duration_ms}
    },
    governance:{
      recovery_mode:true,
      internal_execution_only:true,
      external_execution:false,
      action_permitted:'WAIT',
      capital_permission:'0R',
      funds_moved:false,
      trades_sent:false,
      human_release_required:true
    }
  });
}
