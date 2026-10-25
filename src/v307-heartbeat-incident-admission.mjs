// V307 · strictly read-only incident-first heartbeat admission.
// Never treat a public diagnostic as a successful private execution receipt.
const URL='https://thefatheranalytics.com/api/public-recovery-triage';
export const INCIDENT_READ_BUDGET_MS=10_000;
export function classifyHeartbeatIncident({responseOk=false,data}={},now=Date.now()){
 const at=Date.parse(String(data?.generated_at??''));
 const fresh=Number.isFinite(at)&&at<=now+5000&&now-at<=5*60*1000;
 const safelyObserved=responseOk===true&&data?.ok===true&&fresh
  &&data?.checks?.readiness_source_current===true
  &&data?.governance?.action_permitted==='WAIT'
  &&data?.governance?.capital_permission==='0R'
  &&data?.governance?.live_order_submission_enabled===false
  &&data?.private_actions_executed===0
  &&data?.database_jobs_modified===0;
 const confirmed=safelyObserved
  &&data?.state==='DATABASE INCIDENT REPORTED'
  &&data?.checks?.database_incident_reported===true
  &&typeof data?.checks?.database_incident_code==='string'
  &&data.checks.database_incident_code.length>0;
 return Object.freeze({
  verified_active_database_incident:confirmed,
  defer_private_kernel:confirmed,
  certified_private_kernel:false,
  certified_commercial_launch:false,
  capital_permission:'0R',
  reason:confirmed?'RECENT_DATABASE_INCIDENT_CONFIRMED':'INCIDENT_NOT_INDEPENDENTLY_VERIFIED'
 });
}
export async function checkHeartbeatIncident({fetchImpl=globalThis.fetch,now=Date.now}={}){
 try{
  if(typeof fetchImpl!=='function')throw new TypeError('fetch_unavailable');
  const response=await fetchImpl(URL,{
   method:'GET',headers:{Accept:'application/json'},
   cache:'no-store',redirect:'error',
   signal:AbortSignal.timeout(INCIDENT_READ_BUDGET_MS)
  });
  if(!response?.ok)return classifyHeartbeatIncident({},now());
  const data=await response.json();
  return classifyHeartbeatIncident({responseOk:true,data},now());
 }catch{
  // Unavailable public telemetry must never pretend the private engine is down,
  // recovered, certified, or executed. Fall back to the existing sealed path.
  return classifyHeartbeatIncident({},now());
 }
}
