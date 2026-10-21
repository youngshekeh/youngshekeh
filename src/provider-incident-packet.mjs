// V227: read-only, allowlisted provider incident aggregation and support packet.
// This helper NEVER connects to production or interprets arbitrary log text.
export const SCHEMA='TFA-PROVIDER-INCIDENT-V227';
const PROJECT='mpcelmjiycjpdyyflisn';
const REGION='eu-west-1';
function iso(v){
  if(typeof v!=='string')return null;
  const t=Date.parse(v);
  return Number.isFinite(t)?new Date(t).toISOString():null;
}
function count(v){
  return Number.isSafeInteger(v)&&v>=0&&v<=100000000?v:null;
}
function requireCount(v,name){
  const x=count(v);if(x===null)throw new Error('Invalid aggregated count: '+name);
  return x;
}
function requireDate(v,name){
  const x=iso(v);if(x===null)throw new Error('Invalid timestamp: '+name);
  return x;
}
function checkEventTime(v,start,end,name){
  const t=requireDate(v,name);
  if(Date.parse(t)<Date.parse(start)||Date.parse(t)>Date.parse(end)+60000)
    throw new Error('Timestamp outside requested range: '+name);
  return t;
}
export function assessProviderPressure(data){
  if(!data||data.schema!==SCHEMA||data.project_ref!==PROJECT||data.region!==REGION)
    throw new Error('Unexpected incident evidence project or schema');
  if(data.capture_kind!=='READ_ONLY_AGGREGATED_LOGS')
    throw new Error('Unsupported evidence provenance');
  const start=requireDate(data.window_start_utc,'window_start');
  const end=requireDate(data.window_end_utc,'window_end');
  const duration=Date.parse(end)-Date.parse(start);
  if(duration<=0||duration>24*3600000)throw new Error('Invalid incident window');
  const input=data.sources;
  if(!input||typeof input!=='object')throw new Error('Missing source evidence');
  const pg=input.postgrest||{},cron=input.pg_cron||{},pool=input.supavisor||{};
  const counts=Object.freeze({
    pgrst002:requireCount(pg.pgrst002,'pgrst002'),
    sqlstate_57014:requireCount(pg.sqlstate_57014,'sqlstate_57014'),
    cron_startup_timeouts:requireCount(cron.startup_timeouts,'cron_startup_timeouts'),
    supavisor_auth_timeouts:requireCount(pool.auth_timeouts,'supavisor_auth_timeouts'),
    supavisor_checkout_failures:requireCount(pool.checkout_failures,'supavisor_checkout_failures'),
    supavisor_events:requireCount(pool.events,'supavisor_events')
  });
  const latest=Object.freeze({
    postgrest:checkEventTime(pg.latest_event_at,start,end,'postgrest'),
    pg_cron:checkEventTime(cron.latest_event_at,start,end,'pg_cron'),
    supavisor:checkEventTime(pool.latest_event_at,start,end,'supavisor')
  });
  if(counts.supavisor_auth_timeouts>counts.supavisor_events
    ||counts.supavisor_checkout_failures>counts.supavisor_events)
    throw new Error('Impossible Supavisor sample counts');
  const failure=data.other_checks||{};
  // Strictly typed observations, not inferred truths.
  if(failure.management_sql?.status!=='CONNECTION_TIMEOUT'
    ||failure.performance_advisors?.status!=='READ_TIMEOUT'
    ||failure.v180_kernel?.status!=='KERNEL_SEAL_FAILED'
    ||failure.gold?.status!=='UNAVAILABLE'
    ||failure.gold?.http_status!==503)
    throw new Error('Unknown or unverified direct incident checks');
  checkEventTime(failure.v180_kernel.observed_at,start,end,'v180_kernel');
  checkEventTime(failure.gold.observed_at,start,end,'gold');
  const jobs=Array.isArray(data.cron_job_hotspots)?data.cron_job_hotspots:[];
  if(jobs.length>20)throw new Error('Too many job hotspots');
  const seen=new Set(),hotspots=[];
  for(const job of jobs){
    if(!Number.isSafeInteger(job?.job_id)||job.job_id<1||job.job_id>100000)
      throw new Error('Invalid cron job ID');
    if(seen.has(job.job_id))throw new Error('Duplicate cron ID');
    seen.add(job.job_id);
    hotspots.push(Object.freeze({job_id:job.job_id,
      failures:requireCount(job.failures,'job_failures'),
      latest_event_at:checkEventTime(job.latest_event_at,start,end,'cron_job')}));
  }
  hotspots.sort((a,b)=>b.failures-a.failures||a.job_id-b.job_id);
  const signals=Object.freeze([
    ...(counts.supavisor_auth_timeouts>0?['SUPAVISOR_AUTHENTICATION_TIMEOUT']:[]),
    ...(counts.supavisor_checkout_failures>0?['SUPAVISOR_CONNECTION_CHECKOUT_FAILED']:[]),
    ...(counts.sqlstate_57014>0?['POSTGREST_STATEMENT_TIMEOUT']:[]),
    ...(counts.pgrst002>0?['POSTGREST_SCHEMA_CACHE_UNAVAILABLE']:[]),
    ...(counts.cron_startup_timeouts>0?['CRON_WORKER_STARTUP_TIMEOUT']:[]),
    'MANAGEMENT_SQL_CONNECTION_TIMEOUT','V180_KERNEL_SEAL_FAILED','PUBLIC_GOLD_UNAVAILABLE'
  ]);
  return Object.freeze({
    schema:SCHEMA,
    status:'PRODUCTION_INCIDENT_ACTIVE',
    commercial_launch:'NOT_CERTIFIED',
    probable_shared_issue:'DATABASE_CONNECTION_OR_RESOURCE_PRESSURE_POSSIBLE_NOT_PROVEN',
    project_ref:PROJECT,region:REGION,
    requested_window_start_utc:start,requested_window_end_utc:end,
    observation_completeness:'PARTIAL_SNAPSHOT_NOT_FULL_WINDOW_PROOF',
    latest_events:latest,counts,
    cron_job_hotspots:Object.freeze(hotspots),
    signals,
    acceptance:Object.freeze({
      management_sql_success:false,postgrest_schema_cache_stable:false,
      pg_cron_healthy:false,v180_two_sealed_success_receipts:false,
      public_gold_fresh:false,private_qa_passed:false,
      identity_end_to_end_verified:false,billing_entitlement_verified:false
    }),
    governance:Object.freeze({
      capital_permission:'0R',action_permitted:'WAIT',
      charge_automation:false,live_orders:false,cron_modified:false
    })
  });
}
export function supportPacket(assessment){
  if(assessment?.schema!==SCHEMA||assessment?.status!=='PRODUCTION_INCIDENT_ACTIVE')
    throw new Error('Invalid assessed incident');
  const c=assessment.counts;
  const lines=[
    '# Supabase Support Escalation | THE FATHER ANALYTICS',
    '',
    'Project ref: '+PROJECT+' | Region: '+REGION,
    'Requested observation window (UTC): '+assessment.requested_window_start_utc+' to '+assessment.requested_window_end_utc,
    'Important: these are read-only, partial aggregated snapshots, not complete event coverage or proof of recovery.',
    '',
    '## Confirmed symptoms (event categories can overlap)',
    '- Supavisor authentication timeouts: '+c.supavisor_auth_timeouts,
    '- Supavisor connection checkout failures: '+c.supavisor_checkout_failures,
    '- Supavisor log entries sampled: '+c.supavisor_events,
    '- PostgREST statement timeouts (57014): '+c.sqlstate_57014,
    '- PostgREST PGRST002 in this sample: '+c.pgrst002+' (zero in sample does not prove restored stability)',
    '- pg_cron job startup timeouts: '+c.cron_startup_timeouts,
    '- Independent read-only management SQL: connection timeout',
    '- Project performance advisors: query read timeout',
    '- Authenticated V180 kernel heartbeat: KERNEL_SEAL failure',
    '- Public Gold market data: HTTP 503, unavailable',
    '',
    '## Repeated pg_cron startup timeout IDs (investigate only, do not disable wholesale)',
    ...assessment.cron_job_hotspots.map(j=>'- Job '+j.job_id+': '+j.failures+' observed timeout entries; latest '+j.latest_event_at),
    '',
    '## Requested Supabase investigation',
    '1. Examine Postgres CPU, memory, disk I/O, max connections, waiting locks and query timing across the incident window.',
    '2. Check Supavisor backend authentication and connection checkout metrics; verify current pool mode/limits against Project Connect.',
    '3. Determine whether PostgREST schema introspection/caching is blocked by overloaded connections or long-running transactions.',
    '4. Inspect pg_cron worker startup contention by specific job ID and concurrent schedule; propose approved, scoped mitigation only.',
    '5. Confirm healthy direct management SQL, stable PostgREST reads, cron execution and two sealed V180 run receipts before declaring recovery.',
    '',
    '## Release safety',
    'Production preview may be Vercel READY, but full commercial launch is NOT CERTIFIED.',
    'No live trades, charges, credential changes, global cron shutdown or destructive SQL were authorized by this packet.',
    'Capital permission WAIT / 0R. Manual operator approval is required for provider changes.',
    'No customer data, raw logs, API keys, SQL connection strings or payment details appear in this report.'
  ];
  return lines.join('\n')+'\n';
}
