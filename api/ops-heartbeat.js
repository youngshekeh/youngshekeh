import { getVercelOidcToken } from '@vercel/oidc';
import { certifyKernelReceipt } from '../src/kernel-receipt-gate.mjs';
import { classifyV231KernelIncident } from '../src/v231-kernel-admission.mjs';
import { checkHeartbeatIncident } from '../src/v307-heartbeat-incident-admission.mjs';
import { createKernelPressureCircuit } from '../src/v330-kernel-pressure-circuit.mjs';

const KERNEL='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v180-continuous-kernel';
// Warm-isolate guard; does not alter schedules, provider timeouts or database.
const pressureCircuit=createKernelPressureCircuit();

export const config={maxDuration:90};

function safeDetail(value){
  return value===undefined||value===null?undefined:String(value).slice(0,180);
}
function failClosed(res,status,state,error,detail,stages={}){
  const logPayload={state,error,detail:safeDetail(detail),stages,at:new Date().toISOString()};
  if(state==='KERNEL_DEFERRED_DURING_DATABASE_INCIDENT')
    console.warn('V307_HEARTBEAT_LOAD_SHED',logPayload);
  else console.error('V180_HEARTBEAT_FAIL_CLOSED',logPayload);
  res.setHeader('Cache-Control','no-store');
  if(status===503)res.setHeader('Retry-After','300');
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

  const schedule=String(req.headers['x-vercel-cron-schedule']||'4-59/5 * * * *');
  console.log('V180_HEARTBEAT_ACCEPTED',{schedule,mode:'SEALED_KERNEL_FIRST',at:new Date().toISOString()});

  // V307: only a fresh, exact read-only incident verdict may defer this cycle.
  // This avoids a costly private kernel call during confirmed shared DB failure.
  // A missing, stale or negative verdict never claims success and falls through
  // to the unchanged sealed OIDC kernel path. The 5-minute schedule is intact.
  const incident=await checkHeartbeatIncident();
  if(incident.defer_private_kernel){
    return failClosed(res,503,'KERNEL_DEFERRED_DURING_DATABASE_INCIDENT',
      'verified_database_incident_load_shed',incident.reason,{
       public_incident:{verified:true,source:'PUBLIC_READ_ONLY_TRIAGE'},
       kernel:{attempted:false,ok:false},
       database_scheduler:{changed:false,reason:'preserve_unrelated_cron_jobs'},
       recovery:{skipped:true,reason:'await_provider_connectivity'},
       seal:{skipped:true},resume:{skipped:true}
    });
  }

  const admission=pressureCircuit.acquire();
  if(!admission.permitted){
    return failClosed(res,503,'PRIVATE_KERNEL_PRESSURE_COOLDOWN',
      admission.reason,'warm_isolate_private_database_work_deferred',{
        kernel:{attempted:false,verified:false},
        circuit:{retry_after_seconds:admission.retry_after_seconds,per_isolate_only:true},
        database_scheduler:{changed:false,reason:'preserve_all_pg_cron_jobs'}
      });
  }
  let privateVerified=false,backendUnavailable=false;
  try{
  let oidc='';
  try{oidc=await getVercelOidcToken();}catch(error){
    return failClosed(res,503,'FAIL_CLOSED','vercel_workload_identity_unavailable',error);
  }
  if(!oidc)return failClosed(res,503,'FAIL_CLOSED','vercel_workload_identity_unavailable');

  const kernel=await callPrivate(
    KERNEL,oidc,70000,'TFA-V180-CONTINUOUS-HEARTBEAT/5.0',
    {'X-TFA-Trigger':'VERCEL_CRON','X-TFA-Cron-Schedule':schedule}
  );

  // Verified execution receipts, not a successful HTTP request, authorize a green
  // heartbeat. The V180 Edge function can return ok=true with only overlap or
  // backoff notices; those must never clear an incident or launch hold.
  const proof=kernel.ok?certifyKernelReceipt(kernel.body):null;
  backendUnavailable=!kernel.ok&&(kernel.status===0||kernel.status>=500||kernel.duration_ms>=30000);
  if(kernel.ok&&!proof?.verified){
    return failClosed(res,503,'KERNEL_UNAVAILABLE_NON_DISRUPTIVE','kernel_receipts_uncertified',
      proof?.reason||'NO_VERIFIED_RUN_RECEIPT',{
        kernel:{ok:false,status:kernel.status,duration_ms:kernel.duration_ms},
        receipt:{verified:false,reason:proof?.reason||'UNAVAILABLE',counts:proof?.counts||{}},
        database_scheduler:{changed:false,reason:'preserve_unrelated_cron_jobs'},
        recovery:{skipped:true,reason:'explicit_approved_runbook_required'}
      });
  }
  if(kernel.ok&&proof?.verified){
    privateVerified=true;
    const runs=Array.isArray(kernel.body?.runs)?kernel.body.runs.map(({user_id,...safe})=>safe):[];
    console.log('V180_KERNEL_HEARTBEAT_SUCCEEDED',{
      owners_processed:proof.counts.owners,
      successful_runs:proof.counts.successful_runs,
      duration_ms:kernel.duration_ms,
      at:new Date().toISOString()
    });
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-TFA-Runtime','PUBLIC-CRON-SHELL-PRIVATE-BRAIN');
    res.setHeader('X-TFA-Auth','CRON_SECRET+VERCEL_OIDC');
    res.setHeader('X-TFA-Engine','V180-CONTINUOUS');
    return res.status(200).json({
      ok:true,
      version:'v216.0-receipt-certified-ops-heartbeat-v1',
      state:'CONTINUOUS_KERNEL_ACTIVE',
      generated_at:kernel.body?.generated_at,
      owners_processed:proof.counts.owners,
      run_receipt_certification:{verified:true,successful_runs:proof.counts.successful_runs,method:'FRESH_SEALED_HEALTHY_EXECUTION'},
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
      incident:classifyV231KernelIncident(kernel),
      database_scheduler:{changed:false,reason:'preserve_unrelated_cron_jobs'},
      recovery:{skipped:true,reason:'explicit_approved_runbook_required'},
      seal:{skipped:true},
      resume:{skipped:true}
    }
  );
  }finally{
    // Exactly one receipt can reset the circuit; HTTP 200 alone cannot.
    // Failed private DB/Edge transports open a bounded per-isolate cooldown.
    pressureCircuit.release({verified:privateVerified,backend_unavailable:backendUnavailable});
  }
}
