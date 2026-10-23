// V259: Fixed-text, whitelisted operator escalation. No credentials or arbitrary server strings.
// The bundle is a support handoff, NOT a Supabase ticket or proof of recovery.
const STATES=new Set(['TIMEOUT','HTTP RESPONDED','HTTP ERROR','NOT VERIFIED']);
const SAFE_CODES=new Set(['POSTGREST_RUNTIME_UNAVAILABLE','AUTH_UNAVAILABLE','BILLING_LEDGER_UNAVAILABLE']);
const BLOCKERS=new Set(['database_incident','auth_runtime','runtime_baseline','billing_preflight']);
const TTL=5*60*1000;
const observedAt=(v,now)=>{
 const t=Date.parse(String(v||''));
 return Number.isFinite(t)&&t<=now+5000&&now-t<=TTL
  ?new Date(t).toISOString():null;
};
const label=(value)=>STATES.has(value)?value:'NOT VERIFIED';
const net=(check)=>{
 const state=label(check?.state);
 const code=Number.isInteger(check?.http_status)&&check.http_status>=100
  &&check.http_status<=599?check.http_status:0;
 return state==='HTTP ERROR'||state==='HTTP RESPONDED'
  ?state+' (HTTP '+code+')':state;
};
export function buildSupabaseSupportPacket(diagnostic,now=Date.now()){
 if(!diagnostic||diagnostic.ok!==true
  ||diagnostic.version!=='v258-readonly-recovery-triage-v1'
  ||diagnostic.governance?.action_permitted!=='WAIT'
  ||diagnostic.governance?.capital_permission!=='0R'
  ||diagnostic.governance?.live_order_submission_enabled!==false
  ||diagnostic.governance?.commercial_launch_certified!==false
  ||diagnostic.private_actions_executed!==0
  ||diagnostic.database_jobs_modified!==0
  ||typeof diagnostic.checks!=='object'
  ||diagnostic.checks===null)return null;
 const when=observedAt(diagnostic.generated_at,now);
 if(!when)return null;
 const code=SAFE_CODES.has(diagnostic.checks.database_incident_code)
   ?diagnostic.checks.database_incident_code:'NOT VERIFIED';
 const blockers=Array.isArray(diagnostic.checks.blockers)
  ?[...new Set(diagnostic.checks.blockers.filter(v=>BLOCKERS.has(v)))].slice(0,4)
  :[];
 const reported=diagnostic.checks.readiness_source_current===true
  &&diagnostic.checks.database_incident_reported===true;
 const subject='P0 technical investigation · Supabase eu-west-1 connectivity · THE FATHER ANALYTICS';
 const message=[
  subject,
  '',
  'Hello Supabase Support,',
  '',
  'Please investigate continued connectivity and authentication timeouts affecting our Supabase Pro project in eu-west-1 (project reference: mpcelmjiycjpdyyflisn).',
  '',
  'Read-only operator network snapshot',
  'Captured (UTC): '+when,
  'Supabase Auth HTTP transport: '+net(diagnostic.checks.auth_http),
  'PostgREST HTTP transport: '+net(diagnostic.checks.postgrest_http),
  'Public incident response: '+(diagnostic.checks.readiness_source_current===true
    ?'source timestamp current':'UNVERIFIED'),
  'Database incident: '+(reported?'REPORTED':'NOT VERIFIED AS CURRENT'),
  'Incident code: '+(reported?code:'NOT VERIFIED'),
  'Reported blockers: '+(reported&&blockers.length?blockers.join(', '):'UNVERIFIED'),
  '',
  'Separately observed on 2026-10-23:',
  '- Management SQL SELECT requests timed out despite control-plane ACTIVE_HEALTHY.',
  '- At 16:45–17:55 UTC, Supavisor logs contained 11 15-second authentication timeouts, 4 EAUTHQUERY and 4 ECHECKOUTFAILED with SQLSTATE 08006.',
  '- PostgreSQL logged statement cancellations and startup timeouts across multiple pg_cron jobs.',
  '- Scheduled V180 kernel seal verification returned HTTP 503 KERNEL_SEAL / DATABASE_SEAL_TRANSPORT_TIMEOUT.',
  '',
  'Requested diagnosis (not assumed cause):',
  '1. Verify Postgres backend and pooler connectivity, auth-backend lookup, worker availability, CPU/IO pressure and connections in eu-west-1.',
  '2. Determine whether regional networking, pooler authentication, database load, or workers explain the observed timeouts.',
  '3. Recommend a measured low-risk remediation preserving stored data and existing scheduled jobs.',
  '',
  'Safety: HTTP reachability does not establish a successful login or SQL query. This snapshot does not prove a verified private kernel, broker quote, subscription, or commercial readiness. Trading is OFF; WAIT / 0R. No passwords, API secrets, session data or customer records are included.',
  '',
  'Relevant operational runbook:',
  'https://github.com/youngshekeh/youngshekeh/blob/the-father-analytics-deploy/docs/operations/2026-10-23-v258-supabase-recovery-triage.md',
  '',
  'Please provide an incident/case ID, your findings, and a safe recovery plan.'
 ].join('\n');
 return Object.freeze({
  title:subject,message,source_timestamp:when,
  provider_ticket_created:false,credentials_included:false,
  proof_is_read_only:true,capital_permission:'0R',
  commercial_launch_certified:false
 });
}
