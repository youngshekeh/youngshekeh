import { createHash } from 'node:crypto';

const ORIGIN='https://thefatheranalytics.com';
const SUPA='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-transition-state';

async function read(url,timeout=14000){
  const c=new AbortController();
  const t=setTimeout(()=>c.abort(),timeout);
  try{
    const r=await fetch(url,{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-Q4-V4/1.0'},
      cache:'no-store',signal:c.signal,redirect:'error'
    });
    const j=await r.json().catch(()=>null);
    return r.ok&&j&&typeof j==='object'&&!Array.isArray(j)?j:null;
  }catch{return null}finally{clearTimeout(t)}
}
function norm(v){return String(v??'').toUpperCase()}
function side(v){
  const s=norm(v);
  if(s.includes('UP')||s.includes('LONG'))return 'UP';
  if(s.includes('DOWN')||s.includes('SHORT'))return 'DOWN';
  return 'NEUTRAL';
}
function zoneFamily(v){
  const s=norm(v);
  if(s.includes('DEEP_PREMIUM'))return {family:'PREMIUM',weight:2};
  if(s.includes('PREMIUM'))return {family:'PREMIUM',weight:1};
  if(s.includes('DEEP_DISCOUNT'))return {family:'DISCOUNT',weight:-2};
  if(s.includes('DISCOUNT'))return {family:'DISCOUNT',weight:-1};
  return {family:'MIDRANGE',weight:0};
}
function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  }
  return value;
}
function hash(value){
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Machine','Q4-CONFLICT-V4');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }

  const [state,memory,visual,transition]=await Promise.all([
    read(ORIGIN+'/api/q4-machine-state'),
    read(ORIGIN+'/api/q4-machine-memory',18000),
    read(ORIGIN+'/api/q4-visual-data'),
    read(SUPA,10000)
  ]);

  if(!state?.ok||!memory?.ok||!visual?.ok){
    return res.status(503).json({
      ok:false,version:'q4-machine-v4',state:'DATA_GATED',
      governance:{action_permitted:'WAIT',capital_permission:'0R',automatic_execution:false}
    });
  }

  const tactical=side(state?.scenario_tree?.current_path||state?.transmutation?.state);
  const structural=side(transition?.current?.daily_bias);
  const crossAsset=side(memory?.regime_matrix?.gold?.direction);
  const macro=norm(memory?.regime_matrix?.gold_macro_alignment);
  const zones=Array.isArray(visual?.zones?.zones)?visual.zones.zones:[];
  const tf=zones.map(z=>{
    const f=zoneFamily(z?.location?.zone);
    return {
      timeframe:z?.timeframe??'unknown',
      zone:z?.location?.zone??'WITHHELD',
      position_pct:Number.isFinite(Number(z?.location?.position_pct))?Number(z.location.position_pct):null,
      family:f.family,
      weight:f.weight
    };
  });

  const counts=tf.reduce((a,x)=>{
    a[x.family]=(a[x.family]||0)+1;
    return a;
  },{PREMIUM:0,DISCOUNT:0,MIDRANGE:0});
  const dominant=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]||['MIDRANGE',0];
  const weighted=tf.reduce((s,x)=>s+x.weight,0);
  const dominantStrength=tf.length?Math.round((Number(dominant[1])/tf.length)*100):0;
  const split=counts.PREMIUM>0&&counts.DISCOUNT>0;

  let conflictScore=0;
  const conflictEvidence=[];
  if(tactical!=='NEUTRAL'&&structural!=='NEUTRAL'&&tactical!==structural){
    conflictScore+=25; conflictEvidence.push('tactical_vs_append_only_desk');
  }
  if(tactical!=='NEUTRAL'&&crossAsset!=='NEUTRAL'&&tactical!==crossAsset){
    conflictScore+=25; conflictEvidence.push('tactical_vs_cross_asset_gold');
  }
  if(macro==='CROSSWIND'){conflictScore+=20;conflictEvidence.push('macro_crosswind');}
  if(split){conflictScore+=15;conflictEvidence.push('multi_timeframe_location_split');}
  const materialAge=Number(transition?.latest_material_transition?.age_minutes);
  if(Number.isFinite(materialAge)&&materialAge<=30){
    conflictScore+=15;conflictEvidence.push('recent_material_transition');
  }
  conflictScore=Math.min(100,conflictScore);

  const conflictState=conflictScore>=75?'HIGH_CONFLICT'
    :conflictScore>=45?'ACTIVE_CONFLICT'
    :conflictScore>=20?'MILD_CONFLICT'
    :'LOW_CONFLICT';

  const recent=Array.isArray(transition?.recent)?transition.recent:[];
  const recentBiasFlips=recent.filter(x=>norm(x?.transition_code)==='DAILY_BIAS_CHANGED').length;
  let pressureScore=0;
  pressureScore+=Math.min(45,recentBiasFlips*7);
  if(conflictScore>=75)pressureScore+=25;
  else if(conflictScore>=45)pressureScore+=15;
  if(norm(memory?.regime_matrix?.breadth?.state)==='BROAD_DOWN')pressureScore+=15;
  if(norm(visual?.day?.day_state?.day_state)==='TWO_SIDED_LIQUIDITY_DAY')pressureScore+=15;
  if(transition?.data_quality?.blocked===true)pressureScore+=15;
  pressureScore=Math.min(100,pressureScore);
  const pressureState=pressureScore>=75?'HIGH_TRANSITION_PRESSURE'
    :pressureScore>=45?'ELEVATED_TRANSITION_PRESSURE'
    :pressureScore>=20?'MODERATE_TRANSITION_PRESSURE'
    :'LOW_TRANSITION_PRESSURE';

  const deskAction=norm(transition?.current?.action||'WAIT');
  const deskCapital=String(transition?.current?.capital_permission||'0R');
  const resolution=conflictScore>=45
    ?'WAIT_FOR_ALIGNMENT'
    :deskAction==='WAIT'
      ?'WAIT_FOR_CONFIRMATION'
      :'OBSERVE_GOVERNED_DESK';

  const snapshotCore={
    price:state?.price??null,
    day_dna:state?.day_dna??null,
    transmutation:state?.transmutation?.state??null,
    scenario_path:state?.scenario_tree?.current_path??null,
    tactical_side:tactical,
    desk_snapshot_id:transition?.current?.snapshot_id??null,
    desk_market_time:transition?.current?.market_time??null,
    desk_daily_bias:transition?.current?.daily_bias??null,
    desk_daily_structure:transition?.current?.daily_structure??null,
    desk_transition_sha256:transition?.latest_transition?.transition_sha256??null,
    cross_asset_fingerprint:memory?.regime_matrix?.fingerprint??null,
    cross_asset_gold_direction:memory?.regime_matrix?.gold?.direction??null,
    risk_tone:memory?.regime_matrix?.risk_tone??null,
    macro_alignment:memory?.regime_matrix?.gold_macro_alignment??null,
    timeframe_locations:tf.map(x=>({timeframe:x.timeframe,zone:x.zone,position_pct:x.position_pct})),
    conflict_state:conflictState,
    conflict_score:conflictScore,
    transition_pressure_state:pressureState,
    transition_pressure_score:pressureScore,
    action_permitted:'WAIT',
    capital_permission:'0R'
  };
  const fingerprint=hash(snapshotCore);

  return res.status(200).json({
    ok:true,
    version:'q4-machine-v4',
    generated_at:new Date().toISOString(),
    conflict_resolution:{
      state:conflictState,
      rule_score:conflictScore,
      score_label:'DETERMINISTIC_CONFLICT_INTENSITY_NOT_PROBABILITY',
      tactical_side:tactical,
      append_only_desk_side:structural,
      cross_asset_gold_side:crossAsset,
      macro_alignment:macro||'WITHHELD',
      evidence:conflictEvidence,
      resolution,
      explanation: conflictScore>=45
        ?'Signal families disagree. Preserve WAIT until tactical, desk and broader structure converge or the governed desk changes state.'
        :'Signal families are comparatively aligned, but execution permission remains governed elsewhere.'
    },
    cross_timeframe_consensus:{
      state:split?'SPLIT_LOCATION_REGIME':'LOCATION_CONSENSUS',
      dominant_family:String(dominant[0]),
      dominant_strength_pct:dominantStrength,
      weighted_location_score:weighted,
      score_label:'LOCATION_ONLY_NOT_DIRECTIONAL_FORECAST',
      premium_count:counts.PREMIUM,
      discount_count:counts.DISCOUNT,
      midrange_count:counts.MIDRANGE,
      timeframes:tf,
      interpretation:weighted>0?'PREMIUM_LEANING_LOCATION':weighted<0?'DISCOUNT_LEANING_LOCATION':'BALANCED_LOCATION'
    },
    regime_transition_pressure:{
      state:pressureState,
      rule_score:pressureScore,
      score_label:'HEURISTIC_PRESSURE_NOT_CALIBRATED_PROBABILITY',
      recent_daily_bias_flips:recentBiasFlips,
      latest_material_transition:transition?.latest_material_transition??null,
      desk_state:transition?.current?.desk_state??'WITHHELD',
      desk_daily_bias:transition?.current?.daily_bias??'WITHHELD',
      desk_daily_structure:transition?.current?.daily_structure??'WITHHELD',
      direction_context:`${structural}_DESK_WITH_${tactical}_TACTICAL`
    },
    frozen_snapshot:{
      snapshot_id:`Q4V4-${fingerprint.slice(0,16).toUpperCase()}`,
      sha256:fingerprint,
      persistence:'EPHEMERAL_MACHINE_SNAPSHOT',
      canonical_persistent_reference:{
        ledger:'public-gold-transition-state',
        snapshot_id:transition?.current?.snapshot_id??null,
        transition_sha256:transition?.latest_transition?.transition_sha256??null,
        append_only_source:transition?.governance?.append_only_source===true
      },
      inputs:snapshotCore
    },
    decision_compression:{
      what_changed:`${conflictState.replaceAll('_',' ')} · ${pressureState.replaceAll('_',' ')}`,
      what_matters_now:`${tactical} tactical vs ${structural} desk vs ${crossAsset} cross-asset · ${String(dominant[0])} location family ${dominantStrength}%`,
      action_permitted:'WAIT',
      capital_permission:'0R'
    },
    governance:{
      research_only:true,
      automatic_execution:false,
      action_permitted:'WAIT',
      capital_permission:'0R',
      note:'V4 resolves conflicts and fingerprints state. Conflict scores and transition pressure are deterministic diagnostics, not probabilities or trade signals.'
    }
  });
}
