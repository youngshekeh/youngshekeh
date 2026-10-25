// V298 signed, read-only mission recovery canary. Not the mission engine.
// No DB writes, provider prices, secret fallback, engine registry or trading.
import {preflightV285QaAdmission} from './v285-qa-upstream-admission.mjs';
const ROOT='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/';
const IDENTITY_URL=ROOT+'runtime-v115-oidc-probe';
const MISSION_URL=ROOT+'runtime-v115-mission-brief';
const HOLD=Object.freeze({
  recovery_certified:false,private_mission_restored:false,engine_registry_certified:false,
  customer_login_certified:false,merchant_certified:false,
  capital_permission:'0R',action_permitted:'WAIT',
  live_order_submission_enabled:false,commercial_launch_allowed:false
});
const verdict=(status,reason,oidcVerified=false,loadShedConfirmed=false)=>
 Object.freeze({...HOLD,ok:status==='SIGNED_LOAD_SHED_OBSERVED',version:'v298-signed-recovery-canary-v1',
   state:status,reason,private_workload_identity_verified:oidcVerified,
   load_shed_observed:loadShedConfirmed,additional_private_requests:oidcVerified?2:0});
async function signedRead(fetcher,url,token,deadlineMs=4500){
 try{
  const r=await fetcher(url,{
   method:'GET',redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',
   cache:'no-store',headers:{Authorization:'Bearer '+token,Accept:'application/json',
    'User-Agent':'TFA-V298-SIGNED-RECOVERY/1.0'},
   signal:AbortSignal.timeout(deadlineMs)
  });
  return {status:r.status,body:await r.json().catch(()=>null)};
 }catch{return {status:0,body:null};}
}
export async function inspectPrivateMissionRecovery({
 fetcher=fetch,getToken,now=Date.now
}={}){
 if(typeof fetcher!=='function'||typeof getToken!=='function')
  return verdict('CANARY_UNAVAILABLE','READER_OR_IDENTITY_UNAVAILABLE');
 // Reject incidents and stale triage before obtaining workload identity.
 const admission=await preflightV285QaAdmission({fetcher,now});
 if(!admission.admitted)
  return verdict('PREFLIGHT_HOLD',admission.reason);
 let token;
 try{token=await getToken();}catch{}
 if(typeof token!=='string'||token.length<50)
  return verdict('OIDC_TOKEN_UNAVAILABLE','WORKLOAD_IDENTITY_UNAVAILABLE');
 // Identity probe validates Vercel token cryptographically; mission read remains
 // zero-query load shed, and both requests are bounded with no retries.
 const [auth,mission]=await Promise.all([
  signedRead(fetcher,IDENTITY_URL,token),
  signedRead(fetcher,MISSION_URL,token)
 ]);
 const identityVerified=auth.status===200&&auth.body?.ok===true
  &&auth.body?.state==='VERCEL_WORKLOAD_VERIFIED'
  &&auth.body?.owner==='the-father'
  &&auth.body?.project==='the-father-analytics'
  &&auth.body?.environment==='production'
  &&auth.body?.governance?.capital_permission==='0R'
  &&auth.body?.governance?.authentication_only===true;
 if(!identityVerified)
  return verdict('OIDC_NOT_VERIFIED','SIGNED_IDENTITY_RESPONSE_UNVERIFIED');
 const loadShed=mission.status===200&&mission.body?.ok===false
  &&mission.body?.usable===false
  &&mission.body?.state==='LOAD_SHED_DB_RECOVERY'
  &&mission.body?.capital_permission==='0R'
  &&mission.body?.live_order_submission_enabled===false
  &&mission.body?.automatic_execution===false;
 if(loadShed)return verdict('SIGNED_LOAD_SHED_OBSERVED',
  'PRIVATE_WORKLOAD_IDENTITY_VERIFIED; MISSION_LOAD_SHED_STILL_ACTIVE',true,true);
 return verdict('MISSION_STATE_NOT_VERIFIED',
  'MISSION_RESPONSE_CHANGED_OR_UNAVAILABLE; FULL_QA_REQUIRED',true,false);
}
