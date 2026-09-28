const VERSION='v113.2-autonomous-regression-matrix-v7';
const BASE=process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:'https://thefatheranalytics.com';

async function fetchAny(path,timeout=10000){
  const started=Date.now();
  try{
    const r=await fetch(BASE+path,{headers:{Accept:'application/json,text/html','User-Agent':'THE-FATHER-ANALYTICS/113.0'},cache:'no-store',signal:AbortSignal.timeout(timeout)});
    const ct=r.headers.get('content-type')||'';
    const body=ct.includes('application/json')?await r.json().catch(()=>null):await r.text().catch(()=>null);
    return {ok:r.ok,status:r.status,latency_ms:Date.now()-started,body};
  }catch(error){return {ok:false,status:0,latency_ms:Date.now()-started,body:null,error:String(error).slice(0,160)}}
}
function result(name,pass,detail,latency_ms){return {name,pass:!!pass,detail,latency_ms}}
function positive(v){const n=Number(v);return Number.isFinite(n)&&n>0}
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'})}
  const [home,gold,auto,day,quality,selftest,tournament,shadow,quota,v79,v81,v82,v83,v83self,mission]=await Promise.all([
    fetchAny('/'),
    fetchAny('/gold-live/'),
    fetchAny('/api/autonomous-state'),
    fetchAny('/api/gold-day-state'),
    fetchAny('/api/data-quality-sentinel'),
    fetchAny('/api/data-quality-sentinel?selftest=1'),
    fetchAny('/api/research-model-tournament'),
    fetchAny('/api/shadow-market-snapshot'),
    fetchAny('/api/quota-probe'),
    fetchAny('/api/gold-liquidity-state-machine'),
    fetchAny('/api/gold-mtf-zones'),
    fetchAny('/api/gold-mtf-confluence'),
    fetchAny('/api/gold-breakout-acceptance'),
    fetchAny('/api/gold-breakout-acceptance?selftest=1'),
    fetchAny('/api/mission-brief',15000)
  ]);
  const tests=[];
  tests.push(result('homepage_http',home.status===200,`status=${home.status}`,home.latency_ms));
  tests.push(result('gold_surface_http',gold.status===200,`status=${gold.status}`,gold.latency_ms));
  tests.push(result('v70_firewall',auto.body?.governance?.action_permitted==='WAIT'&&auto.body?.governance?.capital_permission==='0R',
    `action=${auto.body?.governance?.action_permitted}, capital=${auto.body?.governance?.capital_permission}`,auto.latency_ms));
  tests.push(result('v75_no_zero_ohlc',day.body?.ok===true&&positive(day.body?.current?.open)&&positive(day.body?.current?.high)&&positive(day.body?.current?.low)&&positive(day.body?.current?.price)&&positive(day.body?.previous?.high)&&positive(day.body?.previous?.low),
    `current=${JSON.stringify(day.body?.current??null)}, previous_high=${day.body?.previous?.high}, previous_low=${day.body?.previous?.low}`,day.latency_ms));
  tests.push(result('v75_shadow_only',day.body?.governance?.canonical===false&&day.body?.governance?.action_permitted==='WAIT'&&day.body?.governance?.capital_permission==='0R',
    `canonical=${day.body?.governance?.canonical}, action=${day.body?.governance?.action_permitted}, capital=${day.body?.governance?.capital_permission}`,day.latency_ms));
  tests.push(result('v76_live_gate',quality.body?.state==='PASS'||quality.body?.state==='PASS_WITH_WARNINGS',
    `state=${quality.body?.state}, critical=${quality.body?.counts?.critical}`,quality.latency_ms));
  tests.push(result('v76_regression_quarantine',selftest.body?.state==='QUARANTINE'&&selftest.body?.self_test?.passed===true,
    `state=${selftest.body?.state}, passed=${selftest.body?.self_test?.passed}`,selftest.latency_ms));
  tests.push(result('v77_shadow_only',tournament.body?.governance?.canonical===false&&tournament.body?.governance?.action_permitted==='WAIT'&&tournament.body?.governance?.capital_permission==='0R'&&tournament.body?.governance?.automatic_model_promotion===false,
    `canonical=${tournament.body?.governance?.canonical}, promotion=${tournament.body?.governance?.automatic_model_promotion}`,tournament.latency_ms));
  tests.push(result('shadow_feed_firewall',shadow.body?.governance?.canonical===false&&shadow.body?.governance?.action_permitted==='WAIT'&&shadow.body?.governance?.capital_permission==='0R',
    `canonical=${shadow.body?.governance?.canonical}, action=${shadow.body?.governance?.action_permitted}`,shadow.latency_ms));
  tests.push(result('quota_probe_truthful',quota.body?.ok===true&&typeof quota.body?.restricted==='boolean',
    `restricted=${quota.body?.restricted}, upstream=${quota.body?.upstream_status}`,quota.latency_ms));
  tests.push(result('v79_state_machine_firewall',v79.body?.ok===true&&v79.body?.governance?.canonical===false&&v79.body?.governance?.action_permitted==='WAIT'&&v79.body?.governance?.capital_permission==='0R',
    `phase=${v79.body?.state?.phase}, action=${v79.body?.governance?.action_permitted}`,v79.latency_ms));
  tests.push(result('v81_mtf_zone_integrity',v81.body?.ok===true&&Array.isArray(v81.body?.zones)&&v81.body.zones.length===5&&v81.body?.governance?.action_permitted==='WAIT',
    `zones=${v81.body?.zones?.length}, composite=${v81.body?.composite?.state}`,v81.latency_ms));
  tests.push(result('v82_confluence_firewall',v82.body?.ok===true&&v82.body?.governance?.canonical===false&&v82.body?.governance?.automatic_execution===false&&v82.body?.governance?.capital_permission==='0R',
    `tension=${v82.body?.confluence?.tension}, capital=${v82.body?.governance?.capital_permission}`,v82.latency_ms));
  tests.push(result('v83_breakout_detector',v83.body?.ok===true&&v83.body?.governance?.canonical===false&&v83.body?.governance?.action_permitted==='WAIT',
    `state=${v83.body?.dominant_state}, quality=${v83.body?.downside?.quality_score ?? v83.body?.upside?.quality_score ?? 'n/a'}`,v83.latency_ms));
  tests.push(result('v83_regression_selftest',v83self.body?.ok===true&&v83self.body?.self_test?.passed===true,
    `accepted=${v83self.body?.self_test?.accepted_state}, failed=${v83self.body?.self_test?.failed_state}`,v83self.latency_ms));

  const q=mission.body?.quant_accountability??{};
  const anchor=q?.external_anchor??{};
  const health=mission.body?.autonomous_health??{};
  const release=mission.body?.release_integrity??{};
  tests.push(result('v106_snapshot_fingerprints',q?.provenance_manifest?.state==='ALL_FINGERPRINTED',
    `state=${q?.provenance_manifest?.state}, fingerprinted=${q?.provenance_manifest?.counts?.fingerprinted ?? 'n/a'}`,mission.latency_ms));
  tests.push(result('v107_receipt_chain',q?.provenance_receipt_ledger?.state==='HASH_CHAIN_VERIFIED',
    `state=${q?.provenance_receipt_ledger?.state}, failures=${q?.provenance_receipt_ledger?.counts?.chain_link_failures ?? 'n/a'}, mode=${q?.provenance_receipt_source_mode ?? 'n/a'}`,mission.latency_ms));
  tests.push(result('v108_server_attestation',q?.provenance_attestation?.state==='SERVER_ATTESTATION_VERIFIED',
    `state=${q?.provenance_attestation?.state}, failed=${q?.provenance_attestation?.counts?.failed_attestations ?? 'n/a'}, mode=${q?.provenance_attestation_source_mode ?? 'n/a'}`,mission.latency_ms));
  tests.push(result('v109_key_lifecycle',q?.attestation_key_lifecycle?.state==='KEY_LIFECYCLE_HEALTHY',
    `state=${q?.attestation_key_lifecycle?.state}, missing=${q?.attestation_key_lifecycle?.counts?.missing_vault_keys ?? 'n/a'}, mode=${q?.attestation_key_lifecycle_source_mode ?? 'n/a'}`,mission.latency_ms));
  const provenanceModes=[
    q?.provenance_receipt_source_mode,
    q?.provenance_attestation_source_mode,
    q?.attestation_key_lifecycle_source_mode
  ];
  const allowedProvenanceModes=['POSTGREST_RPC','VERIFIED_SNAPSHOT_FALLBACK','CHECKPOINT_VERIFIED_SURVIVOR'];
  const bridgeUsed=provenanceModes.includes('CHECKPOINT_VERIFIED_SURVIVOR');
  tests.push(result('v1131_provenance_survivor_truth',
    provenanceModes.every(mode=>allowedProvenanceModes.includes(String(mode)))
      &&(!bridgeUsed||q?.provenance_checkpoint?.state==='GLOBAL_CHECKPOINT_VERIFIED'),
    `modes=${provenanceModes.join(',')}, checkpoint=${q?.provenance_checkpoint?.state}`,mission.latency_ms));
  tests.push(result('v110_checkpoint_chain',q?.provenance_checkpoint?.state==='GLOBAL_CHECKPOINT_VERIFIED',
    `state=${q?.provenance_checkpoint?.state}, broken=${q?.provenance_checkpoint?.counts?.chain_link_failures ?? 'n/a'}`,mission.latency_ms));
  tests.push(result('v111_external_root',anchor?.root_state==='MATCH'||anchor?.root_state==='PENDING_NEWER_CHECKPOINT',
    `root_state=${anchor?.root_state}, roots_match=${anchor?.comparison?.roots_match}`,mission.latency_ms));
  tests.push(result('v112_anchor_heartbeat',anchor?.heartbeat_state==='FRESH'&&Number(anchor?.age_minutes)<=90,
    `heartbeat=${anchor?.heartbeat_state}, age=${anchor?.age_minutes}m, checks=${anchor?.verification_count ?? 'n/a'}`,mission.latency_ms));
  tests.push(result('v112_capital_firewall',q?.publication_gates?.capital_permission==='0R'&&mission.body?.governance?.capital_permission==='0R',
    `quant=${q?.publication_gates?.capital_permission}, mission=${mission.body?.governance?.capital_permission}`,mission.latency_ms));
  tests.push(result('v113_health_orchestrator',health?.ok===true&&['NOMINAL','GUARDED'].includes(String(health?.state))&&health?.governance?.action_permitted==='WAIT'&&health?.governance?.capital_permission==='0R',
    `state=${health?.state}, readiness=${health?.readiness_pct ?? 'n/a'}%, critical=${health?.summary?.critical_failures ?? 'n/a'}, capital=${health?.governance?.capital_permission}`,mission.latency_ms));
  tests.push(result('v1132_release_integrity',release?.ok===true&&release?.state==='PRODUCTION_SOURCE_VERIFIED'&&release?.environment==='production'&&release?.git_branch==='the-father-analytics-deploy'&&/^[a-f0-9]{40}$/i.test(String(release?.git_commit_sha??''))&&release?.governance?.capital_permission==='0R',
    `state=${release?.state}, env=${release?.environment}, branch=${release?.git_branch}, sha=${release?.git_commit_short??'withheld'}, capital=${release?.governance?.capital_permission}`,mission.latency_ms));

  const passed=tests.filter(x=>x.pass).length;
  const failed=tests.length-passed;
  const state=failed===0?'PASS':failed<=2?'DEGRADED':'FAIL';
  const maxLatency=Math.max(...tests.map(x=>Number(x.latency_ms)||0));
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
    ok:failed===0,
    version:VERSION,
    checked_at:new Date().toISOString(),
    state,
    summary:{passed,failed,total:tests.length,max_latency_ms:maxLatency},
    tests,
    invariants:{
      canonical_execution_permission:'UNCHANGED',
      action_permitted:'WAIT',
      capital_permission:'0R',
      automatic_promotion:false
    }
  });
}