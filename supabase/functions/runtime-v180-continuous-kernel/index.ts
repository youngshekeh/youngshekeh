const TFA_PRIVATE_AUTHZ='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v115-oidc-probe';
const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'https://mpcelmjiycjpdyyflisn.supabase.co';
const SERVICE_ROLE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const V179=SUPABASE_URL+'/functions/v1/runtime-v179-resource-governor';

function constantTimeEqual(a:string,b:string){if(!a||!b||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
async function authorized(req:Request){
  const auth=req.headers.get('authorization')||'',token=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';
  if(!token)return false;
  if(SERVICE_ROLE&&constantTimeEqual(token,SERVICE_ROLE))return true;
  try{
    const r=await fetch(TFA_PRIVATE_AUTHZ,{headers:{Authorization:auth,Accept:'application/json'},signal:AbortSignal.timeout(5000)});
    const b=await r.json().catch(()=>null);
    return r.ok&&b?.ok===true&&b?.state==='VERCEL_WORKLOAD_VERIFIED';
  }catch{return false}
}
function headers(){return{apikey:SERVICE_ROLE,Authorization:`Bearer ${SERVICE_ROLE}`,Accept:'application/json','Content-Type':'application/json'}}
async function dbRows(path:string){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:headers(),signal:AbortSignal.timeout(15000)});
  const b=await r.json().catch(()=>[]);
  if(!r.ok)throw new Error(`db_${r.status}_${path.split('?')[0]}`);
  return Array.isArray(b)?b:[];
}
async function upsert(table:string,conflict:string,row:any){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`,{
    method:'POST',headers:{...headers(),Prefer:'resolution=merge-duplicates,return=representation'},
    body:JSON.stringify(row),signal:AbortSignal.timeout(15000)
  });
  const b=await r.json().catch(()=>[]);
  if(!r.ok)throw new Error(`upsert_${table}_${r.status}`);
  return Array.isArray(b)?b[0]||null:b;
}
async function insertRow(table:string,row:any){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${table}`,{
    method:'POST',headers:{...headers(),Prefer:'return=representation'},
    body:JSON.stringify(row),signal:AbortSignal.timeout(15000)
  });
  const b=await r.json().catch(()=>[]);
  if(!r.ok){const e:any=new Error(`insert_${table}_${r.status}`);e.status=r.status;e.body=b;throw e}
  return Array.isArray(b)?b[0]||null:b;
}
async function insertIgnore(table:string,conflict:string,row:any){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`,{
    method:'POST',headers:{...headers(),Prefer:'resolution=ignore-duplicates,return=minimal'},
    body:JSON.stringify(row),signal:AbortSignal.timeout(15000)
  });
  if(!r.ok)throw new Error(`insert_ignore_${table}_${r.status}`);
}
async function patchWhere(table:string,query:string,patch:any){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`,{
    method:'PATCH',headers:{...headers(),Prefer:'return=minimal'},
    body:JSON.stringify(patch),signal:AbortSignal.timeout(15000)
  });
  if(!r.ok)throw new Error(`patch_${table}_${r.status}`);
}
function kernelBucket(d=new Date()){
  const ms=5*60*1000,t=Math.floor(d.getTime()/ms)*ms;
  return new Date(t).toISOString();
}
function isoPlusSeconds(seconds:number){return new Date(Date.now()+Math.max(1,seconds)*1000).toISOString()}
function n(v:any){const x=Number(v);return Number.isFinite(x)?x:0}

async function ensurePolicy(userId:string){
  return await upsert('command_ops_kernel_policies','user_id,policy_key',{
    user_id:userId,policy_key:'DEFAULT_V180',heartbeat_minutes:5,stale_run_minutes:3,
    max_dispatch_attempts:3,base_backoff_seconds:300,degraded_after_failures:2,fail_closed_after_failures:3,
    notes:'Continuous internal operations only. Retry budget is bounded. Dead letters halt autonomous dispatch until reviewed.',
    updated_at:new Date().toISOString()
  });
}
async function beginRun(userId:string,policy:any,trigger:string){
  const now=Date.now(),staleMs=Math.max(1,n(policy?.stale_run_minutes)||3)*60000;
  const running=await dbRows('command_ops_kernel_runs?user_id=eq.'+encodeURIComponent(userId)+'&status=eq.RUNNING&select=*');
  for(const r of running){
    const age=now-new Date(r.started_at).getTime();
    if(Number.isFinite(age)&&age>staleMs){
      await patchWhere('command_ops_kernel_runs','id=eq.'+encodeURIComponent(r.id),{
        status:'FAILED',finished_at:new Date().toISOString(),duration_ms:Math.max(0,Math.round(age)),
        error_stage:'KERNEL_LOCK',error_detail:'stale_running_kernel_recovered',updated_at:new Date().toISOString()
      });
    }else{
      return null;
    }
  }
  const row={
    user_id:userId,run_key:'KERNEL:'+kernelBucket(),trigger_source:trigger,status:'RUNNING',
    governance:{external_execution:false,funds_moved:false,trades_sent:false,human_approval_bypassed:false},
    started_at:new Date().toISOString(),updated_at:new Date().toISOString()
  };
  try{return await insertRow('command_ops_kernel_runs',row)}
  catch(e:any){if(e?.status===409)return null;throw e}
}
async function upsertState(userId:string,patch:any){
  return await upsert('command_ops_kernel_state','user_id',{user_id:userId,...patch,updated_at:new Date().toISOString()});
}
async function recoverDispatches(userId:string,policy:any){
  const nowIso=new Date().toISOString();
  const expired=await dbRows('command_dispatch_leases?user_id=eq.'+encodeURIComponent(userId)+'&status=in.(CLAIMED,RUNNING)&lease_expires_at=lte.'+encodeURIComponent(nowIso)+'&select=*');
  let recovered=0,dead=0,nextRetryAt:string|null=null;
  const max=Math.max(1,n(policy?.max_dispatch_attempts)||3),base=Math.max(30,n(policy?.base_backoff_seconds)||300);
  for(const lease of expired){
    await patchWhere('command_dispatch_leases','id=eq.'+encodeURIComponent(lease.id),{status:'EXPIRED',updated_at:nowIso});
    const retries=await dbRows('command_dispatch_retries?user_id=eq.'+encodeURIComponent(userId)+'&task_id=eq.'+encodeURIComponent(lease.task_id)+'&source_fingerprint=eq.'+encodeURIComponent(lease.source_fingerprint)+'&select=*');
    const attempt=(retries[0]?.attempt_count||0)+1;
    if(attempt>=max){
      await upsert('command_dispatch_retries','user_id,task_id,source_fingerprint',{
        user_id:userId,task_id:lease.task_id,source_fingerprint:lease.source_fingerprint,attempt_count:attempt,max_attempts:max,
        status:'DEAD_LETTER',next_retry_at:null,last_lease_id:lease.id,last_error:'dispatch_lease_expired',updated_at:nowIso
      });
      await patchWhere('command_plan_tasks','id=eq.'+encodeURIComponent(lease.task_id)+'&source_fingerprint=eq.'+encodeURIComponent(lease.source_fingerprint),{status:'BLOCKED',updated_at:nowIso});
      await insertIgnore('command_ops_dead_letters','user_id,dead_letter_key',{
        user_id:userId,task_id:lease.task_id,plan_id:lease.plan_id,lease_id:lease.id,
        dead_letter_key:'DLQ:'+lease.task_id+':'+lease.source_fingerprint,source_fingerprint:lease.source_fingerprint,
        reason:'dispatch_lease_expired_after_retry_budget',attempts:attempt,
        evidence:{lease_expires_at:lease.lease_expires_at,external_effects:false},status:'OPEN',created_at:nowIso
      });
      dead++;
    }else{
      const delay=base*Math.pow(2,Math.max(0,attempt-1)),retryAt=isoPlusSeconds(delay);
      await upsert('command_dispatch_retries','user_id,task_id,source_fingerprint',{
        user_id:userId,task_id:lease.task_id,source_fingerprint:lease.source_fingerprint,attempt_count:attempt,max_attempts:max,
        status:'PENDING',next_retry_at:retryAt,last_lease_id:lease.id,last_error:'dispatch_lease_expired',updated_at:nowIso
      });
      await patchWhere('command_plan_tasks','id=eq.'+encodeURIComponent(lease.task_id)+'&source_fingerprint=eq.'+encodeURIComponent(lease.source_fingerprint),{status:'READY',started_at:null,updated_at:nowIso});
      recovered++;
      if(!nextRetryAt||retryAt<nextRetryAt)nextRetryAt=retryAt;
    }
  }
  const open=await dbRows('command_ops_dead_letters?user_id=eq.'+encodeURIComponent(userId)+'&status=in.(OPEN,ACKNOWLEDGED)&select=id');
  return{recovered,dead_lettered:dead,open_dead_letters:open.length,next_retry_at:nextRetryAt,external_effects:false};
}
async function invokeV179(){
  const r=await fetch(V179,{
    method:'GET',headers:{Authorization:`Bearer ${SERVICE_ROLE}`,Accept:'application/json','User-Agent':'TFA-V180-CONTINUOUS-KERNEL/1.0'},
    signal:AbortSignal.timeout(65000)
  });
  const b=await r.json().catch(()=>null);
  if(!r.ok||!b?.ok)throw new Error(`v179_${r.status}_${b?.stage||b?.error||'unavailable'}`);
  return b;
}
async function finishRun(userId:string,run:any,policy:any,success:boolean,metrics:any,errorStage?:string,errorDetail?:string){
  const now=new Date(),duration=Math.max(0,now.getTime()-new Date(run.started_at).getTime());
  await patchWhere('command_ops_kernel_runs','id=eq.'+encodeURIComponent(run.id),{
    status:success?'SUCCEEDED':'FAILED',finished_at:now.toISOString(),duration_ms:duration,
    error_stage:success?null:errorStage||'KERNEL',error_detail:success?null:String(errorDetail||'').slice(0,500),
    metrics,updated_at:now.toISOString()
  });
  const rows=await dbRows('command_ops_kernel_state?user_id=eq.'+encodeURIComponent(userId)+'&select=*');
  const prev=rows[0]||{},failures=success?0:(n(prev.consecutive_failures)+1);
  const dead=n(metrics?.recovery?.open_dead_letters);
  let health='HEALTHY';
  if(dead>0)health='DEGRADED';
  else if(!success&&failures>=Math.max(1,n(policy?.fail_closed_after_failures)||3))health='FAIL_CLOSED';
  else if(!success&&failures>=Math.max(1,n(policy?.degraded_after_failures)||2))health='DEGRADED';
  const nextRetry=success?metrics?.recovery?.next_retry_at||null:isoPlusSeconds(Math.min(3600,60*Math.pow(2,Math.max(0,failures-1))));
  return await upsertState(userId,{
    health_state:health,current_run_id:null,last_heartbeat_at:now.toISOString(),
    last_success_at:success?now.toISOString():prev.last_success_at||null,
    last_failure_at:success?prev.last_failure_at||null:now.toISOString(),
    consecutive_failures:failures,next_retry_at:nextRetry,dead_letter_count:dead,
    last_error_stage:success?null:errorStage||'KERNEL',last_error_detail:success?null:String(errorDetail||'').slice(0,500)
  });
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='GET'&&req.method!=='POST')return Response.json({ok:false,error:'method_not_allowed'},{status:405});
  if(!(await authorized(req)))return Response.json({ok:false,error:'unauthorized_private_runtime'},{status:401});
  if(!SERVICE_ROLE)return Response.json({ok:false,state:'FAIL_CLOSED',error:'service_role_unavailable'},{status:503});
  const trigger=(req.headers.get('x-tfa-trigger')||'RECOVERY').toUpperCase();
  const triggerSource=['VERCEL_CRON','MANUAL_PROBE','RECOVERY'].includes(trigger)?trigger:'RECOVERY';
  let stage='LOAD_OWNERS';
  try{
    const owners=await dbRows('owner_users?active=eq.true&select=user_id');
    if(!owners.length)throw new Error('no_active_owner');
    const runs:any[]=[];
    for(const owner of owners){
      const userId=owner.user_id;
      stage='POLICY';
      const policy=await ensurePolicy(userId);
      stage='LOCK';
      const run=await beginRun(userId,policy,triggerSource);
      if(!run){runs.push({status:'SKIPPED_OVERLAP'});continue}
      await upsertState(userId,{health_state:'HEALTHY',current_run_id:run.id,last_heartbeat_at:new Date().toISOString()});
      try{
        stage='LEASE_RECOVERY';
        const recovery=await recoverDispatches(userId,policy);
        let downstream:any=null,mode='EXECUTE';
        if(recovery.open_dead_letters>0){mode='DEAD_LETTER_HOLD'}
        else if(recovery.recovered>0&&recovery.next_retry_at&&new Date(recovery.next_retry_at).getTime()>Date.now()){mode='RETRY_BACKOFF'}
        else{
          stage='V179_EXECUTIVE_CYCLE';
          downstream=await invokeV179();
        }
        stage='FINISH';
        const metrics={mode,recovery,downstream:{ok:downstream?.ok??null,version:downstream?.version||null,owners_processed:downstream?.owners_processed||0}};
        const state=await finishRun(userId,run,policy,true,metrics);
        runs.push({status:'SUCCEEDED',run_id:run.id,mode,recovery,health_state:state?.health_state||'UNKNOWN'});
      }catch(error){
        const detail=String(error).slice(0,500);
        await finishRun(userId,run,policy,false,{mode:'FAILED',recovery:{open_dead_letters:0}},stage,detail).catch(()=>null);
        runs.push({status:'FAILED',run_id:run.id,stage,error:detail});
      }
    }
    const failed=runs.some(x=>x.status==='FAILED');
    return Response.json({
      ok:!failed,version:'v180-continuous-operations-kernel-v1',generated_at:new Date().toISOString(),
      owners_processed:owners.length,runs,
      governance:{internal_execution_only:true,external_execution:false,action_permitted:'WAIT',capital_permission:'0R',funds_moved:false,trades_sent:false,human_approval_bypassed:false}
    },{status:failed?503:200,headers:{'Cache-Control':'no-store','X-TFA-Runtime':'PRIVATE_BRAIN','X-TFA-Engine':'V180'}});
  }catch(error){
    console.error('V180_CONTINUOUS_KERNEL_ERROR',stage,String(error).slice(0,400));
    return Response.json({ok:false,version:'v180-continuous-operations-kernel-v1',state:'FAIL_CLOSED',stage,error:'continuous_kernel_unavailable',detail:String(error).slice(0,220),governance:{action_permitted:'WAIT',capital_permission:'0R',funds_moved:false,trades_sent:false}},{status:503,headers:{'Cache-Control':'no-store','X-TFA-Engine':'V180'}});
  }
});
