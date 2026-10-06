const ORIGIN='https://thefatheranalytics.com';
const SUPA='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1';

async function read(url,timeout=16000){
  const c=new AbortController();
  const t=setTimeout(()=>c.abort(),timeout);
  try{
    const r=await fetch(url,{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-Q4-V5/1.0'},
      cache:'no-store',
      signal:c.signal,
      redirect:'error'
    });
    const j=await r.json().catch(()=>null);
    return r.ok&&j&&typeof j==='object'&&!Array.isArray(j)?j:null;
  }catch{return null}finally{clearTimeout(t)}
}

function n(v){if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null}
function s(v,f='WITHHELD'){return String(v??f)}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,v))}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Machine','Q4-CALIBRATION-AUTHORITY-V5');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }

  const [v4,probLab,marketCal,benchmark,setupCal,outcomes,reputation]=await Promise.all([
    read(ORIGIN+'/api/q4-machine-v4',8000),
    read(SUPA+'/public-v47-probability-lab'),
    read(SUPA+'/public-market-calibration'),
    read(SUPA+'/public-gold-benchmark-calibration'),
    read(SUPA+'/public-setup-calibration'),
    read(SUPA+'/public-gold-outcome-learning'),
    read(SUPA+'/public-gold-signal-reputation')
  ]);

  const sourceHealth={
    v4:v4?.ok===true,
    probability_lab:probLab?.ok===true,
    market_calibration:marketCal?.ok===true,
    benchmark_calibration:benchmark?.ok===true,
    setup_calibration:setupCal?.ok===true,
    outcome_learning:outcomes?.ok===true,
    signal_reputation:reputation?.ok===true
  };
  const marketSample=sourceHealth.market_calibration?n(marketCal?.sample_size):null;
  const canonicalEligible=sourceHealth.benchmark_calibration?n(benchmark?.canonical?.eligible_n):null;
  const pairedResolutions=sourceHealth.benchmark_calibration?n(benchmark?.canonical?.paired_resolutions):null;
  const setupResolved=sourceHealth.setup_calibration?n(setupCal?.resolved_120m_count):null;
  const resolvedOutcomes=sourceHealth.outcome_learning?n(outcomes?.resolved_outcome_count):null;
  const tradeEligible=sourceHealth.outcome_learning?n(outcomes?.trade_eligible_source_count):null;
  const reputationMax=sourceHealth.signal_reputation?n(reputation?.pipeline?.max_sample_count):null;
  const probabilityPct=n(probLab?.gold?.probability_estimate_pct);
  const aiProbability=n(probLab?.ai_probability?.probability_pct);

  const gate=(key,label,available,current,required,note)=>({
    key,label,
    available,
    passed:available&&current!==null&&current>=required,
    state:!available?'SOURCE_UNAVAILABLE':current!==null&&current>=required?'PASS':'FAIL',
    current:available?current:null,
    required,
    note
  });

  const gates=[
    gate(
      'structural_outcome_volume',
      'Structural outcome sample',
      sourceHealth.outcome_learning,
      resolvedOutcomes,
      30,
      'Forward structural observations exist, but they are not executed-trade PnL.'
    ),
    gate(
      'trade_eligible_sources',
      'Trade-eligible source sample',
      sourceHealth.outcome_learning,
      tradeEligible,
      5,
      'At least a small governed trade-eligible cohort is required before performance can inform capital.'
    ),
    gate(
      'canonical_calibration_sample',
      'Canonical calibration sample',
      sourceHealth.benchmark_calibration,
      canonicalEligible,
      5,
      'Canonical benchmark policy requires eligible resolved observations.'
    ),
    gate(
      'market_calibration_sample',
      'Market calibration sample',
      sourceHealth.market_calibration,
      marketSample,
      5,
      'Accuracy remains withheld below the evidence threshold.'
    ),
    gate(
      'mature_signal_reputation',
      'Mature signal reputation',
      sourceHealth.signal_reputation,
      reputationMax,
      30,
      'Early reputation samples are informative but not mature enough for adaptive weighting.'
    ),
    gate(
      'independent_oos_probability_model',
      'Independent OOS probabilistic model',
      sourceHealth.probability_lab,
      aiProbability===null?0:1,
      1,
      'AI probability remains withheld until an independently validated out-of-sample model is connected.'
    )
  ];

  const passed=gates.filter(g=>g.passed).length;
  const unknown=gates.filter(g=>!g.available).length;
  const evaluated=gates.length-unknown;
  const readiness=Math.round((passed/gates.length)*100);
  const authority = (
    passed===gates.length &&
    probabilityPct!==null
  ) ? 'PROBABILITY_PUBLICATION_ELIGIBLE' : 'PROBABILITY_AUTHORITY_WITHHELD';

  const horizons=Array.isArray(outcomes?.horizons)
    ? outcomes.horizons.map(h=>({
        horizon_minutes:n(h?.horizon_minutes),
        samples:n(h?.samples),
        avg_price_delta:n(h?.avg_price_delta),
        avg_up_excursion:n(h?.avg_up_excursion),
        avg_down_excursion:n(h?.avg_down_excursion),
        calibration_state:s(h?.calibration_state)
      }))
    : [];

  const calibrationBucket = Array.isArray(benchmark?.f1?.calibration_buckets)
    ? benchmark.f1.calibration_buckets.find(b=>s(b?.status)==='ELIGIBLE') || null
    : null;

  const currentSignal=reputation?.latest_signal??null;

  return res.status(200).json({
    ok:true,
    version:'q4-machine-v5',
    generated_at:new Date().toISOString(),
    v4_state:{
      available:v4?.ok===true,
      conflict_state:v4?.conflict_resolution?.state??'WITHHELD',
      conflict_score:v4?.conflict_resolution?.rule_score??null,
      transition_pressure_state:v4?.regime_transition_pressure?.state??'WITHHELD',
      transition_pressure_score:v4?.regime_transition_pressure?.rule_score??null,
      snapshot_id:v4?.frozen_snapshot?.snapshot_id??null,
      note:v4?.ok===true?'V4 context available.':'V4 context unavailable; calibration authority remains fail-closed and independent.'
    },
    source_health:{
      available_count:Object.values(sourceHealth).filter(Boolean).length,
      total_count:Object.keys(sourceHealth).length,
      sources:sourceHealth
    },
    calibration_authority:{
      state:authority,
      readiness_index_pct:readiness,
      evaluated_gate_count:evaluated,
      unknown_gate_count:unknown,
      readiness_label:'EVIDENCE_READINESS_NOT_MARKET_PROBABILITY',
      passed_gates:passed,
      total_gates:gates.length,
      probability_estimate_pct:authority==='PROBABILITY_PUBLICATION_ELIGIBLE'?probabilityPct:null,
      ai_probability_pct:aiProbability,
      reason:authority==='PROBABILITY_PUBLICATION_ELIGIBLE'
        ?'Evidence gates are satisfied for publication review.'
        :'Probability remains withheld because one or more calibration authority gates are not satisfied.',
      gates
    },
    evidence_inventory:{
      resolved_structural_outcomes:resolvedOutcomes,
      trade_eligible_source_count:tradeEligible,
      market_calibration_sample_size:marketSample,
      setup_resolved_120m_count:setupResolved,
      canonical_paired_resolutions:pairedResolutions,
      canonical_eligible_n:canonicalEligible,
      signal_reputation_state:sourceHealth.signal_reputation?(reputation?.state??'WITHHELD'):'SOURCE_UNAVAILABLE',
      max_signal_sample_count:reputationMax
    },
    horizon_observation_profile:{
      state:!sourceHealth.outcome_learning?'SOURCE_UNAVAILABLE':resolvedOutcomes>0?'STRUCTURAL_OBSERVATION_SAMPLE_AVAILABLE':'WITHHELD',
      horizons,
      performance_claims:outcomes?.calibration?.performance_claims??'WITHHELD',
      edge_claims:outcomes?.calibration?.edge_claims??'WITHHELD',
      trade_pnl_claimed:outcomes?.calibration?.trade_pnl_claimed===true,
      note:'These horizon observations describe forward structural movement and excursions. They are not broker execution results.'
    },
    benchmark_watch:{
      canonical_status:benchmark?.canonical?.status??'UNRATED',
      benchmark_status:benchmark?.canonical?.benchmark_status??'WITHHELD',
      baseline_name:benchmark?.policy?.baseline_name??'NO_SKILL_50',
      eligible_calibration_bucket:calibrationBucket,
      adaptive_weighting_enabled:benchmark?.policy?.adaptive_weighting_enabled===true
    },
    signal_reputation_watch:{
      state:reputation?.state??'WITHHELD',
      classifier_version:reputation?.classifier_version??null,
      current_signal:currentSignal?{
        signal_key:currentSignal.signal_key??null,
        direction:currentSignal.direction??null,
        horizon_minutes:n(currentSignal.horizon_minutes),
        sample_count:n(currentSignal.sample_count),
        reputation_state:currentSignal.reputation_state??null,
        observed_hit_rate_pct:n(currentSignal?.public_statistics?.observed_hit_rate_pct),
        wilson_lower_pct:n(currentSignal?.public_statistics?.wilson_lower_pct),
        automatic_weight:currentSignal.automatic_weight??null,
        automatic_promotion:currentSignal.automatic_promotion===true
      }:null
    },
    learning_permission:{
      probability_publication:authority==='PROBABILITY_PUBLICATION_ELIGIBLE'?'REVIEWABLE':'WITHHELD',
      adaptive_weighting:benchmark?.policy?.adaptive_weighting_enabled===true?'ENABLED':'FROZEN',
      automatic_promotion:false,
      automatic_orders:false,
      capital_permission:'0R',
      next_evidence_needed:gates.filter(g=>!g.passed).map(g=>({
        key:g.key,
        state:g.state,
        current:g.current,
        required:g.required
      }))
    },
    decision_compression:{
      what_changed:`V5 calibration authority passed ${passed}/${gates.length} gates with ${unknown} source-unknown gates.`,
      what_matters_now:`Structural outcomes=${resolvedOutcomes??'UNKNOWN'} · trade-eligible=${tradeEligible??'UNKNOWN'} · canonical eligible n=${canonicalEligible??'UNKNOWN'}.`,
      action_permitted:'WAIT',
      capital_permission:'0R'
    },
    governance:{
      research_only:true,
      probability_is_withheld_until_evidence_gates_pass:true,
      automatic_execution:false,
      action_permitted:'WAIT',
      capital_permission:'0R'
    }
  });
}
