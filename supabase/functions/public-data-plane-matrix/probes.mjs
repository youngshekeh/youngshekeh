import {readObservation,incidentObservation} from '../_shared/public-launch-observation.mjs';
export const TARGETS=Object.freeze([
 {key:'reports',table:'reports',select:'id'},
 {key:'gold_snapshots',table:'gold_live_snapshots',select:'captured_at'},
 {key:'market_snapshots',table:'live_markets_snapshots',select:'captured_at'},
 {key:'agent_runs',table:'agent_runs',select:'id'},
 {key:'profiles',table:'profiles',select:'id'}
].map(Object.freeze));
export async function probeRelation(base,key,target,fetchImpl=globalThis.fetch,timeoutMs=2500){
 if(!TARGETS.includes(target)||new URL(base).origin!=='https://mpcelmjiycjpdyyflisn.supabase.co'
  ||!key||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>2500)throw new TypeError('data_plane_probe_config_invalid');
 const start=Date.now(),signal=AbortSignal.timeout(timeoutMs);let listener;
 const aborted=new Promise((_,reject)=>{
  listener=()=>reject(new Error('data_plane_deadline'));signal.addEventListener('abort',listener,{once:true});
 });
 try{
  const observed=(async()=>{
   const url=new URL(`${base}/rest/v1/${target.table}`);
   url.searchParams.set('select',target.select);url.searchParams.set('limit','1');
   const response=await fetchImpl(url,{method:'GET',redirect:'error',cache:'no-store',
    headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'application/json'},signal});
   const body=await response.json().catch(()=>null),ok=response.ok&&Array.isArray(body);
   return {key:target.key,table:target.table,ok,http_status:response.status,latency_ms:Date.now()-start,
    row_sample_count:Array.isArray(body)?body.length:null,error:ok?null:response.ok?'invalid_json_rows':'http_error'};
  })();
  return await Promise.race([observed,aborted]);
 }catch{
  return {key:target.key,table:target.table,ok:false,http_status:null,latency_ms:Date.now()-start,
   row_sample_count:null,error:'timeout_or_transport'};
 }finally{signal.removeEventListener('abort',listener);}
}
export async function dataPlaneIncident(fetchImpl=globalThis.fetch,now=Date.now){
 const record=await readObservation('public-v69-database-incident-shield',{fetchImpl,now});
 const incident=incidentObservation(record,now());
 return {ok:incident.verified,active:incident.active!==false,
  code:incident.verified?incident.code:'INCIDENT_SHIELD_UNAVAILABLE',latency_ms:record.latency_ms};
}
