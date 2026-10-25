// V299 independent private DB evidence, not a resumed mission engine.
// Signed Vercel workload only; exactly one read-only PostgREST query.
const ROOT='https://mpcelmjiycjpdyyflisn.supabase.co';
const VERIFY=ROOT+'/functions/v1/runtime-v115-oidc-probe';
const TABLE=ROOT+'/rest/v1/autonomous_machine_state?id=eq.1&select=updated_at,mode,system_score,edge_runtime_state,database_state,smoke_state,final_action,final_permission&limit=1';
const HEADERS={'Cache-Control':'no-store','X-TFA-Engine':'V299-SIGNED-DB-EVIDENCE'};
const HOLD={capital_permission:'0R',action_permitted:'WAIT',live_order_submission_enabled:false,
  automatic_execution:false,commercial_launch_certified:false,mission_restored:false,
  engine_registry_certified:false,market_data_redistribution_approved:false};
function respond(status,state,extra={}){
 return Response.json({ok:status===200,usable:false,version:'v299-signed-db-evidence-v1',
  state,...HOLD,...extra},{status,headers:HEADERS});
}
async function getJson(url,init){
 try{const r=await fetch(url,init);return {status:r.status,body:await r.json().catch(()=>null)}}
 catch{return {status:0,body:null}}
}
Deno.serve(async(req:Request)=>{
 if(req.method!=='GET')return respond(405,'METHOD_NOT_ALLOWED');
 const h=req.headers.get('authorization')||'';
 const token=h.startsWith('Bearer ')?h.slice(7).trim():'';
 if(token.length<50)return respond(401,'IDENTITY_MISSING');
 const auth=await getJson(VERIFY,{method:'GET',
  headers:{Authorization:h,Accept:'application/json'},redirect:'error',
  signal:AbortSignal.timeout(3500)});
 const a=auth.body;
 const verified=auth.status===200&&a?.ok===true&&a?.state==='VERCEL_WORKLOAD_VERIFIED'
  &&a?.owner==='the-father'&&a?.project==='the-father-analytics'
  &&a?.environment==='production'&&a?.governance?.capital_permission==='0R'
  &&a?.governance?.authentication_only===true;
 if(!verified)return respond(403,'PRIVATE_IDENTITY_UNVERIFIED');
 const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 const url=Deno.env.get('SUPABASE_URL')||ROOT;
 if(secret.length<30||url!==ROOT)return respond(503,'DB_READER_NOT_CONFIGURED',
  {workload_identity_verified:true});
 const record=await getJson(TABLE,{method:'GET',
  headers:{apikey:secret,Authorization:'Bearer '+secret,Accept:'application/json'},
  redirect:'error',signal:AbortSignal.timeout(3500)});
 const data=Array.isArray(record.body)&&record.body.length===1?record.body[0]:null;
 const stamp=Date.parse(String(data?.updated_at||'')),now=Date.now(),age=now-stamp;
 if(record.status!==200||!data||!Number.isFinite(age)||age<0||age>600000
  ||data.database_state!=='ONLINE'||data.final_action!=='WAIT'
  ||data.final_permission!=='0R')
  return respond(503,'DB_SNAPSHOT_UNVERIFIED',{workload_identity_verified:true});
 return respond(200,'SIGNED_DATABASE_EVIDENCE_OBSERVED',{
  workload_identity_verified:true,database_snapshot_observed:true,
  snapshot_at:new Date(stamp).toISOString(),snapshot_age_seconds:Math.round(age/1000),
  machine_mode:String(data.mode||'UNKNOWN').slice(0,40),
  database_state:'ONLINE',
  edge_runtime_state:String(data.edge_runtime_state||'UNKNOWN').slice(0,60),
  smoke_state:String(data.smoke_state||'UNKNOWN').slice(0,40),
  system_score:Number.isInteger(data.system_score)&&data.system_score>=0&&data.system_score<=100
   ?data.system_score:null
 });
});
