import {verifySealWithHedge} from './v245-seal-hedge.mjs';
import postgres from "npm:postgres@3.4.7";
const AUTHZ='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v115-oidc-probe';
const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'https://mpcelmjiycjpdyyflisn.supabase.co';
const SERVICE_ROLE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const DB_URL=Deno.env.get('SUPABASE_DB_URL')||'';
const V179=SUPABASE_URL+'/functions/v1/runtime-v179-resource-governor';
// Bound PostgREST latency without disabling the security seal or changing database state.
const REST_DEADLINE_MS=25000;
const SEAL_DEADLINE_MS=8000; // V218: bounded REST fallback; 9s SQL pooler + 8s REST max.

function eq(a:string,b:string){if(!a||!b||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
async function authorized(req:Request){
  const auth=req.headers.get('authorization')||'',token=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';
  if(!token)return false;if(SERVICE_ROLE&&eq(token,SERVICE_ROLE))return true;
  try{const r=await fetch(AUTHZ,{headers:{Authorization:auth,Accept:'application/json'},signal:AbortSignal.timeout(5000)});const b=await r.json().catch(()=>null);return r.ok&&b?.ok===true&&b?.state==='VERCEL_WORKLOAD_VERIFIED'}catch{return false}
}
function headers(){return{apikey:SERVICE_ROLE,Authorization:`Bearer ${SERVICE_ROLE}`,Accept:'application/json','Content-Type':'application/json'}}
async function dbRows(path:string){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:headers(),signal:AbortSignal.timeout(REST_DEADLINE_MS)});
  const b=await r.json().catch(()=>[]);if(!r.ok)throw new Error(`db_${r.status}_${path.split('?')[0]}`);return Array.isArray(b)?b:[];
}
async function upsert(table:string,conflict:string,row:any){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`,{
    method:'POST',headers:{...headers(),Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(row),signal:AbortSignal.timeout(REST_DEADLINE_MS)
  });
  const b=await r.json().catch(()=>[]);if(!r.ok)throw new Error(`upsert_${table}_${r.status}`);return Array.isArray(b)?b[0]||null:b;
}
async function rpc(name:string,body:any,timeout=REST_DEADLINE_MS){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:headers(),body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
  const b=await r.json().catch(()=>null);if(!r.ok)throw new Error(`rpc_${name}_${r.status}_${b?.message||''}`);
  return Array.isArray(b)?b[0]||null:b;
}
// Verify the SAME database seal using a single existing private SQL pooler lane.
// If the pooler is unavailable, retain the original mandatory PostgREST check.
// Neither lane may assert sealed without the database function returning sealed=true.
function sealPoolerUrl(){
  const direct=new URL(DB_URL);
  const pooler=new URL('postgres://aws-1-eu-west-1.pooler.supabase.com:6543/postgres');
  pooler.username='postgres.mpcelmjiycjpdyyflisn';
  pooler.password=decodeURIComponent(direct.password);
  pooler.searchParams.set('sslmode','require');
  return pooler.toString();
}
async function verifySealViaPooler(){
  if(!DB_URL)throw new Error('seal_pooler_not_configured');
  const client=postgres(sealPoolerUrl(),{
    max:1,prepare:false,fetch_types:false,connect_timeout:4,idle_timeout:1,max_lifetime:15
  });
  let timer:number|undefined;
  try{
    const rows:any=await Promise.race([
      client`select public.command_kernel_seal_status() as seal`,
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('seal_pooler_deadline')),9000)})
    ]);
    const seal=rows?.[0]?.seal;
    if(!seal?.sealed)throw new Error('v180_kernel_security_seal_missing');
    return {...seal,transport:'SQL_POOLER_VERIFIED'};
  }finally{
    if(timer!==undefined)clearTimeout(timer);
    await client.end({timeout:1}).catch(()=>null);
  }
}
// Operational classifications only. Never put raw database errors, URLs,
// credential strings or provider payloads into application event logs.
function safePoolerFailureClass(error:unknown){
  const msg=error instanceof Error?error.name+' '+error.message:'';
  if(/seal_pooler_deadline/.test(msg))return 'POOLER_QUERY_DEADLINE';
  if(/authenticat|08006/i.test(msg))return 'POOLER_AUTH_TIMEOUT_OR_REJECTED';
  if(/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|EHOSTUNREACH/i.test(msg))return 'POOLER_NETWORK_UNAVAILABLE';
  if(/timeout|ETIMEDOUT/i.test(msg))return 'POOLER_CONNECT_TIMEOUT';
  return 'POOLER_UNAVAILABLE';
}
async function requireKernelSeal(){
  return await verifySealWithHedge({
    pooler:verifySealViaPooler,
    rest:async()=>{
      const seal:any=await rpc('command_kernel_seal_status',{},SEAL_DEADLINE_MS);
      if(!seal?.sealed)throw new Error('v180_kernel_security_seal_missing');
      return {...seal,transport:'POSTGREST_VERIFIED'};
    },
    hedgeDelayMs:2000
  });
}
// Read only the same active owners as V180 REST. The SQL credentials stay private.
// If transport fails, the original PostgREST owner lookup remains mandatory.
async function loadOwners(){
  if(DB_URL){
    const client=postgres(sealPoolerUrl(),{
      max:1,prepare:false,fetch_types:false,connect_timeout:4,idle_timeout:1,max_lifetime:15
    });
    let timer:number|undefined;
    try{
      const owners:any=await Promise.race([
        client`select user_id from public.owner_users where active=true limit 20`,
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('owner_pooler_deadline')),9000)})
      ]);
      if(!Array.isArray(owners))throw new Error('owner_pooler_invalid_response');
      return owners;
    }catch(error){
      console.warn('V209_OWNER_POOLER_FALLBACK',{reason:error instanceof Error?error.name:'pooler_unavailable'});
    }finally{
      if(timer!==undefined)clearTimeout(timer);
      await client.end({timeout:1}).catch(()=>null);
    }
  }
  return await dbRows('owner_users?active=eq.true&select=user_id&limit=20');
}

function bucket(){const ms=300000,t=Math.floor(Date.now()/ms)*ms;return new Date(t).toISOString()}
function n(v:any){const x=Number(v);return Number.isFinite(x)?x:0}
// Existing policy read is data-only. No RLS policies, DB rows or permissions are mutated.
// A genuine missing policy continues through V180's original authenticated REST upsert.
function validPolicy(policy:any,userId:string){
  return policy?.user_id===userId&&policy?.policy_key==='DEFAULT_V180'
    &&Number(policy.heartbeat_minutes)===5
    &&Number(policy.stale_run_minutes)===3
    &&Number(policy.max_dispatch_attempts)===3
    &&Number(policy.base_backoff_seconds)===300
    &&Number(policy.degraded_after_failures)===2
    &&Number(policy.fail_closed_after_failures)===3;
}
async function readExistingPolicy(userId:string){
  if(!DB_URL)throw new Error('policy_pooler_not_configured');
  const client=postgres(sealPoolerUrl(),{
    max:1,prepare:false,fetch_types:false,connect_timeout:4,idle_timeout:1,max_lifetime:15
  });
  let timer:number|undefined;
  try{
    const rows:any=await Promise.race([
      client`select user_id,policy_key,heartbeat_minutes,stale_run_minutes,max_dispatch_attempts,
        base_backoff_seconds,degraded_after_failures,fail_closed_after_failures
        from public.command_ops_kernel_policies
        where user_id=${userId} and policy_key='DEFAULT_V180' limit 1`,
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('policy_pooler_deadline')),9000)})
    ]);
    if(!Array.isArray(rows))throw new Error('policy_pooler_invalid_response');
    if(rows.length===0)return null;
    const policy=rows[0];
    if(!validPolicy(policy,userId))throw new Error('v215_policy_integrity_failed');
    return policy;
  }finally{
    if(timer!==undefined)clearTimeout(timer);
    await client.end({timeout:1}).catch(()=>null);
  }
}
async function ensurePolicy(userId:string){
  if(DB_URL){
    try{
      const policy=await readExistingPolicy(userId);
      if(policy)return policy;
    }catch(error){
      // A malformed or mismatched policy is a security failure, not a transport
      // outage; never replace it silently with permissive defaults.
      if(String(error).includes('v215_policy_integrity_failed'))throw error;
      console.warn('V215_POLICY_POOLER_FALLBACK',{reason:error instanceof Error?error.name:'pooler_unavailable'});
    }
  }
  return await upsert('command_ops_kernel_policies','user_id,policy_key',{
    user_id:userId,policy_key:'DEFAULT_V180',heartbeat_minutes:5,stale_run_minutes:3,
    max_dispatch_attempts:3,base_backoff_seconds:300,degraded_after_failures:2,fail_closed_after_failures:3,
    notes:'Continuous internal operations only. Retry budgets are bounded; unresolved dead letters hold autonomous dispatch.',
    updated_at:new Date().toISOString()
  });
}
async function invokeV179(){
  const r=await fetch(V179,{
    method:'GET',
    headers:{Authorization:`Bearer ${SERVICE_ROLE}`,Accept:'application/json','User-Agent':'TFA-V180-CONTINUOUS-KERNEL/2.0'},
    signal:AbortSignal.timeout(65000)
  });
  const b=await r.json().catch(()=>null);
  if(!r.ok||!b?.ok)throw new Error(`v179_${r.status}_${b?.stage||b?.error||'unavailable'}`);
  return b;
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='GET'&&req.method!=='POST')return Response.json({ok:false,error:'method_not_allowed'},{status:405});
  if(!(await authorized(req)))return Response.json({ok:false,error:'unauthorized_private_runtime'},{status:401});
  if(!SERVICE_ROLE)return Response.json({ok:false,state:'FAIL_CLOSED',error:'service_role_unavailable'},{status:503});

  const trigger=(req.headers.get('x-tfa-trigger')||'RECOVERY').toUpperCase();
  const triggerSource=['VERCEL_CRON','MANUAL_PROBE','RECOVERY'].includes(trigger)?trigger:'RECOVERY';
  let stage='KERNEL_SEAL';

  try{
    const seal=await requireKernelSeal();
    stage='LOAD_OWNERS';
    const owners=await loadOwners();
    if(!owners.length)throw new Error('no_active_owner');

    const runs:any[]=[];
    for(const owner of owners){
      const userId=owner.user_id;
      stage='POLICY';
      const policy=await ensurePolicy(userId);

      stage='LOCK';
      const run:any=await rpc('command_kernel_begin_run',{
        p_user_id:userId,
        p_run_key:'KERNEL:'+bucket(),
        p_trigger_source:triggerSource,
        p_stale_run_minutes:Math.max(1,n(policy?.stale_run_minutes)||3)
      });
      if(!run?.id){runs.push({status:'SKIPPED_OVERLAP'});continue}

      try{
        stage='LEASE_RECOVERY';
        const recovery:any=await rpc('command_kernel_recover_dispatches',{
          p_user_id:userId,
          p_max_attempts:Math.max(1,n(policy?.max_dispatch_attempts)||3),
          p_base_backoff_seconds:Math.max(30,n(policy?.base_backoff_seconds)||300)
        });

        let downstream:any=null,mode='EXECUTE';
        if(n(recovery?.open_dead_letters)>0)mode='DEAD_LETTER_HOLD';
        else if(n(recovery?.recovered)>0&&recovery?.next_retry_at&&new Date(recovery.next_retry_at).getTime()>Date.now())mode='RETRY_BACKOFF';
        else{stage='V179_EXECUTIVE_CYCLE';downstream=await invokeV179()}

        stage='FINISH';
        const metrics={
          mode,recovery,
          downstream:{ok:downstream?.ok??null,version:downstream?.version||null,owners_processed:downstream?.owners_processed||0}
        };
        const state:any=await rpc('command_kernel_finish_run',{
          p_user_id:userId,p_run_id:run.id,p_success:true,p_error_stage:null,p_error_detail:null,p_metrics:metrics,
          p_degraded_after:Math.max(1,n(policy?.degraded_after_failures)||2),
          p_fail_closed_after:Math.max(1,n(policy?.fail_closed_after_failures)||3)
        });
        runs.push({status:'SUCCEEDED',run_id:run.id,mode,recovery,health_state:state?.health_state||'UNKNOWN'});
      }catch(error){
        const detail=String(error).slice(0,500);
        await rpc('command_kernel_finish_run',{
          p_user_id:userId,p_run_id:run.id,p_success:false,p_error_stage:stage,p_error_detail:detail,p_metrics:{mode:'FAILED'},
          p_degraded_after:Math.max(1,n(policy?.degraded_after_failures)||2),
          p_fail_closed_after:Math.max(1,n(policy?.fail_closed_after_failures)||3)
        }).catch(()=>null);
        runs.push({status:'FAILED',run_id:run.id,stage,error:detail});
      }
    }

    const failed=runs.some(x=>x.status==='FAILED');
    return Response.json({
      ok:!failed,
      version:'v180.9-hedged-verifiable-seal-v1',
      generated_at:new Date().toISOString(),
      owners_processed:owners.length,
      runs,
      seal:{sealed:true,version:seal?.version||null,sealed_at:seal?.sealed_at||null,transport:seal?.transport||'UNVERIFIED'},
      governance:{internal_execution_only:true,external_execution:false,action_permitted:'WAIT',capital_permission:'0R',funds_moved:false,trades_sent:false,human_approval_bypassed:false}
    },{
      status:failed?503:200,
      headers:{'Cache-Control':'no-store','X-TFA-Runtime':'PRIVATE_BRAIN','X-TFA-Engine':'V180'}
    });
  }catch(error){
    console.error('V180_CONTINUOUS_KERNEL_ERROR',stage,String(error).slice(0,400));
    return Response.json({
      ok:false,version:'v180.9-hedged-verifiable-seal-v1',state:'FAIL_CLOSED',stage,
      error:'continuous_kernel_unavailable',detail:String(error).slice(0,220),
      governance:{action_permitted:'WAIT',capital_permission:'0R',funds_moved:false,trades_sent:false}
    },{
      status:503,headers:{'Cache-Control':'no-store','X-TFA-Engine':'V180'}
    });
  }
});
