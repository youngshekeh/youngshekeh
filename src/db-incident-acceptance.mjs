// V217: database incident classifier and strict RECOVERY acceptance.
// The builder intentionally never echoes arbitrary log content, SQL, bearer tokens,
// customer records, private URLs, or free-form text.
export const DB_INCIDENT_SCHEMA='TFA-DB-RECOVERY-V217';
const MAX_EVIDENCE_AGE_MS=10*60_000;
const MAX_SUCCESS_AGE_MS=15*60_000;
const ERROR_TYPES=Object.freeze(['PGRST002','57014','CRON_STARTUP_TIMEOUT','MANAGEMENT_SQL_TIMEOUT','KERNEL_SEAL','POLICY']);
function validTime(s){const t=Date.parse(String(s??''));return Number.isFinite(t)?t:null;}
function fresh(s,now=Date.now(),ttl=MAX_EVIDENCE_AGE_MS){
 const t=validTime(s);return t!==null&&t<=now+60_000&&now-t<=ttl;
}
function classify(raw){
 const s=String(raw??'').slice(0,1800);
 const found=[];
 if(/PGRST002/.test(s))found.push('PGRST002');
 if(/\b57014\b/.test(s)||/canceling statement due to statement timeout/i.test(s))found.push('57014');
 if(/cron job \d+ job startup timeout/i.test(s))found.push('CRON_STARTUP_TIMEOUT');
 if(/Connection terminated due to connection timeout/i.test(s))found.push('MANAGEMENT_SQL_TIMEOUT');
 if(/\bKERNEL_SEAL\b/.test(s))found.push('KERNEL_SEAL');
 if(/\bPOLICY\b/.test(s))found.push('POLICY');
 return found;
}
export function summarizeIncident(events=[],now=Date.now()){
 const totals=Object.fromEntries(ERROR_TYPES.map(code=>[code,0]));
 let freshCount=0,mostRecent=null;
 for(const event of Array.isArray(events)?events.slice(0,500):[]){
   if(!fresh(event?.timestamp,now,60*60_000))continue;
   freshCount++;
   const date=validTime(event.timestamp);
   mostRecent=Math.max(mostRecent??0,date);
   for(const code of classify(event?.event_message))totals[code]++;
 }
 return Object.freeze({schema:DB_INCIDENT_SCHEMA,
   observed_at:new Date(now).toISOString(),
   recent_event_count:freshCount,
   latest_event_at:mostRecent?new Date(mostRecent).toISOString():null,
   codes:Object.freeze(totals)
 });
}
function allowedRun(r,now){
 return r?.status==='SUCCEEDED'&&r?.mode==='EXECUTE'&&r?.health_state==='HEALTHY'
  &&r?.seal?.sealed===true
  &&['SQL_POOLER_VERIFIED','POSTGREST_VERIFIED'].includes(r?.seal?.transport)
  &&r?.governance?.action_permitted==='WAIT'
  &&r?.governance?.capital_permission==='0R'
  &&r?.governance?.trades_sent===false
  &&r?.governance?.funds_moved===false
  &&typeof r?.run_id==='string'&&r.run_id.length>0&&r.run_id.length<129
  &&fresh(r?.finished_at,now,MAX_SUCCESS_AGE_MS);
}
export function assessDatabaseRecovery({
 observed_at,incident,management_sql,postgrest_probe,cron,heartbeat_runs,payment
}={},now=Date.now()){
 const blockers=[];
 if(!fresh(observed_at,now))blockers.push('OBSERVATION_NOT_FRESH');
 if(!incident||incident.schema!==DB_INCIDENT_SCHEMA||!fresh(incident.observed_at,now))
   blockers.push('INCIDENT_EVIDENCE_NOT_FRESH');
 else if(Object.entries(incident.codes??{}).some(([k,v])=>ERROR_TYPES.includes(k)&&Number(v)>0))
   blockers.push('RECENT_DATABASE_ERRORS');
 if(management_sql?.ok!==true||!fresh(management_sql?.observed_at,now))
   blockers.push('MANAGEMENT_SQL_NOT_VERIFIED');
 if(postgrest_probe?.ok!==true||postgrest_probe?.schema_cache_ready!==true
   ||!fresh(postgrest_probe?.observed_at,now))
   blockers.push('POSTGREST_CACHE_NOT_VERIFIED');
 if(cron?.active_jobs!==58||cron?.enabled!=='on'||cron?.recent_startup_timeouts!==0
   ||!fresh(cron?.observed_at,now))
   blockers.push('SCHEDULER_RUNTIME_NOT_VERIFIED');
 const runs=Array.isArray(heartbeat_runs)?heartbeat_runs:[];
 const good=runs.filter(r=>allowedRun(r,now));
 const distinct=[...new Set(good.map(r=>r.run_id))];
 const runTimes=good.map(r=>validTime(r.finished_at)).filter(x=>x!==null).sort((a,b)=>b-a);
 // Two receipts must represent two separate completed cycles, not repeated
 // delivery of a single event or near-simultaneous duplicate responses.
 if(distinct.length<2||runTimes.length<2||runTimes[0]-runTimes[1]<60_000)
   blockers.push('TWO_DISTINCT_KERNEL_CYCLES_NOT_VERIFIED');
 if(payment?.full_live_acceptance!==true||payment?.signed_webhook_verified!==true
   ||payment?.entitlement_verified!==true||!fresh(payment?.observed_at,now))
   blockers.push('PAYMENT_FULFILMENT_NOT_VERIFIED');
 return Object.freeze({
   schema:DB_INCIDENT_SCHEMA,observed_at:new Date(now).toISOString(),
   state:blockers.length===0?'READY_FOR_OPERATOR_FINAL_QA':'LAUNCH_HOLD',
   ready_for_operator_final_qa:blockers.length===0,
   blockers:Object.freeze(blockers),
   governance:Object.freeze({trading:'WAIT / 0R',real_orders:false,
      automatic_checkout_unlock:false,manual_release_required:true})
 });
}
// Prints only exact known fields and counts. Never include raw logs in tickets.
export function supportSummary(incident,{projectRef='mpcelmjiycjpdyyflisn',region='eu-west-1'}={}){
 const safeId=/^[a-z0-9]{20}$/.test(projectRef)?projectRef:'[redacted]';
 const safeRegion=/^[a-z0-9-]{3,30}$/.test(region)?region:'[redacted]';
 const totals=incident?.codes??{};
 const count=code=>Number.isInteger(totals[code])&&totals[code]>=0?totals[code]:0;
 return [
  '# Supabase incident: PostgREST schema cache build timeouts and cron startup failures',
  '',
  'Project ref: '+safeId+' | Region: '+safeRegion,
  'Snapshot UTC: '+(validTime(incident?.observed_at)?new Date(incident.observed_at).toISOString():'UNVERIFIED'),
  'Classified events (sample of last hour; may overlap across error types):',
  ...ERROR_TYPES.map(code=>'- '+code+': '+count(code)),
  '',
  'Observed impact: REST schema cache unavailable, repeated statement cancellation, unreliable authenticated kernel and intermittent management SQL connection timeouts.',
  'Request provider investigation of PostgREST schema introspection cost, database compute/IO, connection pool, cron startup contention and catalog cache reloads.',
  'Configured schemas public and graphql_public were previously confirmed present. Do not assume missing schema without a new check.',
  'No credentials, full log payloads or customer records included.',
  'No production DDL or global cron changes were made by this diagnostics release.'
 ].join('\n');
}
