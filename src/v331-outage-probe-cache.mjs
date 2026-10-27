// V331 · read-only incident-aware negative caching.
// Do not infer database recovery from HTTP success. No network or side effects.
// Warm serverless isolate cache bounds repeated provider health probes, but does
// not coordinate across isolates, modify cron or repair infrastructure.
export const V331_NORMAL_CACHE_MS=90_000;
export const V331_INCIDENT_CACHE_MS=180_000;
// Never exceed the five-minute TTL accepted by incident freshness consumers.
const states=new Set([
 'DATABASE INCIDENT REPORTED',
 'PRIVATE READINESS UNVERIFIED'
]);
export function chooseRecoveryProbeCacheV331(report){
 const incident=report?.checks?.database_incident_reported===true&&
   report?.state==='DATABASE INCIDENT REPORTED';
 const readinessFailed=report?.checks?.readiness_source_current!==true;
 const authTimeout=report?.checks?.auth_http?.state==='TIMEOUT'||
   report?.checks?.auth_http?.transport==='TIMEOUT';
 const restTimeout=report?.checks?.postgrest_http?.state==='TIMEOUT'||
   report?.checks?.postgrest_http?.transport==='TIMEOUT';
 const degraded=incident||readinessFailed||authTimeout||restTimeout||
  (typeof report?.state==='string'&&states.has(report.state));
 return Object.freeze({
  reason:incident?'VERIFIED_DATABASE_INCIDENT':degraded?'PROVIDER_EVIDENCE_UNAVAILABLE':'NORMAL_READONLY_MONITORING',
  ttl_ms:degraded?V331_INCIDENT_CACHE_MS:V331_NORMAL_CACHE_MS,
  cache_may_unlock_launch:false,
  cache_may_trigger_mutations:false,
  live_order_submission_enabled:false,
  action_permitted:'WAIT',
  capital_permission:'0R'
 });
}
export function currentCachedTriageV331({cached,stored_at,policy,now=Date.now()}={}){
 const age=now-stored_at;
 // Never reuse an old or future-created cache entry or an object without
 // an explicit policy. Can safely fail to cache if serverless time changes.
 return Boolean(cached&&policy&&
  (policy.ttl_ms===V331_INCIDENT_CACHE_MS||policy.ttl_ms===V331_NORMAL_CACHE_MS)&&
  Number.isFinite(age)&&age>=0&&age<policy.ttl_ms);
}
