// V268 public-only production smoke admission. This can NEVER certify trading or paid access.
// Fixed read-only public sources; source timestamps and release provenance must be independently valid.
export const V268_ORIGIN='https://thefatheranalytics.com';
export const V268_ENDPOINTS=Object.freeze({
 release:'/api/release-attestation',
 page:'/status',
 markets:'/api/market-feed?feed=public-live-markets-api',
 reference:'/api/public-market-reference',
 quarterly:'/api/public-quarterly-zones',
 recovery:'/api/public-recovery-triage'
});
export const V268_EXPECTED_BRANCH='the-father-analytics-deploy';
const FRESH_MS=15*60_000, BTC_FRESH_MS=10*60_000;
const present=(s)=>typeof s==='string'&&s.length>0;
const current=(stamp,now,ttl)=>{
 const t=Date.parse(String(stamp??''));
 return Number.isFinite(t)&&t<=now+60_000&&now-t>=-60_000&&now-t<=ttl;
};
const received=(item)=>item?.status===200&&item?.body?.ok===true;
const hasSafety=(p)=>p?.action_permitted==='WAIT'&&p?.capital_permission==='0R';
const status=(item)=>Number.isInteger(item?.status)?item.status:0;
export function assessV268PublicRelease(probes,{expectedSha,now=Date.now()}={}){
 const blockers=[],advisories=[];
 const expected=typeof expectedSha==='string'&&/^[a-f0-9]{40}$/.test(expectedSha);
 if(!expected)blockers.push('EXPECTED_PRODUCTION_COMMIT_UNVERIFIED');
 const release=probes?.release,market=probes?.markets;
 const r=release?.body,m=market?.body;
 const correctCommit=expected&&received(release)&&r?.state==='PRODUCTION_SOURCE_VERIFIED'
  &&r.environment==='production'&&r.git_branch===V268_EXPECTED_BRANCH
  &&r.git_commit_sha===expectedSha&&r.expected_production_branch===V268_EXPECTED_BRANCH
  &&r.governance?.metadata_only===true
  &&r.governance?.release_metadata_can_grant_capital===false
  &&r.governance?.automatic_execution===false
  &&r.governance?.capital_permission==='0R';
 if(!correctCommit)blockers.push('PRODUCTION_COMMIT_NOT_ATTESTED');
 if(status(probes?.page)!==200)blockers.push('PUBLIC_STATUS_PAGE_UNREACHABLE');
 const rows=Array.isArray(m?.assets)?m.assets:[];
 const gold=rows.find(x=>x?.key==='gold');
 const btc=rows.find(x=>x?.key==='bitcoin');
 const marketsSafe=received(m)&&current(m.generated_at,now,FRESH_MS)
  &&hasSafety(m.decision)&&m.decision?.action==='WAIT'
  &&present(m.market_status)&&gold&&gold.capital_permission==='0R'
  &&typeof gold.price==='number'&&Number.isFinite(gold.price)&&gold.price>0
  &&typeof btc?.price==='number'&&Number.isFinite(btc.price)&&btc.price>0
  &&current(btc.market_time,now,BTC_FRESH_MS)
  &&(m.market_status!=='MARKET_CLOSED'
   ||(gold.action==='WAIT'&&gold.state==='MARKET_CLOSED'));
 if(!marketsSafe)blockers.push('PUBLIC_MARKET_FRESHNESS_OR_GOVERNANCE_NOT_VERIFIED');
 const ref=probes?.reference;
 const referenceSafe=received(ref)&&ref.body.reference_only===true
  &&ref.body.not_for_trade_execution===true
  &&hasSafety(ref.body.governance);
 if(status(ref)===200&&!referenceSafe)blockers.push('PUBLIC_REFERENCE_UNSAFE');
 if(!referenceSafe)advisories.push('INDEPENDENT_REFERENCE_NOT_VERIFIED');
 const quarter=probes?.quarterly;
 const zone=quarter?.body;
 const assets=zone?.assets&&typeof zone.assets==='object'?Object.values(zone.assets).filter(Boolean):[];
 const quarterlySafe=received(quarter)&&zone.reference_only===true
  &&zone.not_for_trade_execution===true&&assets.length>0
  &&assets.every(a=>a?.is_actual_orderbook_liquidity===false
   &&a?.source_rights==='COMMERCIAL_REDISTRIBUTION_NOT_VERIFIED'
   &&hasSafety(a?.governance));
 if(status(quarter)===200&&!quarterlySafe)blockers.push('QUARTERLY_RESEARCH_POLICY_UNSAFE');
 if(!quarterlySafe)advisories.push('QUARTERLY_RESEARCH_NOT_VERIFIED');
 const recovery=probes?.recovery;
 const p=recovery?.body;
 const recoverySafe=received(recovery)
  &&p.private_actions_executed===0&&p.database_jobs_modified===0
  &&hasSafety(p.governance)
  &&p.governance?.live_order_submission_enabled===false
  &&p.governance?.commercial_launch_certified===false;
 if(status(recovery)===200&&!recoverySafe)blockers.push('RECOVERY_READ_ONLY_POLICY_UNSAFE');
 if(!recoverySafe)advisories.push('PRIVATE_RECOVERY_STATUS_UNVERIFIED');
 const incidentReported=recoverySafe&&p.state==='DATABASE INCIDENT REPORTED'
  &&p.checks?.readiness_source_current===true&&p.checks?.database_incident_reported===true;
 return Object.freeze({
  version:'v268-public-release-smoke-v1',
  state:blockers.length===0?'PUBLIC_RESEARCH_ACCEPTED_COMMERCIAL_UNVERIFIED':'PUBLIC_RESEARCH_ADMISSION_FAILED',
  public_research_pass:blockers.length===0,
  // Even a fully green public smoke is not a proof of database, broker or merchant readiness.
  commercial_launch_certified:false,private_kernel_certified:false,broker_quote_certified:false,
  trading:'WAIT / 0R',blockers:Object.freeze(blockers),advisories:Object.freeze(advisories),
  checks:Object.freeze({
   production_commit:correctCommit,status_page:status(probes?.page)===200,
   governed_market_feed:Boolean(marketsSafe),bitcoin_receipt_current:Boolean(btc&&current(btc.market_time,now,BTC_FRESH_MS)),
   independent_reference:referenceSafe,quarterly_research:quarterlySafe,
   recovery_read_only:recoverySafe,database_incident_reported:incidentReported
  }),
  response_codes:Object.freeze(Object.fromEntries(Object.keys(V268_ENDPOINTS)
   .map(key=>[key,status(probes?.[key])]))),
  expected_commit_verified:expected,verified_sha:correctCommit?expectedSha:null
 });
}
