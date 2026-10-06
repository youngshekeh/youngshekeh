const ORIGIN='https://thefatheranalytics.com';
const SUPA='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1';

async function read(url,timeout=14000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(url,{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-Q4-V8/1.0'},
      cache:'no-store',
      signal:controller.signal,
      redirect:'error'
    });
    const body=await response.json().catch(()=>null);
    return response.ok&&body&&typeof body==='object'&&!Array.isArray(body)?body:null;
  }catch{return null}finally{clearTimeout(timer)}
}

function finite(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function clean(value,fallback='WITHHELD'){return String(value??fallback)}
function yes(value){return value===true}
function rounded(value,digits=2){
  const n=finite(value);
  if(n===null)return null;
  const p=10**digits;
  return Math.round(n*p)/p;
}
function stableHashInput(parts){
  return parts.map(v=>String(v??'NULL')).join('|');
}
async function sha256(text){
  const bytes=new TextEncoder().encode(text);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Machine','Q4-CANONICAL-CONTRACT-ORCHESTRATOR-V8');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }

  const [v7,signalContract,exposureFirewall,dailyLedger,performanceBoard]=await Promise.all([
    read(ORIGIN+'/api/q4-machine-v7',16000),
    read(SUPA+'/public-gold-signal-contract'),
    read(SUPA+'/public-gold-exposure-firewall'),
    read(SUPA+'/public-daily-contract-ledger'),
    read(SUPA+'/public-contract-performance-board')
  ]);

  const sourceHealth={
    v7:v7?.ok===true,
    signal_contract:signalContract?.ok===true,
    exposure_firewall:exposureFirewall?.ok===true,
    daily_contract_ledger:dailyLedger?.ok===true,
    contract_performance:performanceBoard?.ok===true
  };

  const qualification=v7?.qualification??{};
  const permission=v7?.current_governed_state?.permission_compiler??{};
  const desk=v7?.current_governed_state?.execution_desk??{};
  const prospective=v7?.prospective_ledger??{};
  const contractPolicy=signalContract?.policy??{};
  const exposurePolicy=exposureFirewall?.policy??{};
  const exposure=exposureFirewall?.exposure??{};

  const prerequisiteReviewable=
    sourceHealth.v7&&
    clean(qualification?.state)==='PROSPECTIVE_CONTRACT_REVIEWABLE'&&
    finite(qualification?.prerequisite_pass_count)===finite(qualification?.prerequisite_total);

  const authoritativePermissionPositive=
    clean(permission?.final_action)==='EVALUATE'&&
    clean(permission?.final_permission)!=='0R'&&
    (finite(permission?.final_r)??0)>0;

  const contractGateOpen=clean(permission?.contract_gate)==='OPEN';
  const firewallGateOpen=clean(permission?.firewall_gate)==='OPEN';
  const realBrokerQuote=yes(desk?.real_broker_quote);
  const exposureCapacity=(finite(exposure?.remaining_r)??0)>0;
  const prospectivePolicyReady=
    sourceHealth.signal_contract&&
    yes(signalContract?.governance?.prospective_only)&&
    yes(signalContract?.governance?.historical_geometry_not_backfilled)&&
    yes(signalContract?.governance?.directional_validation_required);
  const firewallPolicyReady=
    sourceHealth.exposure_firewall&&
    clean(exposurePolicy?.aggregation_rule)==='MAX_MEMBER_R_NOT_SUM'&&
    yes(exposurePolicy?.manual_review_required)===true;

  const gates=[
    {
      key:'v7_prerequisites_reviewable',
      passed:prerequisiteReviewable,
      evidence:clean(qualification?.state),
      requirement:'All V7 prospective prerequisites must be reviewable before a contract candidate may be prepared.'
    },
    {
      key:'authoritative_permission_positive',
      passed:authoritativePermissionPositive,
      evidence:clean(permission?.final_action)+' · '+clean(permission?.final_permission),
      requirement:'Only the authoritative permission compiler may admit positive risk.'
    },
    {
      key:'contract_gate_open',
      passed:contractGateOpen,
      evidence:clean(permission?.contract_gate),
      requirement:'The authoritative contract gate must be open.'
    },
    {
      key:'firewall_gate_open',
      passed:firewallGateOpen,
      evidence:clean(permission?.firewall_gate),
      requirement:'The authoritative firewall gate must be open.'
    },
    {
      key:'real_broker_quote_present',
      passed:realBrokerQuote,
      evidence:realBrokerQuote?'REAL_ACCOUNT_REFERENCE':'NO_REAL_ACCOUNT_REFERENCE',
      requirement:'A fresh real-account execution reference must exist before a contract candidate can be execution-reviewable.'
    },
    {
      key:'prospective_contract_policy_ready',
      passed:prospectivePolicyReady,
      evidence:sourceHealth.signal_contract?clean(contractPolicy?.version):'SOURCE_UNAVAILABLE',
      requirement:'The canonical signal-contract policy must be prospective-only and forbid historical geometry backfill.'
    },
    {
      key:'exposure_firewall_policy_ready',
      passed:firewallPolicyReady,
      evidence:sourceHealth.exposure_firewall?clean(exposurePolicy?.version):'SOURCE_UNAVAILABLE',
      requirement:'Canonical exposure deduplication and manual-review firewall policy must be active.'
    },
    {
      key:'exposure_capacity_available',
      passed:exposureCapacity,
      evidence:sourceHealth.exposure_firewall?String(finite(exposure?.remaining_r)??0)+'R remaining':'SOURCE_UNAVAILABLE',
      requirement:'Remaining canonical Gold risk capacity must be positive.'
    }
  ];

  const allGatesPass=gates.every(g=>g.passed);
  const sourceUnknown=Object.values(sourceHealth).filter(v=>!v).length;
  const candidateState=sourceUnknown>0
    ?'SOURCE_GATED'
    :allGatesPass
      ?'CANDIDATE_PREPARATION_REVIEWABLE'
      :'BLOCKED';

  const acceptedSide=qualification?.accepted_side??null;
  const candidateRiskR=Math.min(
    finite(permission?.final_r)??0,
    finite(exposure?.remaining_r)??0,
    finite(exposurePolicy?.max_live_gold_r)??0.25
  );

  const candidateFingerprintInput=stableHashInput([
    acceptedSide,
    permission?.final_action,
    permission?.final_permission,
    permission?.final_r,
    permission?.data_gate,
    permission?.engine_gate,
    permission?.contract_gate,
    permission?.firewall_gate,
    prospective?.latest_payload_sha256,
    contractPolicy?.version,
    exposurePolicy?.version,
    exposure?.open_canonical_objects,
    exposure?.remaining_r
  ]);
  const candidateSha=await sha256(candidateFingerprintInput);
  const candidateId='Q4V8-'+candidateSha.slice(0,16).toUpperCase();

  const blocked=gates.filter(g=>!g.passed);

  const candidate=allGatesPass?{
    candidate_id:candidateId,
    sha256:candidateSha,
    state:'PREPARED_FOR_AUTHORITATIVE_REVIEW',
    direction:acceptedSide,
    requested_r:rounded(candidateRiskR,4),
    max_policy_r:finite(exposurePolicy?.max_live_gold_r),
    remaining_r_before_review:finite(exposure?.remaining_r),
    source_snapshot_sha256:prospective?.latest_payload_sha256??null,
    contract_policy_version:contractPolicy?.version??null,
    exposure_policy_version:exposurePolicy?.version??null,
    persistence:'EPHEMERAL_CANDIDATE_ONLY',
    admission_authority:'EXISTING_CANONICAL_CONTRACT_AND_EXPOSURE_SYSTEM',
    immutable_fields_required:[
      'direction',
      'entry_reference',
      'invalidation',
      'primary_target',
      'risk_r',
      'source_market_time',
      'source_snapshot_sha256',
      'policy_versions'
    ]
  }:null;

  const geometryStatus=sourceHealth.signal_contract?{
    prospective_total:finite(signalContract?.coverage?.prospective_total),
    contract_ready_n:finite(signalContract?.coverage?.contract_ready_n),
    contract_blocked_n:finite(signalContract?.coverage?.contract_blocked_n),
    historical_total:finite(signalContract?.coverage?.historical_total),
    historical_latest_state:signalContract?.latest?.F1?.contract_state??signalContract?.latest?.S1?.contract_state??null
  }:null;

  return res.status(200).json({
    ok:true,
    version:'q4-machine-v8',
    generated_at:new Date().toISOString(),
    orchestrator:{
      state:candidateState,
      passed_gate_count:gates.filter(g=>g.passed).length,
      total_gate_count:gates.length,
      blocked_gate_count:blocked.length,
      gates,
      primary_blocker:blocked[0]??null
    },
    candidate,
    canonical_contract_state:{
      signal_contract_policy:contractPolicy?.version??null,
      prospective_contracts:geometryStatus,
      daily_contract_count:finite(dailyLedger?.contract_count),
      daily_open_count:finite(dailyLedger?.open_count),
      resolved_120m_count:finite(dailyLedger?.resolved_120m_count),
      performance_state:performanceBoard?.performance_state??'WITHHELD',
      performance_accuracy_pct:finite(performanceBoard?.overall_120m?.accuracy_pct)
    },
    exposure_firewall:{
      policy_version:exposurePolicy?.version??null,
      max_live_gold_r:finite(exposurePolicy?.max_live_gold_r),
      open_canonical_objects:finite(exposure?.open_canonical_objects),
      admitted_objects:finite(exposure?.admitted_objects),
      blocked_objects:finite(exposure?.blocked_objects),
      allocated_r:finite(exposure?.allocated_r),
      remaining_r:finite(exposure?.remaining_r),
      aggregation_rule:exposurePolicy?.aggregation_rule??null,
      manual_review_required:yes(exposurePolicy?.manual_review_required)
    },
    admission_firewall:{
      v8_may_prepare_candidate:true,
      v8_may_persist_candidate:false,
      v8_may_admit_exposure:false,
      v8_may_open_contract_gate:false,
      v8_may_open_firewall_gate:false,
      v8_may_grant_capital:false,
      v8_may_place_orders:false,
      historical_retrofit:false,
      human_review_required:true,
      rule:'V8 can fingerprint and prepare an ephemeral candidate only after every upstream gate passes. Admission remains solely with the existing canonical contract, exposure firewall, and permission systems.'
    },
    source_health:{
      available_count:Object.values(sourceHealth).filter(Boolean).length,
      total_count:Object.keys(sourceHealth).length,
      sources:sourceHealth
    },
    next_action:blocked[0]?{
      gate:blocked[0].key,
      requirement:blocked[0].requirement,
      evidence:blocked[0].evidence
    }:{
      gate:'AUTHORITATIVE_ADMISSION_REVIEW',
      requirement:'Submit the ephemeral candidate to the existing canonical admission workflow without changing any gate or permission.',
      evidence:candidateId
    },
    decision_compression:{
      what_changed:'V8 evaluated '+String(gates.filter(g=>g.passed).length)+'/'+String(gates.length)+' canonical contract preparation gates.',
      what_matters_now:blocked[0]
        ?blocked[0].key+' is blocking candidate preparation: '+blocked[0].evidence+'.'
        :'An ephemeral candidate is prepared for authoritative review; it is not admitted exposure.',
      action_permitted:'WAIT',
      capital_permission:'0R'
    },
    governance:{
      research_only:true,
      prospective_only:true,
      no_retroactive_geometry:true,
      no_self_admission:true,
      no_self_persistence:true,
      automatic_execution:false,
      action_permitted:'WAIT',
      capital_permission:'0R'
    }
  });
}
