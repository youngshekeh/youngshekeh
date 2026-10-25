// V289: strict smoke evidence admission. This cannot grant market, payment,
// kernel or capital certification. It only classifies bounded observations.
export const SMOKE_REQUIRED=Object.freeze([
  ['public-v55-executive-market-board','public_core',200],
  ['public-v50-production-integrity','public_core',200],
  ['public-app-config','public_core',200],
  ['member-session','auth_boundary',401],
  ['owner-launch-readiness','auth_boundary',401],
  ['enterprise-client-status','auth_boundary',401],
  ['gold-live-snapshot-store','governed_store',200],
  ['live-markets-snapshot-store','governed_store',200],
  ['publication-store','governed_store',200]
]);
export const SMOKE_SHIELD_MAX_AGE_MS=120000;
export const SMOKE_HOLD=Object.freeze({
  action_permitted:'WAIT',capital_permission:'0R',automatic_execution:false,
  live_order_submission_enabled:false,paid_entitlement_certified:false,
  private_kernel_certified:false
});
export function assessSmokeShield(body,now=Date.now()){
  if(!body||body.ok!==true||body.incident_active!==false)
    return Object.freeze({admitted:false,reason:'INCIDENT_NOT_CLEARED'});
  const stamp=Date.parse(String(body.generated_at||''));
  if(!Number.isFinite(stamp)||stamp>now+5000||now-stamp>SMOKE_SHIELD_MAX_AGE_MS)
    return Object.freeze({admitted:false,reason:'INCIDENT_EVIDENCE_STALE'});
  if(body.postgrest!=='ONLINE'
     ||body.control?.default_database_reads!=='ALLOWED_WITH_BOUNDS')
    return Object.freeze({admitted:false,reason:'DATABASE_READS_NOT_VERIFIED'});
  return Object.freeze({admitted:true,reason:'BOUNDED_SMOKE_ADMITTED'});
}
export function assessSmokeProbes(probes){
  const observed=Array.isArray(probes)?probes:[];
  const byPath=new Map();
  for(const p of observed){
    if(!p||typeof p.path!=='string'||byPath.has(p.path))
      return Object.freeze({ok:false,passed:0,total:SMOKE_REQUIRED.length,failed:SMOKE_REQUIRED.length,p95_ms:0,reason:'MALFORMED_PROBES'});
    byPath.set(p.path,p);
  }
  if(byPath.size!==SMOKE_REQUIRED.length)
    return Object.freeze({ok:false,passed:0,total:SMOKE_REQUIRED.length,failed:SMOKE_REQUIRED.length,p95_ms:0,reason:'INCOMPLETE_PROBES'});
  let passed=0;
  for(const [path,kind,status] of SMOKE_REQUIRED){
    const p=byPath.get(path);
    if(p?.kind===kind && p?.ok===true && p?.http_status===status
       && Number.isFinite(p.ms) && p.ms>=0)passed++;
  }
  const times=observed.map(p=>Number.isFinite(p.ms)&&p.ms>=0?p.ms:0).sort((a,b)=>a-b);
  return Object.freeze({ok:passed===SMOKE_REQUIRED.length,
    passed,total:SMOKE_REQUIRED.length,failed:SMOKE_REQUIRED.length-passed,
    p95_ms:Math.round(times[Math.ceil(times.length*.95)-1]||0),
    reason:passed===SMOKE_REQUIRED.length?'ALL_PROBES_VERIFIED':'PROBE_FAILURES'});
}

// API keys are opaque credentials, not identity JWTs. Never place
// sb_secret_* in Authorization: Bearer. Gateway service routing uses apikey.
export function privilegedRestHeaders(key){
  if(typeof key!=='string'||key.length<20)throw new Error('server_credential_invalid');
  if(/^sb_secret_[A-Za-z0-9_-]+$/.test(key))return Object.freeze({apikey:key});
  if(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key))
    return Object.freeze({apikey:key,Authorization:'Bearer '+key});
  throw new Error('server_credential_invalid');
}
