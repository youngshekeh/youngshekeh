import {freshEvidence} from './launch-readiness.mjs';

// V250: A status page must not become a thundering herd for an already-failing DB.
// This is a network-admission policy only. It CANNOT certify login, billing,
// OIDC, private QA, broker data, kernel health or commercial readiness.
export function assessStatusDependencyAdmission(readiness,now=Date.now()){
 const body=readiness?.data ?? {};
 const response=readiness?.response;
 const authenticated=false;
 const sourceCurrent=response?.ok===true && body.ok===true
   && freshEvidence(body.generated_at,now);
 const dbHealthy=sourceCurrent && body.database_incident?.active===false;
 const reason=!sourceCurrent?'READINESS_NOT_VERIFIED'
   :body.database_incident?.active===true?'DATABASE_INCIDENT_ACTIVE'
   :!dbHealthy?'DATABASE_INCIDENT_NOT_VERIFIED':'DATABASE_INCIDENT_CLEARED';
 return Object.freeze({
   admitted:dbHealthy,
   reason,
   auth_verified:authenticated,
   billing_verified:false,
   private_qa_verified:false,
   kernel_verified:false,
   capital_permission:'0R',
   live_order_submission_enabled:false
 });
}
export const deferredStatus=(reason)=>Object.freeze({
 response:{ok:false,headers:{get:()=>null}},
 data:{ok:false,state:'DEFERRED · '+(reason==='DATABASE_INCIDENT_ACTIVE'?'DB INCIDENT':'READINESS UNAVAILABLE')}
});
export async function probeStatusDependencies({readiness,readAuth,readBilling,now=Date.now}={}){
 if(typeof readAuth!=='function'||typeof readBilling!=='function')throw new TypeError('status_readers_required');
 const admission=assessStatusDependencyAdmission(readiness,now());
 if(!admission.admitted){
  const auth=deferredStatus(admission.reason),billing=deferredStatus(admission.reason);
  return Object.freeze({auth,billing,admission,requests_sent:0});
 }
 const read=async(fn)=>{try{return await fn()}catch{return {
   response:{ok:false,headers:{get:()=>null}},data:{ok:false,state:'UNAVAILABLE'}
 }}};
 const [auth,billing]=await Promise.all([read(readAuth),read(readBilling)]);
 return Object.freeze({auth,billing,admission,requests_sent:2});
}
