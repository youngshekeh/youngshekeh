// V258: Safe incident triage only. Not a recovery action and NOT a launch certification.
const SAFE_CODES=new Set([
 'database_incident','auth_runtime','runtime_baseline','billing_preflight',
 'POSTGREST_RUNTIME_UNAVAILABLE','AUTH_UNAVAILABLE','BILLING_LEDGER_UNAVAILABLE'
]);
const WAIT=Object.freeze({action_permitted:'WAIT',capital_permission:'0R',
 live_order_submission_enabled:false,recovery_permitted:false,
 commercial_launch_certified:false});
const age=(date,now)=>{const t=Date.parse(String(date||''));
 return Number.isFinite(t)&&t<=now+5000&&now-t<=5*60*1000};
export function classifyTransport(check){
 if(check?.transport==='DEFERRED_DB_INCIDENT')return Object.freeze({
  state:'DEFERRED_BY_DATABASE_INCIDENT',http_status:0,
  transport_reachable:false,service_ready:false});
 const status=check?.status;
 if(check?.transport==='TIMEOUT')return Object.freeze({state:'TIMEOUT',http_status:0,
  transport_reachable:false,service_ready:false});
 if(check?.transport!=='HTTP_RESPONSE'||!Number.isInteger(status)||status<100||status>599)
  return Object.freeze({state:'NOT VERIFIED',http_status:0,
   transport_reachable:false,service_ready:false});
 return Object.freeze({state:status>=200&&status<400?'HTTP RESPONDED':'HTTP ERROR',
  http_status:status,transport_reachable:true,service_ready:false});
}
export function assessRecoveryTriage({auth,rest,readiness}={},now=Date.now()){
 const authResult=classifyTransport(auth),restResult=classifyTransport(rest);
 const body=readiness?.data;
 const sourceCurrent=readiness?.transport==='HTTP_RESPONSE'
  && readiness.status>=200&&readiness.status<300
  && body?.ok===true&&age(body.generated_at,now);
 const incident=sourceCurrent&&body.database_incident?.active===true;
 const selfReportedCode=incident&&SAFE_CODES.has(body.database_incident?.code)
  ?body.database_incident.code:null;
 const remoteBlockers=sourceCurrent&&Array.isArray(body.hard_blockers)
  ?body.hard_blockers.filter(x=>SAFE_CODES.has(x)).slice(0,8):[];
 const state=incident?'DATABASE INCIDENT REPORTED':
  sourceCurrent?'PRIVATE CERTIFICATION NOT ESTABLISHED':'PRIVATE READINESS UNVERIFIED';
 const next=incident?'Escalate current PostgREST/Supavisor connectivity evidence to Supabase Support. Do not reset the database or change cron schedules.':
 'Retest authenticated private kernel, login, active entitlement and broker quote independently; no release without fresh successful evidence.';
 return Object.freeze({
  ok:true,version:'v258-readonly-recovery-triage-v1',
  generated_at:new Date(now).toISOString(),state,
  checks:Object.freeze({
   auth_http:authResult,postgrest_http:restResult,
   readiness_source_current:sourceCurrent,
   database_incident_reported:incident,
   database_incident_code:selfReportedCode,
   blockers:Object.freeze(remoteBlockers)
  }),
  limitations:Object.freeze({
   auth_http_does_not_prove_login:true,
   postgrest_http_does_not_prove_database_queries:true,
   public_readiness_is_not_a_private_kernel_receipt:true,
   does_not_test_subscription_or_broker:true,
   no_signed_in_account_probed:true
  }),
  next_step:next,
  private_actions_executed:0,
  database_jobs_modified:0,
  governance:WAIT
 });
}
