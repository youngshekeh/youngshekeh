import {assessRecoveryTriage} from '../src/read-only-recovery-triage.mjs';
const PROJECT='https://mpcelmjiycjpdyyflisn.supabase.co';
const PUBLIC_KEY='sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';
// V265: keep cheap Auth/REST probes bounded; allow incident synthesis to finish
// under current provider pressure without asserting recovery from a timeout.
const BUDGET_MS=4700,READINESS_BUDGET_MS=9000,CACHE_MS=90000;
export const recoveryProbeDeadline=(path)=>path==='/functions/v1/public-final-readiness'?READINESS_BUDGET_MS:BUDGET_MS;
let cache=null,lastAt=0,pending=null;
async function getStatus(path,{accept='application/json',readiness=false}={}){
 try{
  const response=await fetch(PROJECT+path,{
   method:'GET',redirect:'error',cache:'no-store',
   headers:{apikey:PUBLIC_KEY,Accept:accept,
    'User-Agent':'TFA-V258-READONLY-OPERATOR-TRIAGE/1.0'},
   signal:AbortSignal.timeout(recoveryProbeDeadline(path))
  });
  let data=null;
  if(readiness&&response.ok)data=await response.json().catch(()=>null);
  else await response.body?.cancel?.().catch(()=>{});
  return {transport:'HTTP_RESPONSE',status:response.status,data};
 }catch(error){
  return {transport:error?.name==='TimeoutError'||error?.name==='AbortError'
   ?'TIMEOUT':'ERROR',status:0,data:null};
 }
}
export async function collectRecoveryTriage({probe=getStatus,now=Date.now}={}){
 const safely=async(path,opts)=>{try{return await probe(path,opts)}catch{return{
  transport:'ERROR',status:0,data:null
 }}};
 const [auth,rest,readiness]=await Promise.all([
  safely('/auth/v1/health'),
  safely('/rest/v1/',{accept:'application/openapi+json'}),
  safely('/functions/v1/public-final-readiness',{readiness:true})
 ]);
 return assessRecoveryTriage({auth,rest,readiness},now());
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-TFA-Diagnostic','READONLY-NO-CREDENTIALS-NO-EXECUTION');
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');
  return res.status(405).json({ok:false,error:'method_not_allowed',
   governance:{action_permitted:'WAIT',capital_permission:'0R',
    live_order_submission_enabled:false}});
 }
 try{
  if(!cache||Date.now()-lastAt>=CACHE_MS){
   if(!pending)pending=collectRecoveryTriage().then(v=>{
    cache=v;lastAt=Date.now();return v;
   }).finally(()=>{pending=null});
   await pending;
  }
  return res.status(200).json(cache);
 }catch{
  return res.status(503).json({ok:false,state:'READONLY_DIAGNOSTIC_UNAVAILABLE',
   generated_at:new Date().toISOString(),
   governance:{action_permitted:'WAIT',capital_permission:'0R',
    live_order_submission_enabled:false},
   private_actions_executed:0,database_jobs_modified:0});
 }
}
