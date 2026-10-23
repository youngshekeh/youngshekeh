const BASE='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/';
export const READ_BUDGETS=Object.freeze({
 'public-auth-runtime-check':15000,
 'public-access-readiness':15000,
 'public-v66-runtime-observatory':22000,
 'public-billing-acceptance':15000,
 // The shield's own PostgREST probe has a 2500ms limit.
 'public-v69-database-incident-shield':6500,
 'public-v50-production-integrity':18000,
 'public-app-config':18000,
 'public-v65-model-evidence-fabric':8000
});
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type',
 'Access-Control-Allow-Methods':'GET, OPTIONS'};
export function sourceAge(record,now){
 const value=record?.body?.generated_at;
 if(typeof value!=='string')return null;
 const at=Date.parse(value);
 return Number.isFinite(at)?(now-at)/1000:null;
}
export function sourceCurrent(record,now,maxAgeSeconds=600){
 const age=sourceAge(record,now),body=record?.body;
 return record?.ok===true&&record.http_status>=200&&record.http_status<300
  &&body!==null&&typeof body==='object'&&!Array.isArray(body)&&body.ok===true
  &&age!==null&&age>=-60&&age<=maxAgeSeconds;
}
export function incidentObservation(record,now){
 const body=record?.body??{};
 const current=sourceCurrent(record,now,120)
  &&String(body.version??'').startsWith('v69-database-incident-shield-');
 const clear=current&&body.incident_active===false&&body.current_probe?.ok===true;
 const active=current&&body.incident_active===true;
 return {active:active?true:clear?false:null,code:active?(body.incident_code||'ACTIVE'):null,
  state:active?(body.incident_code||'ACTIVE'):clear?'CLEAR':'UNVERIFIED',verified:active||clear};
}
export function sourceEvidence(records,now,limits={}){
 return Object.fromEntries(Object.entries(records).map(([path,record])=>{
 const maxAge=limits[path]??(path==='public-v69-database-incident-shield'?120:600);
 return [path,{
  http_status:record?.http_status??0,latency_ms:record?.latency_ms??null,
  source_generated_at:record?.body?.generated_at??null,age_seconds:sourceAge(record,now),
  max_age_seconds:maxAge,valid_until:sourceCurrent(record,now,maxAge)
   ?new Date(Date.parse(record.body.generated_at)+maxAge*1000).toISOString():null,
  version:typeof record?.body?.version==='string'?record.body.version:null,
  transport_ok:record?.ok===true
 }];}));
}
export function cacheLifetime(body,maximum){
 const generated=Date.parse(body.generated_at);
 const remaining=Object.values(body.source_evidence??{}).map(row=>Date.parse(row.valid_until)-generated)
  .filter(Number.isFinite);
 return Math.max(0,Math.min(maximum,...remaining));
}
export async function readObservation(path,{fetchImpl=globalThis.fetch,now=Date.now,
 timeoutMs=READ_BUDGETS[path]}={}){
 if(!Object.hasOwn(READ_BUDGETS,path)||!Number.isInteger(timeoutMs)||timeoutMs<1
  ||timeoutMs>READ_BUDGETS[path])throw new TypeError('public_observation_route_or_budget_invalid');
 const began=now(),signal=AbortSignal.timeout(timeoutMs);let listener;
 const aborted=new Promise((_,reject)=>{
  listener=()=>reject(new Error('dependency_deadline'));signal.addEventListener('abort',listener,{once:true});
 });
 try{
  const observed=(async()=>{
   const response=await fetchImpl(BASE+path,{method:'GET',headers:{Accept:'application/json'},
    credentials:'omit',redirect:'error',cache:'no-store',signal});
   const body=await response.json().catch(()=>null);
   const valid=body!==null&&typeof body==='object'&&!Array.isArray(body)&&body.ok===true;
   return {ok:response.ok&&valid,http_status:response.status,body:valid?body:null,
    error:valid?null:'dependency_json_invalid',
    cache_header:response.headers.get('cache-control'),tfa_cache:response.headers.get('x-tfa-cache')};
  })();
  return {...await Promise.race([observed,aborted]),latency_ms:Math.max(0,now()-began)};
 }catch{
  return {ok:false,http_status:0,latency_ms:Math.max(0,now()-began),body:null,
   error:'dependency_unavailable',cache_header:null,tfa_cache:null};
 }finally{signal.removeEventListener('abort',listener);}
}
export function createObservationHandler({paths,assemble,ttlFor,allowHead=false,
 fetchImpl=globalThis.fetch,now=Date.now}={}){
 if(!Array.isArray(paths)||!paths.length||paths.some(path=>!Object.hasOwn(READ_BUDGETS,path))
  ||typeof assemble!=='function'||typeof ttlFor!=='function')throw new TypeError('observation_handler_config_invalid');
 let cache=null,cachedAt=0,inflight=null;
 async function current(){
  if(cache&&now()-cachedAt<ttlFor(cache))return cache;
  if(inflight)return inflight;
  inflight=(async()=>{
   const rows=await Promise.all(paths.map(async path=>[path,await readObservation(path,{fetchImpl,now})]));
   const observedAt=now(),result=assemble(Object.fromEntries(rows),observedAt);
   cache=result;cachedAt=observedAt;return result;
  })().finally(()=>{inflight=null});
  return inflight;
 }
 const allow=allowHead?'GET, HEAD, OPTIONS':'GET, OPTIONS';
 const headers={...CORS,'Access-Control-Allow-Methods':allow,'Cache-Control':'no-store',
  'CDN-Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'};
 return async req=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='GET'&&!(allowHead&&req.method==='HEAD'))
   return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers:{...headers,Allow:allow}});
  try{
   const value=await current();
   return new Response(req.method==='HEAD'?null:JSON.stringify(value),{status:200,headers});
  }catch{
   return new Response(req.method==='HEAD'?null:JSON.stringify({ok:false,error:'readiness_unavailable',
    generated_at:new Date(now()).toISOString(),governance:{action_permitted:'WAIT',capital_permission:'0R'}}),
   {status:503,headers});
  }
 };
}
