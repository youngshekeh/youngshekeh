const ORIGIN='https://thefatheranalytics.com';
const SUPA='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1';

async function read(url,timeout=14000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(url,{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-Q4-V7/1.0'},
      cache:'no-store',
      signal:controller.signal,
      redirect:'error'
    });
    const body=await response.json().catch(()=>null);
    return response.ok&&body&&typeof body==='object'&&!Array.isArray(body)?body:null;
  }catch{return null}finally{clearTimeout(timer)}
}

function yes(value){return value===true}
function finite(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function clean(value,fallback='WITHHELD'){return String(value??fallback)}
function contains(values,target){
  return Array.isArray(values)&&values.some(v=>String(v).toUpperCase()===target);
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Machine','Q4-PROSPECTIVE-EVIDENCE-V7');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }

  const [v6,permission,desk,trigger,learning,integrity]=await Promise.all([
    read(ORIGIN+'/api/q4-machine-v6',16000),
    read(SUPA+'/public-gold-permission-transitions'),
    read(SUPA+'/public-gold-execution-desk'),
    read(SUPA+'/public-gold-trigger-watch'),
    read(SUPA+'/public-gold-learning-state'),
    read(SUPA+'/public-gold-outcome-integrity')
  ]);

  const sourceHealth={
    v6:v6?.ok===true,
    permission_compiler:permission?.ok===true,
    execution_desk:desk?.ok===true,
    trigger_watch:trigger?.ok===true,
    learning_state:learning?.ok===true,
    outcome_integrity:integrity?.ok===true
  };

  const compiler=permission?.current??{};
  const reasons=Array.isArray(compiler?.reasons)?compiler.reasons:[];
  const liveQuote=desk?.market?.live_xauusd??{};
  const longWatch=trigger?.long_watch??{};
  const shortWatch=trigger?.short_watch??{};
  const acceptedSide=yes(longWatch?.acceptance_confirmed)?'LONG':yes(shortWatch?.acceptance_confirmed)?'SHORT':null;
  const humanReviewSide=yes(longWatch?.human_review_condition_reached)?'LONG':yes(shortWatch?.human_review_condition_reached)?'SHORT':null;

  const brokerQuoteReady=
    yes(liveQuote?.real_account_quote)&&
    finite(liveQuote?.bid)!==null&&
    finite(liveQuote?.ask)!==null;

  const compilerPositive=
    clean(compiler?.final_action)==='EVALUATE'&&
    clean(compiler?.final_permission)!=='0R'&&
    (finite(compiler?.final_r)??0)>0;

  const checks=[
    {
      key:'prospective_append_only_capture',
      passed:sourceHealth.learning_state&&
        yes(learning?.methodology?.prospective_only)&&
        yes(learning?.methodology?.append_only)&&
        clean(learning?.capture_health?.state)==='HEALTHY',
      evidence:sourceHealth.learning_state
        ?clean(learning?.capture_health?.state)
        :'SOURCE_UNAVAILABLE',
      requirement:'Prospective append-only capture must be healthy before the event.'
    },
    {
      key:'market_observation_available',
      passed:sourceHealth.execution_desk&&
        clean(desk?.market?.market_status)!=='UNAVAILABLE'&&
        finite(desk?.market?.price)!==null,
      evidence:sourceHealth.execution_desk
        ?clean(desk?.market?.market_status)
        :'SOURCE_UNAVAILABLE',
      requirement:'A timestamped market observation must exist.'
    },
    {
      key:'real_broker_execution_reference',
      passed:sourceHealth.execution_desk&&brokerQuoteReady,
      evidence:sourceHealth.execution_desk
        ?clean(liveQuote?.state)
        :'SOURCE_UNAVAILABLE',
      requirement:'A real-account broker bid/ask must be available before any execution-grade qualification.'
    },
    {
      key:'acceptance_confirmed',
      passed:sourceHealth.trigger_watch&&acceptedSide!==null,
      evidence:sourceHealth.trigger_watch
        ?acceptedSide??('REVIEW_'+(humanReviewSide??'NOT_REACHED'))
        :'SOURCE_UNAVAILABLE',
      requirement:'A review condition alone is insufficient; structural acceptance must be confirmed.'
    },
    {
      key:'permission_compiler_positive',
      passed:sourceHealth.permission_compiler&&compilerPositive,
      evidence:sourceHealth.permission_compiler
        ?clean(compiler?.final_action)+' · '+clean(compiler?.final_permission)
        :'SOURCE_UNAVAILABLE',
      requirement:'The authoritative permission compiler must admit positive risk prospectively.'
    },
    {
      key:'contract_gate_open',
      passed:sourceHealth.permission_compiler&&clean(compiler?.contract_gate)==='OPEN',
      evidence:sourceHealth.permission_compiler?clean(compiler?.contract_gate):'SOURCE_UNAVAILABLE',
      requirement:'A prospective governed contract must be ready before outcome observation.'
    },
    {
      key:'firewall_gate_open',
      passed:sourceHealth.permission_compiler&&clean(compiler?.firewall_gate)==='OPEN',
      evidence:sourceHealth.permission_compiler?clean(compiler?.firewall_gate):'SOURCE_UNAVAILABLE',
      requirement:'The final firewall must be open under the authoritative compiler.'
    },
    {
      key:'canonical_exposure_admitted',
      passed:sourceHealth.permission_compiler&&!contains(reasons,'NO_ADMITTED_CANONICAL_EXPOSURE'),
      evidence:sourceHealth.permission_compiler
        ?(contains(reasons,'NO_ADMITTED_CANONICAL_EXPOSURE')?'NOT_ADMITTED':'ADMITTED')
        :'SOURCE_UNAVAILABLE',
      requirement:'Canonical exposure admission must exist before the outcome; V7 cannot create it retroactively.'
    }
  ];

  const passed=checks.filter(x=>x.passed).length;
  const sourceUnknown=Object.values(sourceHealth).filter(v=>!v).length;
  const allPrerequisites=checks.every(x=>x.passed);
  const qualificationState=sourceUnknown>0
    ?'SOURCE_GATED'
    :allPrerequisites
      ?'PROSPECTIVE_CONTRACT_REVIEWABLE'
      :'NOT_QUALIFIED';

  const blockers=checks.filter(x=>!x.passed);
  const primaryBlocker=blockers[0]??null;

  const researchRead=desk?.current_read??{};
  const systemExecution=desk?.execution??{};
  const prospectiveCount=finite(learning?.prospective_sample_count);
  const v6TradeEligible=finite(v6?.evidence_inventory?.trade_eligible_sources);

  return res.status(200).json({
    ok:true,
    version:'q4-machine-v7',
    generated_at:new Date().toISOString(),
    qualification:{
      state:qualificationState,
      prerequisite_pass_count:passed,
      prerequisite_total:checks.length,
      accepted_side:acceptedSide,
      human_review_side:humanReviewSide,
      countable_as_trade_eligible_now:false,
      reason:allPrerequisites
        ?'All preconditions are reviewable, but only the authoritative prospective contract and canonical exposure system may create a countable record.'
        :'One or more prospective qualification conditions are not satisfied.',
      checks,
      blockers,
      primary_blocker:primaryBlocker
    },
    current_governed_state:{
      permission_compiler:{
        final_action:compiler?.final_action??'WITHHELD',
        final_permission:compiler?.final_permission??'0R',
        final_r:finite(compiler?.final_r),
        data_gate:compiler?.data_gate??'WITHHELD',
        engine_gate:compiler?.engine_gate??'WITHHELD',
        contract_gate:compiler?.contract_gate??'WITHHELD',
        firewall_gate:compiler?.firewall_gate??'WITHHELD',
        reasons
      },
      execution_desk:{
        system_action:systemExecution?.system_action??'WAIT',
        system_capital_permission:systemExecution?.system_capital_permission??'0R',
        machine_executable:yes(systemExecution?.current_setup_executable_by_machine),
        real_broker_quote:brokerQuoteReady
      },
      research_read_excluded_from_eligibility:{
        action:researchRead?.action_permitted??'WITHHELD',
        risk_suggestion:researchRead?.capital_permission??'WITHHELD',
        excluded:true,
        reason:'Research EVALUATE or suggested risk is not executable permission and cannot make an observation trade-eligible.'
      }
    },
    prospective_ledger:{
      sample_count:prospectiveCount,
      capture_state:learning?.capture_health?.state??'SOURCE_UNAVAILABLE',
      append_only:yes(learning?.methodology?.append_only),
      prospective_only:yes(learning?.methodology?.prospective_only),
      latest_payload_sha256:learning?.latest?.payload_sha256??null,
      current_v6_trade_eligible_count:v6TradeEligible
    },
    historical_integrity_reference:sourceHealth.outcome_integrity?{
      active:integrity?.active===true,
      independent_signal_count:finite(integrity?.policy?.independent_signal_count),
      double_count_prevention:integrity?.policy?.double_count_prevention===true,
      verdict:integrity?.verdict??'WITHHELD',
      note:'Historical integrity evidence is reference-only and cannot be retrofitted into the current prospective eligibility count.'
    }:null,
    source_health:{
      available_count:Object.values(sourceHealth).filter(Boolean).length,
      total_count:Object.keys(sourceHealth).length,
      sources:sourceHealth
    },
    evidence_firewall:{
      retroactive_eligibility:false,
      self_classification:false,
      research_sizing_counts_as_permission:false,
      review_condition_counts_as_acceptance:false,
      delayed_structure_counts_as_execution_quote:false,
      automatic_orders:false,
      capital_permission:'0R'
    },
    next_qualification_action:primaryBlocker?{
      gate:primaryBlocker.key,
      requirement:primaryBlocker.requirement,
      current_evidence:primaryBlocker.evidence
    }:{
      gate:'AUTHORITATIVE_CONTRACT_REVIEW',
      requirement:'Allow only the existing prospective contract system to admit and freeze canonical exposure.',
      current_evidence:'ALL_V7_PRECONDITIONS_REVIEWABLE'
    },
    decision_compression:{
      what_changed:'V7 evaluated '+String(passed)+'/'+String(checks.length)+' prospective evidence prerequisites.',
      what_matters_now:primaryBlocker
        ?primaryBlocker.key+' remains blocked: '+primaryBlocker.evidence+'.'
        :'All V7 prerequisites are reviewable, but V7 still cannot create eligibility itself.',
      action_permitted:'WAIT',
      capital_permission:'0R'
    },
    governance:{
      research_only:true,
      prospective_only:true,
      no_retroactive_relabeling:true,
      no_self_eligibility:true,
      automatic_execution:false,
      action_permitted:'WAIT',
      capital_permission:'0R'
    }
  });
}
