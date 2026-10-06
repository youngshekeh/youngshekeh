const ORIGIN='https://thefatheranalytics.com';

async function read(path,timeout=16000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(ORIGIN+path,{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-Q4-V11/1.0'},
      cache:'no-store',
      signal:controller.signal,
      redirect:'error'
    });
    const body=await response.json().catch(()=>null);
    return response.ok&&body&&typeof body==='object'&&!Array.isArray(body)?body:null;
  }catch{return null}finally{clearTimeout(timer)}
}

function clean(value,fallback='WITHHELD'){return String(value??fallback)}
function finite(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function clamp(value,min=0,max=100){return Math.max(min,Math.min(max,value))}

function addStep(steps,key,label,passed,state,next_action,source){
  steps.push({key,label,passed,state,next_action,source});
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Machine','Q4-READINESS-CONVERGENCE-V11');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }

  const [v8,v9,v10]=await Promise.all([
    read('/api/q4-machine-v8'),
    read('/api/q4-machine-v9'),
    read('/api/q4-machine-v10')
  ]);

  const sourceHealth={
    contract_orchestrator:v8?.ok===true,
    readiness_watch:v9?.ok===true,
    broker_reference:v10?.ok===true
  };

  const broker=v10?.broker_reference??{};
  const brokerVerification=v10?.verification??{};
  const orchestrator=v8?.orchestrator??{};
  const watch=v9?.watch??{};
  const readiness=v9?.readiness_state??{};

  const brokerSourceConnected=broker?.source_connected===true;
  const brokerQuoteReady=broker?.reference_grade==='READ_ONLY_BROKER_MARKET_REFERENCE_VERIFIED';
  const v7Reviewable=readiness?.v7_upstream_reviewable===true;
  const permissionPositive=
    clean(readiness?.permission?.final_action)==='EVALUATE'&&
    clean(readiness?.permission?.final_permission)!=='0R'&&
    (finite(readiness?.permission?.final_r)??0)>0;
  const contractGateOpen=clean(readiness?.permission?.contract_gate)==='OPEN';
  const firewallGateOpen=clean(readiness?.permission?.firewall_gate)==='OPEN';
  const candidateReady=watch?.candidate_ready===true;
  const canonicalAdmissionObserved=
    finite(v8?.exposure_firewall?.admitted_objects)!==null&&
    (finite(v8?.exposure_firewall?.admitted_objects)??0)>0;

  const steps=[];
  addStep(
    steps,
    'connect_read_only_mt5_reference',
    'Read-only MT5 bridge connected',
    brokerSourceConnected,
    brokerSourceConnected?'PASS':'BLOCKED',
    'Connect the existing market-data-only MT5 bridge and keep order submission disabled.',
    'V10'
  );
  addStep(
    steps,
    'fresh_bid_ask_reference',
    'Fresh broker bid/ask reference',
    brokerQuoteReady,
    brokerQuoteReady?'PASS':'BLOCKED',
    'Receive fresh XAUUSD bid/ask ticks through the read-only intake.',
    'V10'
  );
  addStep(
    steps,
    'prospective_qualification_reviewable',
    'V7 prospective qualification reviewable',
    v7Reviewable,
    v7Reviewable?'PASS':'BLOCKED',
    'Allow acceptance, data, contract and firewall prerequisites to qualify prospectively; do not backfill.',
    'V9'
  );
  addStep(
    steps,
    'authoritative_permission_positive',
    'Authoritative permission positive',
    permissionPositive,
    permissionPositive?'PASS':'BLOCKED',
    'Wait for the existing permission compiler to admit positive research risk; V11 cannot change it.',
    'V9'
  );
  addStep(
    steps,
    'contract_gate_open',
    'Canonical contract gate open',
    contractGateOpen,
    contractGateOpen?'PASS':'BLOCKED',
    'Wait for the canonical contract system to open its gate under its own policy.',
    'V9'
  );
  addStep(
    steps,
    'firewall_gate_open',
    'Canonical firewall gate open',
    firewallGateOpen,
    firewallGateOpen?'PASS':'BLOCKED',
    'Wait for the canonical exposure firewall to open under its own policy.',
    'V9'
  );
  addStep(
    steps,
    'ephemeral_candidate_ready',
    'V8 candidate prepared for review',
    candidateReady,
    candidateReady?'PASS':'BLOCKED',
    'Prepare only an ephemeral fingerprinted candidate after every upstream gate passes.',
    'V8'
  );
  addStep(
    steps,
    'canonical_admission_observed',
    'Canonical exposure admission observed',
    canonicalAdmissionObserved,
    canonicalAdmissionObserved?'PASS':'BLOCKED',
    'Admission remains external to V11 and requires the existing canonical workflow and human review.',
    'V8'
  );

  const passed=steps.filter(x=>x.passed).length;
  const readinessPct=Math.round((passed/steps.length)*100);
  const primary=steps.find(x=>!x.passed)??null;

  const executionEvidence=v10?.execution_reality??{};
  const executionInfraMissing=Array.isArray(executionEvidence?.infrastructure_missing)
    ?executionEvidence.infrastructure_missing:[];
  const executionGrade=clean(executionEvidence?.execution_evidence_grade);

  let state='BLOCKED_AT_MARKET_REFERENCE';
  if(Object.values(sourceHealth).some(v=>!v))state='SOURCE_GATED';
  else if(brokerSourceConnected&&!brokerQuoteReady)state='WAITING_FOR_FRESH_BROKER_REFERENCE';
  else if(brokerQuoteReady&&!v7Reviewable)state='BROKER_REFERENCE_READY_WAITING_QUALIFICATION';
  else if(v7Reviewable&&!permissionPositive)state='QUALIFIED_WAITING_PERMISSION';
  else if(permissionPositive&&(!contractGateOpen||!firewallGateOpen))state='PERMISSION_POSITIVE_WAITING_CANONICAL_GATES';
  else if(contractGateOpen&&firewallGateOpen&&!candidateReady)state='CANONICAL_GATES_OPEN_WAITING_CANDIDATE';
  else if(candidateReady&&!canonicalAdmissionObserved)state='CANDIDATE_READY_WAITING_HUMAN_ADMISSION';
  else if(canonicalAdmissionObserved)state='CANONICAL_ADMISSION_OBSERVED_EXECUTION_STILL_SEPARATE';

  const criticalPath=steps.filter(x=>!x.passed).map((x,index)=>({
    order:index+1,
    key:x.key,
    label:x.label,
    next_action:x.next_action,
    source:x.source
  }));

  return res.status(200).json({
    ok:true,
    version:'q4-machine-v11',
    generated_at:new Date().toISOString(),
    convergence:{
      state,
      readiness_pct:readinessPct,
      readiness_label:'SYSTEM_PREREQUISITE_COMPLETION_NOT_MARKET_PROBABILITY',
      passed_count:passed,
      total_count:steps.length,
      primary_blocker:primary,
      steps,
      critical_path:criticalPath
    },
    broker_reference:{
      grade:broker?.reference_grade??'WITHHELD',
      state:broker?.state??'WITHHELD',
      source_connected:brokerSourceConnected,
      quote_ready:brokerQuoteReady,
      bid:finite(broker?.bid),
      ask:finite(broker?.ask),
      age_seconds:finite(broker?.age_seconds),
      tick_count_60s:finite(broker?.tick_count_60s),
      primary_blocker:brokerVerification?.primary_blocker??null
    },
    canonical_readiness:{
      watch_id:watch?.watch_id??null,
      watch_state:watch?.state??'WITHHELD',
      v7_upstream_reviewable:v7Reviewable,
      permission_positive:permissionPositive,
      contract_gate_open:contractGateOpen,
      firewall_gate_open:firewallGateOpen,
      candidate_ready:candidateReady,
      canonical_admission_observed:canonicalAdmissionObserved
    },
    execution_boundary:{
      execution_evidence_grade:executionGrade,
      infrastructure_missing:executionInfraMissing,
      production_broker_verified:v10?.execution_reality?.production_broker_verified===true,
      real_broker_connected:v10?.execution_reality?.real_broker_connected===true,
      live_order_route_present:v10?.execution_reality?.live_order_route_present===true,
      live_order_qualified:v10?.execution_reality?.live_order_qualified===true,
      human_release_required:v10?.qualification_boundary?.human_release_required===true
    },
    convergence_firewall:{
      completing_steps_is_not_trade_signal:true,
      canonical_admission_is_not_order_submission:true,
      broker_reference_is_not_capital_permission:true,
      readiness_pct_is_not_probability:true,
      no_gate_mutation:true,
      no_self_admission:true,
      no_orders:true,
      capital_permission:'0R'
    },
    source_health:{
      available_count:Object.values(sourceHealth).filter(Boolean).length,
      total_count:Object.keys(sourceHealth).length,
      sources:sourceHealth
    },
    next_action:primary?{
      gate:primary.key,
      action:primary.next_action,
      source:primary.source
    }:{
      gate:'HUMAN_GOVERNANCE_REVIEW',
      action:'All V11 prerequisite steps are observed complete. Human governance review remains required; V11 still cannot place or authorize orders.',
      source:'GOVERNANCE'
    },
    decision_compression:{
      what_changed:'V11 converged V8-V10 into '+String(passed)+'/'+String(steps.length)+' completed prerequisites.',
      what_matters_now:primary
        ?primary.label+' is the first unresolved prerequisite.'
        :'All convergence prerequisites are observed complete, but execution authority remains separate.',
      action_permitted:'WAIT',
      capital_permission:'0R'
    },
    governance:{
      research_only:true,
      read_only_convergence:true,
      automatic_execution:false,
      action_permitted:'WAIT',
      capital_permission:'0R'
    }
  });
}
