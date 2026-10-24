// V282: Pure, fail-closed admission policy for read-only public recovery diagnostics.
// Observed HTTP 2xx is NEVER authentication, database health, kernel proof, or launch permission.
export const RECOVERY_ORIGIN='https://thefatheranalytics.com';
export const RECOVERY_PATHS=Object.freeze({
 triage:'/api/public-recovery-triage',
 release:'/api/release-attestation',
 quota:'/api/quota-probe',
 edge:'/api/provider-edge-acceptance',
 state:'/api/autonomous-state',
 qa:'/api/autonomous-qa-matrix'
});
const isFresh=(v,now)=>{
 if(typeof v!=='string'||!v)return false;
 const at=Date.parse(v);
 return Number.isFinite(at)&&at<=now+5_000&&now-at>=0&&now-at<=180_000;
};
const validSha=x=>typeof x==='string'&&/^[0-9a-f]{40}$/.test(x);
export function assessRecoveryPreflight({triage,release}={},now=Date.now()){
 const r=release?.body??{},t=triage?.body??{};
 const releaseOK=release?.ok===true&&release?.status===200&&r.ok===true
  &&r.state==='PRODUCTION_SOURCE_VERIFIED'&&r.environment==='production'
  &&r.git_branch==='the-father-analytics-deploy'&&validSha(r.git_commit_sha)
  &&r.governance?.capital_permission==='0R';
 const triageOK=triage?.ok===true&&triage?.status===200&&t.ok===true
  &&isFresh(t.generated_at,now)&&t.checks?.readiness_source_current===true
  &&t.governance?.action_permitted==='WAIT'
  &&t.governance?.capital_permission==='0R'
  &&t.governance?.commercial_launch_certified===false;
 const incident=t.checks?.database_incident_reported===true
  ||t.state==='DATABASE INCIDENT REPORTED';
 const authTransport=t.checks?.auth_http?.transport_reachable===true
  &&t.checks?.auth_http?.state==='HTTP RESPONDED'
  &&t.checks?.auth_http?.http_status>=200
  &&t.checks?.auth_http?.http_status<300;
 const restTransport=t.checks?.postgrest_http?.transport_reachable===true
  &&Number.isInteger(t.checks?.postgrest_http?.http_status)
  &&t.checks.postgrest_http.http_status>=100
  &&t.checks.postgrest_http.http_status<=499;
 const safe=releaseOK&&triageOK&&!incident&&authTransport&&restTransport
  &&t.state==='PRIVATE CERTIFICATION NOT ESTABLISHED';
 const reason=!releaseOK?'RELEASE_PROVENANCE_UNVERIFIED'
  :!triageOK?'TRIAGE_FRESHNESS_OR_GOVERNANCE_UNVERIFIED'
  :incident?'DATABASE_INCIDENT_ACTIVE'
  :!authTransport?'AUTH_TRANSPORT_UNAVAILABLE'
  :!restTransport?'POSTGREST_TRANSPORT_UNAVAILABLE'
  :t.state!=='PRIVATE CERTIFICATION NOT ESTABLISHED'?'PRIVATE_READINESS_UNVERIFIED'
  :'READ_ONLY_DIAGNOSTICS_ADMITTED';
 return Object.freeze({admitted:safe,reason,
  release_verified:releaseOK,triage_current:triageOK,
  database_incident_reported:incident,
  auth_transport_observed:authTransport,rest_transport_observed:restTransport,
  login_verified:false,private_kernel_certified:false,
  commercial_launch_certified:false,capital_permission:'0R'});
}
const bounded=(v,max=100000)=>Number.isSafeInteger(v)&&v>=0&&v<=max?v:null;
const elapsed=x=>Number.isFinite(x?.latency_ms)&&x.latency_ms>=0
  ?Math.min(60_000,Math.round(x.latency_ms)):null;
const empty=Object.freeze({status:0,latency_ms:null,body:null,ok:false});
export function assessRecoveryDiagnostics({preflight,release,quota=empty,edge=empty,state=empty,qa=empty,
  requested=[]}={},now=Date.now()){
 if(!preflight||typeof preflight.admitted!=='boolean')throw new TypeError('preflight_required');
 const q=quota.body??{},e=edge.body??{},s=state.body??{},a=qa.body??{};
 const quotaClear=preflight.admitted&&quota.ok===true
  &&q.ok===true&&q.restricted===false&&q.canonical_upstream_ok===true
  &&q.upstream_status===200;
 const edgeVerified=preflight.admitted&&edge.ok===true&&e.ok===true
  &&e.state==='EXTERNAL_EDGE_PATH_VERIFIED'&&e.summary?.rate_limited===0
  &&e.summary?.server_errors===0;
 const blockers=Array.isArray(s.blockers)?s.blockers.filter(x=>[
  'EDGE_QUOTA_RESTRICTED','database_incident','runtime_baseline','auth_runtime'
 ].includes(x)).slice(0,8):[];
 const canonicalHealthy=quotaClear&&edgeVerified&&state.ok===true&&s.ok===true
  &&s.health?.edge_runtime!=='RESTRICTED_QUOTA'
  &&s.health?.production_smoke?.state==='FRESH'
  &&s.database_incident?.active!==true
  &&Array.isArray(s.blockers)&&s.blockers.length===0;
 const qaPass=canonicalHealthy&&qa.ok===true&&a.ok===true
  &&a.state==='PASS'&&Number.isInteger(a.summary?.total)&&a.summary.total>0
  &&Number.isInteger(a.summary?.passed)&&a.summary.passed===a.summary.total
  &&a.summary.failed===0;
 const publicDiagnosticPass=Boolean(canonicalHealthy&&qaPass);
 const outcome=!preflight.admitted?'RECOVERY_BLOCKED'
  :!quotaClear||!edgeVerified?'PROVIDER_REACHABILITY_UNVERIFIED'
  :!canonicalHealthy?'PRIVATE_STATE_OR_SMOKE_UNVERIFIED'
  :qaPass?'DIAGNOSTICS_PASSED_PRIVATE_CERTIFICATION_PENDING'
  :'PRIVATE_QA_UNVERIFIED';
 // 80 is the maximum for non-certifying diagnostics: a production certificate
 // must be evaluated independently from real Auth, kernel and ledger evidence.
 const progress=(Number(preflight.admitted)+Number(quotaClear)+Number(edgeVerified)
   +Number(canonicalHealthy)+Number(qaPass))*16;
 const known=new Set(Object.values(RECOVERY_PATHS));
 const sent=Array.isArray(requested)?requested.filter(v=>known.has(v)):[];
 return Object.freeze({
  ok:true,version:'v282-secure-recovery-admission-v1',checked_at:new Date(now).toISOString(),
  state:outcome,recovery_score:progress,recovery_score_meaning:'READ_ONLY_DIAGNOSTIC_PROGRESS_NOT_LAUNCH_SCORE',
  readiness:Object.freeze({
   public_diagnostics_pass:publicDiagnosticPass,
   private_kernel_certified:false,authenticated_login_certified:false,
   provider_payment_verified:false,commercial_launch_certified:false,
   database_recovered_certified:false,broker_quote_certified:false
  }),
  admission:preflight,
  diagnostics:Object.freeze({
   requests_sent:sent.length,
   expensive_private_requests_sent:sent.filter(x=>x===RECOVERY_PATHS.state||x===RECOVERY_PATHS.qa).length,
   expensive_private_probes_deferred:!canonicalHealthy,
   all_reads_anonymous:true,database_write_count:0,cron_changes:0
  }),
  evidence:Object.freeze({
   release:Object.freeze({verified:preflight.release_verified,
    status:bounded(release?.status,599)??0,
    commit:preflight.release_verified?release.body.git_commit_sha.slice(0,12):null}),
   triage:Object.freeze({fresh:preflight.triage_current,
    database_incident_reported:preflight.database_incident_reported,
    auth_transport_observed:preflight.auth_transport_observed,
    postgrest_transport_observed:preflight.rest_transport_observed}),
   quota:Object.freeze({clear:quotaClear,status:bounded(quota.status,599)??0,
    latency_ms:elapsed(quota)}),
   edge:Object.freeze({verified:edgeVerified,status:bounded(edge.status,599)??0,
    latency_ms:elapsed(edge)}),
   state:Object.freeze({healthy:canonicalHealthy,status:bounded(state.status,599)??0,
    restricted:s.health?.edge_runtime==='RESTRICTED_QUOTA',blockers:Object.freeze(blockers)}),
   qa:Object.freeze({pass:qaPass,status:bounded(qa.status,599)??0,
    total:bounded(a.summary?.total),passed:bounded(a.summary?.passed),failed:bounded(a.summary?.failed),
    state:qaPass?'PASS':'UNVERIFIED'}),
   // Read-only compatibility fields for the existing V142 visual panel. These
   // only mirror sanitized diagnostics and NEVER imply commercial readiness.
   live_quota_probe:Object.freeze({clear:quotaClear,status:bounded(quota.status,599)??0,
    latency_ms:elapsed(quota)}),
   external_edge_acceptance:Object.freeze({verified:edgeVerified,status:bounded(edge.status,599)??0,
    latency_ms:elapsed(edge),transport_passed:null,total:null}),
   canonical_state:Object.freeze({ok:canonicalHealthy,
    edge_runtime:canonicalHealthy?'HEALTHY':'UNVERIFIED',
    smoke_state:canonicalHealthy?'FRESH':'UNVERIFIED',smoke_age_minutes:null,blockers:Object.freeze(blockers)})
  }),
  divergence:Object.freeze({provider_recovery_evidence:quotaClear&&edgeVerified,
   canonical_edge_restriction_stale:quotaClear&&edgeVerified
     &&s.health?.edge_runtime==='RESTRICTED_QUOTA'}),
  actions:Object.freeze(!preflight.admitted
   ?['PRESERVE_INCIDENT_HOLD','REQUEST_PROVIDER_REVIEW','DO_NOT_RUN_PRIVATE_QA']
   :!quotaClear||!edgeVerified
    ?['VERIFY_PROVIDER_QUOTA_AND_EDGE','KEEP_PRIVATE_QA_DEFERRED']
    :!canonicalHealthy
     ?['VERIFY_PRIVATE_STATE_AND_SEALED_SMOKE','KEEP_PRIVATE_QA_DEFERRED']
     :qaPass?['REQUIRE_INDEPENDENT_KERNEL_AUTH_AND_BILLING_CERTIFICATION']
      :['REVIEW_PRIVATE_QA_EVIDENCE','KEEP_LAUNCH_LOCKED']),
  governance:Object.freeze({action_permitted:'WAIT',capital_permission:'0R',
   live_order_routing:false,automatic_policy_promotion:false,
   recovery_evidence_can_unlock_capital:false,commerce_permitted:false}),
  truth_label:'SANITIZED_ANONYMOUS_RECOVERY_DIAGNOSTICS_NO_PRIVATE_CERTIFICATION'
 });
}
