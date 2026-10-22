// V230: strict, offline, source-specific incident triage. No network, DB or trade access.
export const V230_SCHEMA='TFA-V230-PROVIDER-TRIAGE';
export const V230_PROJECT='mpcelmjiycjpdyyflisn';
function count(value,key){
 if(!Number.isSafeInteger(value)||value<0||value>10000000)throw Error('Invalid count: '+key);
 return value;
}
function instant(value,key){
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT/.test(value))throw Error('Invalid time: '+key);
 const parsed=Date.parse(value);
 if(!Number.isFinite(parsed))throw Error('Invalid time: '+key);
 return new Date(parsed).toISOString();
}
export function evaluateV230(snapshot){
 if(!snapshot||snapshot.schema!==V230_SCHEMA||snapshot.project_ref!==V230_PROJECT
  ||snapshot.provenance!=='read-only source-specific snapshots; not complete event coverage'
  ||snapshot.root_cause_verified!==false||snapshot.support_ticket_submitted!==false)
  throw Error('Unverified evidence provenance');
 const observed=instant(snapshot.captured_at,'capture');
 const begin=instant(snapshot.window_start,'start');
 const end=instant(snapshot.window_end,'end');
 const bt=Date.parse(begin),et=Date.parse(end),ot=Date.parse(observed);
 if(et<=bt||et-bt>24*3600000||et>ot+1000)throw Error('Invalid source window');
 function event(value,key){
  const v=instant(value,key),t=Date.parse(v);
  if(t<bt||t>et+60000)throw Error('Event outside source window: '+key);
  return v;
 }
 const src=snapshot.sources||{},c={
  pgrst002:count(src.postgrest?.pgrst002,'pgrst002'),
  sqlstate57014:count(src.postgrest?.sqlstate57014,'57014'),
  supavisor_auth_timeouts:count(src.supavisor?.authentication_timeouts,'auth'),
  cron_startup_timeouts:count(src.pg_cron?.startup_timeouts,'cron')
 };
 const latest={
  postgrest:event(src.postgrest?.latest_event_at,'postgrest'),
  supavisor:event(src.supavisor?.latest_event_at,'supavisor'),
  pg_cron:event(src.pg_cron?.latest_event_at,'pg_cron')
 };
 const checks=snapshot.direct_checks||{};
 if(checks.sql?.state!=='CONNECTION_TIMEOUT'
  ||checks.kernel?.state!=='KERNEL_SEAL_FAILED'
  ||checks.gold?.state!=='UNAVAILABLE'||checks.gold?.http_status!==503
  ||checks.bridge?.state!=='DATA_DEGRADED'
  ||count(checks.bridge?.passed_gates,'passed_gates')!==0
  ||count(checks.bridge?.total_gates,'total_gates')!==6)throw Error('Unverified direct checks');
 event(checks.kernel?.last_failure_at,'kernel');
 event(checks.gold?.checked_at,'gold');
 event(checks.bridge?.checked_at,'bridge');
 return Object.freeze({
  version:'V230',project_ref:V230_PROJECT,
  captured_at:observed,window_start:begin,window_end:end,
  counts:Object.freeze(c),latest_events:Object.freeze(latest),
  incident:'ACTIVE_DATABASE_AND_LIVE_DATA_FAILURE',
  suspected_causes:Object.freeze([
    'Database connections or host resource contention: investigate, unproven',
    'pg_cron concurrent worker saturation: investigate, unproven',
    'Exposed schema configuration mismatch for PGRST002: investigate, unproven'
  ]),
  launch:'NOT_CERTIFIED',public_preview_only:true,
  operator_proof:{
   management_sql:false,postgrest_stable:false,cron_recent_success:false,
   v180_two_sealed_runs:false,broker_gold_fresh:false,private_qa_pass:false,
   oidc_login_e2e:false,payment_entitlement_e2e:false
  },
  protected:{billing_locked:true,trading:'WAIT / 0R',database_mutated:false,
    cron_modified:false,ticket_submitted:false},
  evidence_scope:'PARTIAL_LOG_SAMPLE_AND_DIRECT_FAILURES'
 });
}
export function createSupportMessage(verdict){
 if(verdict?.version!=='V230'||verdict?.project_ref!==V230_PROJECT
  ||verdict?.launch!=='NOT_CERTIFIED')throw Error('Invalid V230 verdict');
 const c=verdict.counts;
 return [
  '# Production incident: Supabase Postgres/Supavisor/pg_cron/PostgREST',
  '',
  'Project ref: '+V230_PROJECT,
  'UTC interval: '+verdict.window_start+' to '+verdict.window_end,
  'Captured at: '+verdict.captured_at,
  'Counts are from read-only, source-specific partial snapshots and are not exhaustive.',
  '',
  'Observed: PostgREST PGRST002='+c.pgrst002+' (sample only), SQLSTATE 57014='+c.sqlstate57014,
  'Supavisor authentication timeouts='+c.supavisor_auth_timeouts,
  'pg_cron job startup timeouts='+c.cron_startup_timeouts,
  'Independent management SQL timed out, V180 kernel seal failed, Gold feed HTTP 503.',
  'Public website remains a deployed PREVIEW; commercial launch NOT CERTIFIED.',
  '',
  'Support requests (no proposed global restart or termination):',
  '1. Review Postgres CPU, RAM, IOPS, worker capacity, blocked sessions and max backend connections in this interval.',
  '2. Correlate Supavisor backend auth/checkout with direct Postgres and PostgREST pool metrics.',
  '3. Review pg_cron concurrency and worker startup failures, targeting named jobs only after approved diagnosis.',
  '4. Verify exposed Data API schemas still exist; assess PostgREST schema-cache introspection and 57014 causes.',
  '5. Provide safe, reversible remediation steps and recovery acceptance evidence; do not alter credentials or globally suspend jobs.',
  '',
  'Relevant Supabase references:',
  'https://supabase.com/docs/guides/cron',
  'https://supabase.com/docs/guides/database/connection-management',
  'https://supabase.com/docs/guides/troubleshooting/postgrest-error-pgrst002-could-not-query-the-database-for-the-schema-cache-c396e9',
  '',
  'Do not request a live payment, order or production-wide cron change. Capital WAIT / 0R.',
  'Ticket submission is NOT performed by this script.'
 ].join('\n')+'\n';
}
