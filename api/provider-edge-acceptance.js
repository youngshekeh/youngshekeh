import {TRIAGE_URL,ACCEPTANCE_PATHS,assessProviderEdgeAdmission,
 safeEdgeSummary} from '../src/v283-provider-edge-admission.mjs';

const BASE='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/';
const CHECKS=Object.freeze([
 {name:'auth_runtime',slug:ACCEPTANCE_PATHS[0],
  validate:body=>body?.ok===true&&body.state==='PASSWORD_AUTH_READY'},
 {name:'final_readiness',slug:ACCEPTANCE_PATHS[1],
  validate:body=>body?.ok===true&&Array.isArray(body.hard_blockers)&&body.hard_blockers.length===0},
 {name:'billing_acceptance',slug:ACCEPTANCE_PATHS[2],
  validate:body=>body?.ok===true&&body.ready_for_checkout===true&&body.live_flow_verified===true}
]);
const TTL_MS=60_000;
let cached=null,cachedAt=0,inflight=null;
const safeStatus=x=>Number.isInteger(x)&&x>=100&&x<=599?x:0;
const fetchJSON=async(fetcher,url,deadline)=>{
 const begin=Date.now();
 try{
  const response=await fetcher(url,{method:'GET',redirect:'error',
   credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',
   headers:{Accept:'application/json','User-Agent':'TFA-V283-PUBLIC-EDGE-OBSERVATION/1.0'},
   signal:AbortSignal.timeout(deadline)});
  const body=response.ok?await response.json().catch(()=>null):null;
  return{ok:response.ok&&body!==null&&typeof body==='object'
   &&!Array.isArray(body),status:safeStatus(response.status),
   latency_ms:Math.min(60_000,Date.now()-begin),body};
 }catch{return{ok:false,status:0,latency_ms:Math.min(60_000,Date.now()-begin),body:null}}
};
const notReady=(reason,admission)=>{
 const now=new Date().toISOString();
 return{ok:false,version:'v283-incident-aware-edge-acceptance-v1',
  checked_at:now,state:'EXTERNAL_EDGE_PATH_DEFERRED',
  scope:'READ_ONLY_NO_PROVIDER_PROBES',
  admission,summary:safeEdgeSummary([],6),results:[],
  reason,private_calls_skipped:6,commercial_launch_certified:false,
  governance:{action_permitted:'WAIT',capital_permission:'0R',
   new_charges_enabled:false,live_order_submission_enabled:false}};
};
export async function collectProviderEdgeAcceptance({fetcher=fetch,now=Date.now}={}){
 if(typeof fetcher!=='function')throw new TypeError('fetcher_required');
 // Cheap triage is externally cached and read-only. Crucially, never run the
 // six Supabase probes when Auth or PostgreSQL is under a declared incident.
 const triage=await fetchJSON(fetcher,TRIAGE_URL,6500);
 const admission=assessProviderEdgeAdmission(triage,now());
 if(!admission.admitted)return notReady(admission.reason,admission);
 const results=[];
 for(let attempt=1;attempt<=2;attempt++){
  for(const check of CHECKS){
   const url=BASE+check.slug; // hard-coded slugs only, never caller-supplied.
   const r=await fetchJSON(fetcher,url,7500);
   const semantic=Boolean(r.ok&&check.validate(r.body));
   results.push({name:check.name,attempt,transport_ok:r.ok,
    semantic_ok:semantic,status:r.status,latency_ms:r.latency_ms,
    // Deliberately never return raw provider payload or arbitrary error text.
    state:semantic?'SEMANTIC_READY':'UNVERIFIED'});
   if(!r.ok){
    // On degraded transport, avoid up to five additional DB-backed calls.
    const summary=safeEdgeSummary(results,6-results.length);
    return {ok:false,version:'v283-incident-aware-edge-acceptance-v1',
     checked_at:new Date().toISOString(),state:'EXTERNAL_EDGE_PATH_DEGRADED',
     scope:'READ_ONLY_FAIL_FAST',admission,summary,results,
     private_calls_skipped:6-results.length,
     commercial_launch_certified:false,
     governance:{action_permitted:'WAIT',capital_permission:'0R',
      new_charges_enabled:false,live_order_submission_enabled:false}};
   }
  }
 }
 const summary=safeEdgeSummary(results,0);
 const verified=results.length===6&&summary.transport_passed===6
   &&summary.rate_limited===0&&summary.server_errors===0;
 return{ok:verified,version:'v283-incident-aware-edge-acceptance-v1',
  checked_at:new Date().toISOString(),
  state:verified?'EXTERNAL_EDGE_PATH_VERIFIED':'EXTERNAL_EDGE_PATH_DEGRADED',
  scope:'READ_ONLY_LOW_LOAD_ACCEPTANCE',admission,summary,results,
  private_calls_skipped:0,commercial_launch_certified:false,
  governance:{action_permitted:'WAIT',capital_permission:'0R',
   new_charges_enabled:false,live_order_submission_enabled:false},
  truth:{externally_observed_from_vercel:true,guarantees_future_capacity:false,
   load_test:false,creates_charges:false,mutates_data:false,
   private_kernel_verified:false,broker_quote_certified:false}};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-TFA-Probe-Origin','VERCEL_EXTERNAL_TO_SUPABASE');
 res.setHeader('X-TFA-Edge-Version','V283-INCIDENT_ADMISSION');
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');
  return res.status(405).json({ok:false,error:'method_not_allowed',
   governance:{action_permitted:'WAIT',capital_permission:'0R'}});
 }
 try{
  const now=Date.now();
  if(cached&&now-cachedAt<TTL_MS)return res.status(cached.ok?200:503).json(cached);
  if(!inflight)inflight=collectProviderEdgeAcceptance().then(x=>{
   cached=x;cachedAt=Date.now();return x;
  }).finally(()=>{inflight=null});
  const result=await inflight;
  if(!result.ok)res.setHeader('Retry-After','60');
  return res.status(result.ok?200:503).json(result);
 }catch{
  res.setHeader('Retry-After','60');
  return res.status(503).json(notReady('DIAGNOSTICS_UNAVAILABLE',{
   admitted:false,reason:'DIAGNOSTICS_UNAVAILABLE',capital_permission:'0R'}));
 }
}
