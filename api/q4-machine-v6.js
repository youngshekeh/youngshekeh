const ORIGIN='https://thefatheranalytics.com';

async function read(url,timeout=12000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(url,{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-Q4-V6/1.0'},
      cache:'no-store',
      signal:controller.signal,
      redirect:'error'
    });
    const body=await response.json().catch(()=>null);
    return response.ok&&body&&typeof body==='object'&&!Array.isArray(body)?body:null;
  }catch{return null}finally{clearTimeout(timer)}
}

function numberOrNull(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function clamp(value,min=0,max=100){return Math.max(min,Math.min(max,value))}
function clean(value,fallback='WITHHELD'){return String(value??fallback)}

const RECOVERY_RULES={
  structural_outcome_volume:{
    priority:5,lane:'OBSERVATION',
    action:'Continue prospective append-only structural outcome capture.',
    unlocks:'Observation density only; does not unlock probability or capital.'
  },
  trade_eligible_sources:{
    priority:1,lane:'GOVERNED_OUTCOMES',
    action:'Accumulate governed trade-eligible source outcomes without retroactive relabeling.',
    unlocks:'Required before performance can inform governed calibration.'
  },
  canonical_calibration_sample:{
    priority:2,lane:'CANONICAL_RESOLUTION',
    action:'Resolve additional canonical benchmark pairs under the existing frozen policy.',
    unlocks:'Enables canonical calibration review once sample thresholds are met.'
  },
  market_calibration_sample:{
    priority:3,lane:'MARKET_CALIBRATION',
    action:'Grow resolved market-calibration observations under immutable event definitions.',
    unlocks:'Enables accuracy and uncertainty reporting after the minimum sample gate.'
  },
  mature_signal_reputation:{
    priority:4,lane:'SIGNAL_REPUTATION',
    action:'Continue event-linked signal outcome collection until mature reputation thresholds are reached.',
    unlocks:'Makes adaptive weighting reviewable, not automatic.'
  },
  independent_oos_probability_model:{
    priority:6,lane:'MODEL_VALIDATION',
    action:'Train and independently validate an out-of-sample probability model before connecting it.',
    unlocks:'Makes AI probability reviewable only after independent validation.'
  }
};

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Machine','Q4-EVIDENCE-RECOVERY-V6');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }

  const v5=await read(ORIGIN+'/api/q4-machine-v5',16000);
  if(!v5?.ok){
    return res.status(503).json({
      ok:false,
      version:'q4-machine-v6',
      state:'V5_AUTHORITY_UNAVAILABLE',
      recovery:{state:'RESTORE_AUTHORITY_LAYER',next_action:'Restore V5 calibration authority before ranking evidence work.'},
      governance:{action_permitted:'WAIT',capital_permission:'0R',automatic_execution:false}
    });
  }

  const gates=Array.isArray(v5?.calibration_authority?.gates)?v5.calibration_authority.gates:[];
  const blockers=gates
    .filter(g=>g?.passed!==true)
    .map(g=>{
      const rule=RECOVERY_RULES[g?.key]||{
        priority:99,lane:'UNKNOWN',
        action:'Review this evidence gate manually.',
        unlocks:'No automatic promotion.'
      };
      const current=numberOrNull(g?.current);
      const required=numberOrNull(g?.required);
      const sourceAvailable=g?.available!==false&&g?.state!=='SOURCE_UNAVAILABLE';
      const gap=sourceAvailable&&current!==null&&required!==null?Math.max(0,required-current):null;
      const completion=sourceAvailable&&current!==null&&required&&required>0
        ?clamp(Math.round((current/required)*100))
        :null;
      return {
        key:g?.key??'unknown',
        label:g?.label??g?.key??'Unknown gate',
        state:sourceAvailable?'EVIDENCE_IMMATURE':'SOURCE_UNAVAILABLE',
        source_available:sourceAvailable,
        current:sourceAvailable?current:null,
        required,
        gap,
        completion_pct:completion,
        priority:sourceAvailable?rule.priority:0,
        lane:sourceAvailable?rule.lane:'SOURCE_RECOVERY',
        next_action:sourceAvailable?rule.action:'Restore the unavailable evidence source before assessing maturity.',
        unlocks:rule.unlocks
      };
    })
    .sort((a,b)=>a.priority-b.priority||String(a.key).localeCompare(String(b.key)));

  const inventory=v5?.evidence_inventory??{};
  const outcomes=numberOrNull(inventory?.resolved_structural_outcomes);
  const tradeEligible=numberOrNull(inventory?.trade_eligible_source_count);
  const canonical=numberOrNull(inventory?.canonical_eligible_n);
  const marketCal=numberOrNull(inventory?.market_calibration_sample_size);
  const reputation=numberOrNull(inventory?.max_signal_sample_count);

  let maturityState='EVIDENCE_SPARSE';
  if(outcomes!==null&&outcomes>=30&&(tradeEligible===null||tradeEligible===0)){
    maturityState='OBSERVATION_RICH_EDGE_UNPROVEN';
  }else if(tradeEligible!==null&&tradeEligible>0&&(canonical??0)<5){
    maturityState='GOVERNED_SAMPLE_BUILDING';
  }else if((canonical??0)>=5&&(marketCal??0)>=5&&(reputation??0)<30){
    maturityState='CALIBRATION_AVAILABLE_REPUTATION_IMMATURE';
  }else if((canonical??0)>=5&&(marketCal??0)>=5&&(reputation??0)>=30){
    maturityState='MATURE_EVIDENCE_REVIEW';
  }

  const sourceUnknown=blockers.filter(x=>!x.source_available).length;
  const immature=blockers.filter(x=>x.source_available).length;
  const primary=blockers[0]??null;
  const authorityState=clean(v5?.calibration_authority?.state);

  const permissionLadder=[
    {
      level:'OBSERVE_STRUCTURE',
      permitted:outcomes!==null&&outcomes>0,
      reason:outcomes!==null?String(outcomes)+' structural outcomes available.':'Outcome source unavailable.'
    },
    {
      level:'EARLY_REPUTATION_REVIEW',
      permitted:reputation!==null&&reputation>=10,
      reason:reputation!==null?'Maximum signal sample n='+String(reputation)+'; review remains descriptive.':'Signal reputation unavailable.'
    },
    {
      level:'CANONICAL_CALIBRATION_REVIEW',
      permitted:(canonical??0)>=5&&(marketCal??0)>=5,
      reason:'Canonical n='+String(canonical??'UNKNOWN')+' · market calibration n='+String(marketCal??'UNKNOWN')+'.'
    },
    {
      level:'PROBABILITY_PUBLICATION_REVIEW',
      permitted:authorityState==='PROBABILITY_PUBLICATION_ELIGIBLE',
      reason:authorityState
    },
    {
      level:'ADAPTIVE_WEIGHTING',
      permitted:v5?.learning_permission?.adaptive_weighting==='ENABLED',
      reason:clean(v5?.learning_permission?.adaptive_weighting,'FROZEN')
    },
    {
      level:'CAPITAL_PROMOTION',
      permitted:false,
      reason:'V6 cannot grant capital. Governed execution remains separate.'
    }
  ];

  const recoveryScore=blockers.length===0?100:Math.round(
    gates.reduce((sum,g)=>{
      if(g?.passed===true)return sum+100;
      if(g?.available===false||g?.state==='SOURCE_UNAVAILABLE')return sum;
      const current=numberOrNull(g?.current);
      const required=numberOrNull(g?.required);
      return sum+(current!==null&&required&&required>0?clamp((current/required)*100):0);
    },0)/(gates.length||1)
  );

  return res.status(200).json({
    ok:true,
    version:'q4-machine-v6',
    generated_at:new Date().toISOString(),
    evidence_recovery:{
      state:blockers.length===0?'AUTHORITY_GATES_CLEAR':sourceUnknown>0?'SOURCE_RECOVERY_REQUIRED':'EVIDENCE_ACCUMULATION_REQUIRED',
      maturity_state:maturityState,
      readiness_progress_pct:recoveryScore,
      readiness_label:'EVIDENCE_MATURITY_PROGRESS_NOT_MARKET_PROBABILITY',
      blocker_count:blockers.length,
      source_unknown_count:sourceUnknown,
      immature_gate_count:immature,
      primary_bottleneck:primary,
      blockers
    },
    evidence_inventory:{
      structural_outcomes:outcomes,
      trade_eligible_sources:tradeEligible,
      canonical_eligible_n:canonical,
      market_calibration_n:marketCal,
      signal_reputation_max_n:reputation,
      v5_source_health:v5?.source_health??null
    },
    research_permission_ladder:permissionLadder,
    learning_firewall:{
      probability_publication:clean(v5?.learning_permission?.probability_publication),
      adaptive_weighting:clean(v5?.learning_permission?.adaptive_weighting,'FROZEN'),
      automatic_promotion:false,
      automatic_orders:false,
      capital_permission:'0R',
      rule:'Evidence maturity may expand research review permissions only. It cannot directly promote capital or order authority.'
    },
    next_research_action:primary?{
      lane:primary.lane,
      action:primary.next_action,
      evidence_gap:primary.gap,
      completion_pct:primary.completion_pct,
      promotion_effect:primary.unlocks
    }:{
      lane:'REVIEW',
      action:'All V5 authority gates are clear. Human and model-governance review is still required before any policy change.',
      evidence_gap:0,
      completion_pct:100,
      promotion_effect:'No automatic capital promotion.'
    },
    decision_compression:{
      what_changed:'V6 ranked '+String(blockers.length)+' evidence bottleneck'+(blockers.length===1?'':'s')+' across '+String(gates.length)+' authority gates.',
      what_matters_now:primary
        ?primary.label+': '+(primary.source_available?'gap '+String(primary.gap??'UNKNOWN')+' · '+String(primary.completion_pct??'UNKNOWN')+'% complete':'source unavailable')+'.'
        :'Evidence gates are clear but policy review remains mandatory.',
      action_permitted:'WAIT',
      capital_permission:'0R'
    },
    governance:{
      research_only:true,
      no_self_promotion:true,
      no_retroactive_relabeling:true,
      automatic_execution:false,
      action_permitted:'WAIT',
      capital_permission:'0R'
    }
  });
}
