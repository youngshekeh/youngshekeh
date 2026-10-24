// V283: cheap, read-only incident admission for 6-probe Supabase edge acceptance.
// No authentication or DB recovery can be certified by a public HTTP response.
const RECENT_MS=120_000;
export const TRIAGE_URL='https://thefatheranalytics.com/api/public-recovery-triage';
export const ACCEPTANCE_PATHS=Object.freeze([
 'public-auth-runtime-check','public-final-readiness','public-billing-acceptance'
]);
export function assessProviderEdgeAdmission(triage,now=Date.now()){
 const x=triage?.body??{},checks=x.checks??{},auth=checks.auth_http??{},rest=checks.postgrest_http??{};
 const t=Date.parse(String(x.generated_at??''));
 const fresh=triage?.ok===true&&triage.status===200&&x.ok===true
   &&x.version==='v258-readonly-recovery-triage-v1'
   &&Number.isFinite(t)&&t<=now+5000&&now-t>=0&&now-t<=RECENT_MS;
 const governed=x.governance?.action_permitted==='WAIT'
   &&x.governance?.capital_permission==='0R'
   &&x.governance?.live_order_submission_enabled===false
   &&x.governance?.commercial_launch_certified===false
   &&x.private_actions_executed===0&&x.database_jobs_modified===0;
 const incident=checks.database_incident_reported===true||x.state==='DATABASE INCIDENT REPORTED'
   ||Array.isArray(checks.blockers)&&checks.blockers.includes('database_incident');
 const authTransport=auth.transport_reachable===true
   &&auth.state==='HTTP RESPONDED'&&Number.isInteger(auth.http_status)
   &&auth.http_status>=200&&auth.http_status<400;
 // The anonymous PostgREST root legitimately returns HTTP 401. This is only
 // transport evidence, not proof that a PostgreSQL query or JWT works.
 const restTransport=rest.transport_reachable===true
   &&Number.isInteger(rest.http_status)&&rest.http_status>=100&&rest.http_status<500;
 const admission=Boolean(fresh&&governed&&!incident&&checks.readiness_source_current===true
   &&x.state==='PRIVATE CERTIFICATION NOT ESTABLISHED'&&authTransport&&restTransport);
 const reason=!fresh?'TRIAGE_UNAVAILABLE_OR_STALE':!governed?'GOVERNANCE_UNVERIFIED':
   incident?'DATABASE_INCIDENT_REPORTED':!checks.readiness_source_current?'PRIVATE_SOURCE_UNVERIFIED':
   !authTransport?'AUTH_TRANSPORT_NOT_AVAILABLE':
   !restTransport?'POSTGREST_TRANSPORT_NOT_AVAILABLE':
   x.state!=='PRIVATE CERTIFICATION NOT ESTABLISHED'?'RECOVERY_STATE_NOT_VERIFIED':
   'READ_ONLY_PROBES_ADMITTED';
 return Object.freeze({admitted:admission,reason,
  triage_fresh:Boolean(fresh),incident_reported:Boolean(incident),
  auth_transport_observed:Boolean(authTransport),
  postgres_query_verified:false,authenticated_login_verified:false,
  private_kernel_verified:false,paid_entitlement_verified:false,
  commerce_permitted:false,capital_permission:'0R'});
}
export const safeEdgeSummary=(items=[],skipped=0)=>{
 const x=Array.isArray(items)?items.slice(0,6):[];
 const count=predicate=>x.filter(predicate).length;
 const reached=count(v=>v.transport_ok===true);
 const semantic=count(v=>v.semantic_ok===true);
 const rate=count(v=>v.status===429||v.status===546);
 const errors=count(v=>v.status===0||v.status>=500);
 return Object.freeze({transport_passed:reached,transport_failed:x.length-reached,
  semantic_passed:semantic,semantic_failed:x.length-semantic,
  total:x.length,remaining_probes_deferred:Math.max(0,Math.min(6,skipped)),
  application_consistency:x.length===6&&semantic===6?'ALL_SEMANTIC_GATES_READY':'SEMANTIC_VARIANCE_OR_DEFERRED',
  rate_limited:rate,server_errors:errors,
  max_latency_ms:x.reduce((m,v)=>Math.max(m,Number.isFinite(v?.latency_ms)?Math.max(0,Math.round(v.latency_ms)):0),0)});
};
