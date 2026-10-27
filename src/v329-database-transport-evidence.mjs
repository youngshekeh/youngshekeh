// V329: strictly redacted cross-plane database transport acceptance.
// This module never connects to a live database, emits SQL, touches user
// data, changes jobs or mutates payment state. Real samples must come from
// separate authorized, read-only Supabase tools.
//
// A green Supabase management project state (ACTIVE_HEALTHY) only describes
// control plane reporting, NOT Postgres query availability.
import {twoStableSqlReads} from './db-incident-acceptance.mjs';

export const TRANSPORT_EVIDENCE_SCHEMA_V329='TFA-DB-TRANSPORT-V329';
export const TRANSPORT_REQUIRED_SOURCES=Object.freeze([
  'postgres_logs','postgrest_logs','supavisor_logs'
]);
const MAX_WINDOW_MS=15*60_000,MIN_WINDOW_MS=5*60_000;
const FRESHNESS_MS=2*60_000;
const ALLOWED_METRICS=Object.freeze([
  'postgres_cancelled_57014',
  'postgres_connection_08006',
  'postgres_protocol_08P01',
  'postgrest_timeout_events',
  'postgrest_pooler_errors',
  'supavisor_auth_timeouts',
  'management_sql_connect_timeouts'
]);
const isTime=x=>typeof x==='string'&&x.length<=40?
  Date.parse(x):NaN;
const validTime=x=>Number.isFinite(isTime(x));
const count=x=>Number.isSafeInteger(x)&&x>=0&&x<=1_000_000?x:null;
const metricObject=()=>Object.fromEntries(ALLOWED_METRICS.map(k=>[k,0]));
function safeAggregate(snapshot){
  if(snapshot===null||typeof snapshot!=='object')return null;
  const m=snapshot.metrics;
  if(m===null||typeof m!=='object'||Array.isArray(m))return null;
  const sanitized=metricObject();
  for(const key of ALLOWED_METRICS){
    const n=count(m[key]);
    if(n===null)return null;
    sanitized[key]=n;
  }
  return Object.freeze(sanitized);
}

export function assessDatabaseTransportV329({
 snapshot, management_sql_samples, postgrest_probe, control_plane
}={},now=Date.now()){
 const blockers=[];
 const input=snapshot??{};
 const errors=safeAggregate(input);
 const start=isTime(input.window_start),end=isTime(input.window_end);
 const observed=isTime(input.collected_at);
 const range=Number.isFinite(start)&&Number.isFinite(end)?end-start:NaN;
 const coverage=Array.isArray(input.sources)&&input.sources.length===3&&
  TRANSPORT_REQUIRED_SOURCES.every(x=>input.sources.includes(x))&&
  new Set(input.sources).size===3;
 const windowValid=Number.isFinite(range)&&
  range>=MIN_WINDOW_MS&&range<=MAX_WINDOW_MS&&
  Number.isFinite(observed)&&observed>=end&&
  observed<=now+30_000&&end<=now+30_000&&
  now-end<=FRESHNESS_MS&&
  input.log_query_complete===true&&
  input.redacted===true&&coverage&&
  errors!==null;
 if(!windowValid)blockers.push('TRANSPORT_LOG_WINDOW_NOT_VERIFIED');
 if(errors!==null&&ALLOWED_METRICS.some(k=>errors[k]>0))
  blockers.push('TRANSPORT_ERRORS_IN_WINDOW');
 if(!twoStableSqlReads(management_sql_samples,now))
  blockers.push('TWO_SPACED_MANAGEMENT_SQL_READS_REQUIRED');
 // Authenticated read-only REST success independently verifies PostgREST
 // availability. A public homepage 200 is never equivalent evidence.
 const rest=postgrest_probe??{};
 if(rest.ok!==true||rest.schema_cache_ready!==true||
   rest.authenticated_read_only!==true||
   !validTime(rest.observed_at)||
   isTime(rest.observed_at)>now+30_000||
   now-isTime(rest.observed_at)>FRESHNESS_MS)
   blockers.push('AUTHENTICATED_POSTGREST_NOT_VERIFIED');
 // This remains informational even if green; it cannot waive blockers.
 const status=control_plane?.status==='ACTIVE_HEALTHY'
   ?'PROJECT_ACTIVE_HEALTHY'
   :control_plane?.status==='UNKNOWN'
     ?'UNKNOWN':'NOT_VERIFIED';
 const clear=blockers.length===0;
 return Object.freeze({
   schema:TRANSPORT_EVIDENCE_SCHEMA_V329,
   assessed_at:new Date(now).toISOString(),
   state:clear?'TRANSPORT_EVIDENCE_REVIEWABLE':'DATABASE_RECOVERY_HOLD',
   transport_ready_for_independent_review:clear,
   management_status_only:status,
   observed_metric_totals:errors,
   window_complete:windowValid,
   blockers:Object.freeze(blockers),
   governance:Object.freeze({
      billing_activation_permitted:false,
      trading_activation_permitted:false,
      automatic_release_permitted:false,
      database_restart_permitted:false,
      manual_operator_approval_required:true,
      action:'WAIT',capital_permission:'0R'
   })
 });
}

// Separate from error decisions: this serializes ALLOWED fixed diagnostic
// metrics only, never SQL text, provider secrets, customer identifiers or raw
// log entries. Safe to attach to an incident ticket after operator review.
export function makeRedactedTransportSupportV329(snapshot,assessment){
 const metrics=Object.fromEntries(ALLOWED_METRICS.map(k=>[
   k,count(snapshot?.metrics?.[k])??'UNVERIFIED'
 ]));
 const windowStart=validTime(snapshot?.window_start)
   ?new Date(snapshot.window_start).toISOString():'UNVERIFIED';
 const windowEnd=validTime(snapshot?.window_end)
   ?new Date(snapshot.window_end).toISOString():'UNVERIFIED';
 return [
  'THE FATHER ANALYTICS / V329 DATABASE TRANSPORT INVESTIGATION',
  'Project: mpcelmjiycjpdyyflisn | Region: eu-west-1',
  'Window UTC: '+windowStart+' to '+windowEnd,
  'Control-plane health does not prove SQL availability.',
  'Management SQL / REST transport release: '+String(assessment?.state??'DATABASE_RECOVERY_HOLD'),
  ...ALLOWED_METRICS.map(k=>k+': '+metrics[k]),
  'Recovery blockers: '+(Array.isArray(assessment?.blockers)?
    assessment.blockers.filter(x=>typeof x==='string'&&/^[A-Z0-9_]{1,70}$/.test(x)).join(', '):'UNVERIFIED'),
  'Request: inspect database compute saturation, CPU/RAM/swap/I/O, PostgREST',
  'statement timeouts, Supavisor role connections, long transactions and locks.',
  'Require two distinct fresh SQL probes >=60s apart, clean 5-15min log',
  'window and authenticated read-only PostgREST verification before review.',
  'Do not restart production, terminate connections, disable scheduler,',
  'raise resource costs or alter database settings without an approved runbook.',
  'No customer records, queries, raw log events or credentials attached.',
  'Payments and trading remain disabled; WAIT / 0R.'
 ].join('\n');
}
