import {
 RECOVERY_ORIGIN,RECOVERY_PATHS,
 assessRecoveryPreflight,assessRecoveryDiagnostics
} from '../src/runtime-recovery-guard.mjs';

// V282: bounded, stage-gated read-only diagnostics. NEVER trust HTTP Host,
// X-Forwarded-Host, forwarded protocol or arbitrary URL/query as fetch origin.
// Network requests go exclusively to the fixed, public same-site origin.
const CACHE_MS=60_000;
let cached=null,lastAt=0,pending=null;
const MAX_BODY_BYTES=96_000;
async function readPublic(name,path,ms,fetcher=fetch,now=Date.now){
 const start=now();
 try{
  const response=await fetcher(RECOVERY_ORIGIN+path,{
   method:'GET',redirect:'error',cache:'no-store',credentials:'omit',
   referrerPolicy:'no-referrer',
   headers:{Accept:'application/json','User-Agent':'TFA-V282-READONLY-RECOVERY/1.0'},
   signal:AbortSignal.timeout(ms)
  });
  // Limit the amount parsed from provider-facing response. No raw body or
  // request headers are returned, logged or forwarded to the public caller.
  const claimed=Number(response.headers?.get?.('content-length'));
  if(Number.isFinite(claimed)&&claimed>MAX_BODY_BYTES)
   return {name,ok:false,status:0,latency_ms:now()-start,body:null};
  let body=null;
  if(response.ok){
   const content=await response.text();
   if(content.length<=MAX_BODY_BYTES){
    try{const v=JSON.parse(content);if(v&&typeof v==='object'&&!Array.isArray(v))body=v}catch{}
   }
  }else await response.body?.cancel?.().catch(()=>{});
  return {name,ok:response.ok&&body!==null,status:response.status,
   latency_ms:now()-start,body};
 }catch{
  return {name,ok:false,status:0,latency_ms:now()-start,body:null};
 }
}
export async function collectRuntimeRecovery({fetcher=fetch,now=Date.now}={}){
 if(typeof fetcher!=='function')throw new TypeError('fetcher_required');
 // Stage A: cheap shared read-only public observations; no privileged calls.
 const requested=[RECOVERY_PATHS.triage,RECOVERY_PATHS.release];
 const [triage,release]=await Promise.all([
  readPublic('triage',RECOVERY_PATHS.triage,5500,fetcher,now),
  readPublic('release',RECOVERY_PATHS.release,5500,fetcher,now)
 ]);
 const preflight=assessRecoveryPreflight({triage,release},now());
 const data={preflight,release,requested};
 const report=()=>assessRecoveryDiagnostics(data,now());
 if(!preflight.admitted)return report();
 // Stage B: provider reachability. An outage never launches private QA.
 requested.push(RECOVERY_PATHS.quota,RECOVERY_PATHS.edge);
 const [quota,edge]=await Promise.all([
  readPublic('quota',RECOVERY_PATHS.quota,8500,fetcher,now),
  readPublic('edge',RECOVERY_PATHS.edge,10000,fetcher,now)
 ]);
 data.quota=quota;data.edge=edge;
 let current=report();
 if(!current.evidence.quota.clear||!current.evidence.edge.verified)return current;
 // Stage C: read-only canonical state only after both provider checks pass.
 requested.push(RECOVERY_PATHS.state);
 const state=await readPublic('state',RECOVERY_PATHS.state,12000,fetcher,now);
 data.state=state;current=report();
 if(!current.evidence.state.healthy)return current;
 // Stage D: expensive private QA only if state and smoke are already healthy.
 requested.push(RECOVERY_PATHS.qa);
 data.qa=await readPublic('qa',RECOVERY_PATHS.qa,18000,fetcher,now);
 return report();
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-TFA-Recovery','V282-ANONYMOUS-STAGED-HOLD');
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');
  return res.status(405).json({ok:false,error:'method_not_allowed',
   governance:{action_permitted:'WAIT',capital_permission:'0R',commerce_permitted:false}});
 }
 try{
  const now=Date.now();
  if(cached&&now-lastAt<CACHE_MS){
   return res.status(200).json({...cached,cache:{reused:true,age_seconds:Math.floor((now-lastAt)/1000)}});
  }
  if(!pending)pending=collectRuntimeRecovery().then(v=>{
   cached=v;lastAt=Date.now();return v;
  }).finally(()=>{pending=null;});
  const data=await pending;
  return res.status(200).json({...data,cache:{reused:false,age_seconds:0}});
 }catch{
  return res.status(503).json({ok:false,state:'DIAGNOSTIC_UNAVAILABLE',
   version:'v282-secure-recovery-admission-v1',
   governance:{action_permitted:'WAIT',capital_permission:'0R',
    live_order_routing:false,commerce_permitted:false},
   database_write_count:0,cron_changes:0});
 }
}
