import {preflightV285QaAdmission} from './v285-qa-upstream-admission.mjs';
const DEST='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v299-mission-evidence';
const LOCK=Object.freeze({mission_restored:false,engine_registry_certified:false,
 market_data_redistribution_approved:false,commercial_launch_certified:false,
 customer_login_certified:false,live_order_submission_enabled:false,
 capital_permission:'0R',action_permitted:'WAIT'});
const reject=reason=>Object.freeze({...LOCK,ok:false,usable:false,
  version:'v299-signed-db-evidence-gateway-v1',state:reason});
export function validateDbEvidence({status,body,now=Date.now()}={}){
 const t=Date.parse(String(body?.snapshot_at||'')),age=now-t;
 if(status!==200||body?.ok!==true||body?.usable!==false||
  body?.version!=='v299-signed-db-evidence-v1'||
  body?.state!=='SIGNED_DATABASE_EVIDENCE_OBSERVED'||
  body?.workload_identity_verified!==true||
  body?.database_snapshot_observed!==true||
  body?.database_state!=='ONLINE'||body?.capital_permission!=='0R'||
  body?.action_permitted!=='WAIT'||body?.mission_restored!==false||
  body?.engine_registry_certified!==false||
  body?.live_order_submission_enabled!==false||
  body?.commercial_launch_certified!==false||
  !Number.isFinite(age)||age<0||age>600000)
   return reject('SIGNED_DB_EVIDENCE_UNVERIFIED');
 return Object.freeze({...LOCK,ok:true,usable:false,
  version:'v299-signed-db-evidence-gateway-v1',
  state:'SIGNED_DB_SNAPSHOT_OBSERVED_NOT_MISSION_RESTORED',
  workload_identity_verified:true,database_snapshot_observed:true,
  snapshot_at:new Date(t).toISOString(),
  snapshot_age_seconds:Math.round(age/1000),
  database_state:'ONLINE',
  edge_runtime_state:String(body.edge_runtime_state||'UNKNOWN').slice(0,60),
  smoke_state:String(body.smoke_state||'UNKNOWN').slice(0,40),
  machine_mode:String(body.machine_mode||'UNKNOWN').slice(0,40),
  system_score:Number.isInteger(body.system_score)&&body.system_score>=0&&body.system_score<=100
   ?body.system_score:null});
}
export async function inspectSignedMissionDb({fetcher=fetch,getToken,now=Date.now}={}){
 if(typeof fetcher!=='function'||typeof getToken!=='function')
  return reject('CANARY_UNAVAILABLE');
 const preflight=await preflightV285QaAdmission({fetcher,now});
 if(!preflight.admitted)return reject('PREFLIGHT_'+preflight.reason);
 let token;try{token=await getToken()}catch{}
 if(typeof token!=='string'||token.length<50)return reject('WORKLOAD_IDENTITY_UNAVAILABLE');
 try{
 const response=await fetcher(DEST,{
  method:'GET',redirect:'error',cache:'no-store',
  credentials:'omit',referrerPolicy:'no-referrer',
  headers:{Authorization:'Bearer '+token,Accept:'application/json'},
  signal:AbortSignal.timeout(4500)
 });
 const body=await response.json().catch(()=>null);
 return validateDbEvidence({status:response.status,body,now:now()});
 }catch{return reject('SIGNED_DB_TRANSPORT_UNAVAILABLE');}
}
