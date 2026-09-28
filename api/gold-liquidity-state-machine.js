const VERSION='v79-gold-liquidity-state-machine-v1';

async function getJson(path,timeout=10000){
  const started=Date.now();
  try{
    const r=await fetch(`https://thefatheranalytics.com${path}`,{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS/79.0'},
      cache:'no-store',
      signal:AbortSignal.timeout(timeout)
    });
    return {ok:r.ok,status:r.status,latency_ms:Date.now()-started,body:await r.json().catch(()=>null)};
  }catch(error){return {ok:false,status:0,latency_ms:Date.now()-started,body:null,error:String(error).slice(0,160)}}
}
function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function pct(a,b){return a&&b?((a-b)/b)*100:null}
function stateMachine(day,quality,tournament){
  if(!day?.ok||!quality?.ok||!tournament?.ok){
    return {phase:'DATA_GATED',direction:'NONE',acceptance:'WITHHELD',invalidation:null,confidence_state:'WITHHELD'};
  }
  if(quality.state==='QUARANTINE'){
    return {phase:'QUALITY_QUARANTINE',direction:'NONE',acceptance:'BLOCKED',invalidation:null,confidence_state:'WITHHELD'};
  }
  const s=day.day_state||{};
  const cur=day.current||{};
  const prev=day.previous||{};
  const or=day.opening_range||{};
  const vp=day.volume_profile_proxy||{};
  const price=n(cur.price),vwap=n(cur.vwap),priorLow=n(prev.low),priorHigh=n(prev.high),orLow=n(or.low),orHigh=n(or.high),val=n(vp.val),vah=n(vp.vah),poc=n(vp.poc);
  const rangeRatio=n(s.range_vs_adr)||0;
  const breakout=n(s.breakout_quality)||0;
  const belowVwap=s.vwap_relation==='BELOW',aboveVwap=s.vwap_relation==='ABOVE';
  const belowValue=s.profile_relation==='BELOW_VALUE',aboveValue=s.profile_relation==='ABOVE_VALUE';
  const belowOR=s.opening_range_relation==='BELOW_OR',aboveOR=s.opening_range_relation==='ABOVE_OR';
  const downConsensus=String(tournament?.tournament?.consensus||'').startsWith('DOWN');
  const upConsensus=String(tournament?.tournament?.consensus||'').startsWith('UP');
  let phase='BALANCED_ROTATION',direction='NEUTRAL',acceptance='UNCONFIRMED',invalidation=null;
  let pressure=0;
  const evidence=[];

  if(s.sweep_prior_low&&price!==null&&priorLow!==null&&price>=priorLow){
    phase='LOW_LIQUIDITY_RAID_RECLAIM';
    direction='UP_REPAIR';
    acceptance=aboveVwap?'RECLAIM_ACCEPTED':'RECLAIM_TENTATIVE';
    invalidation=priorLow;
    pressure=2;
    evidence.push('prior_low_swept_and_reclaimed');
  }else if(s.sweep_prior_high&&price!==null&&priorHigh!==null&&price<=priorHigh){
    phase='HIGH_LIQUIDITY_RAID_REJECTION';
    direction='DOWN_REPAIR';
    acceptance=belowVwap?'REJECTION_ACCEPTED':'REJECTION_TENTATIVE';
    invalidation=priorHigh;
    pressure=-2;
    evidence.push('prior_high_swept_and_rejected');
  }else if(s.break_prior_low&&belowVwap&&belowValue&&belowOR){
    phase=rangeRatio>=1.0?'DOWNSIDE_EXPANSION_DELIVERY':'DOWNSIDE_BREAKOUT_ACCEPTANCE';
    direction='DOWN';
    acceptance=breakout>=85?'ACCEPTED':'TENTATIVE';
    invalidation=Math.max(...[priorLow,val,orLow].filter(x=>x!==null));
    pressure=-4;
    evidence.push('prior_low_broken','below_vwap','below_value','below_opening_range');
    if(downConsensus){pressure-=1;evidence.push('shadow_models_down_consensus')}
  }else if(s.break_prior_high&&aboveVwap&&aboveValue&&aboveOR){
    phase=rangeRatio>=1.0?'UPSIDE_EXPANSION_DELIVERY':'UPSIDE_BREAKOUT_ACCEPTANCE';
    direction='UP';
    acceptance=breakout>=85?'ACCEPTED':'TENTATIVE';
    invalidation=Math.min(...[priorHigh,vah,orHigh].filter(x=>x!==null));
    pressure=4;
    evidence.push('prior_high_broken','above_vwap','above_value','above_opening_range');
    if(upConsensus){pressure+=1;evidence.push('shadow_models_up_consensus')}
  }else if(price!==null&&poc!==null&&Math.abs(pct(price,poc)||0)<0.15){
    phase='VALUE_ROTATION';
    direction='NEUTRAL';
    acceptance='INSIDE_VALUE';
    invalidation=null;
    evidence.push('price_near_profile_poc');
  }else if(belowVwap&&price!==null&&priorLow!==null&&price<priorLow){
    phase='BEARISH_DELIVERY_UNCONFIRMED';
    direction='DOWN';
    acceptance='PARTIAL';
    invalidation=priorLow;
    pressure=-2;
    evidence.push('below_vwap_and_prior_low');
  }else if(aboveVwap&&price!==null&&priorHigh!==null&&price>priorHigh){
    phase='BULLISH_DELIVERY_UNCONFIRMED';
    direction='UP';
    acceptance='PARTIAL';
    invalidation=priorHigh;
    pressure=2;
    evidence.push('above_vwap_and_prior_high');
  }

  const extension=rangeRatio>=1.25?'EXTENDED':rangeRatio>=1?'EXPANDED':rangeRatio>=0.65?'DEVELOPING':'COMPRESSED';
  const exhaustionRisk=(rangeRatio>=1.5&&Math.abs(pressure)>=4)?'ELEVATED':rangeRatio>=1.25?'WATCH':'NORMAL';
  const failedBreakRisk=(direction==='DOWN'&&price!==null&&val!==null&&price>val)||(direction==='UP'&&price!==null&&vah!==null&&price<vah)?'ELEVATED':'NORMAL';

  return {
    phase,direction,acceptance,
    pressure_score:pressure,
    extension_state:extension,
    exhaustion_risk:exhaustionRisk,
    failed_break_risk:failedBreakRisk,
    invalidation_level:invalidation===null?null:Number(invalidation.toFixed(2)),
    evidence,
    confidence_state:'RULE_BASED_NOT_PROBABILISTIC'
  };
}
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'})}
  const [day,quality,tournament]=await Promise.all([
    getJson('/api/gold-day-state'),
    getJson('/api/data-quality-sentinel'),
    getJson('/api/research-model-tournament')
  ]);
  const body=stateMachine(day.body,quality.body,tournament.body);
  const price=n(day.body?.current?.price);
  const above=day.body?.liquidity?.nearest_above||null;
  const below=day.body?.liquidity?.nearest_below||null;
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
    ok:day.ok&&quality.ok&&tournament.ok,
    version:VERSION,
    observed_at:new Date().toISOString(),
    truth_label:'SHADOW_STATE_MACHINE',
    quality_state:quality.body?.state??'UNAVAILABLE',
    source_day_state:day.body?.day_state?.day_state??null,
    price,
    state:body,
    liquidity_map:{
      nearest_above:above,
      nearest_below:below,
      current_draw:body.direction==='DOWN'?below:body.direction==='UP'?above:null,
      note:'Liquidity levels are structural reference points, not guaranteed targets.'
    },
    transition_rules:{
      downside_acceptance:'prior low broken + below VWAP + below value + below opening range',
      upside_acceptance:'prior high broken + above VWAP + above value + above opening range',
      reclaim:'swept level reclaimed back through the level',
      quality_gate:'V76 must not be QUARANTINE'
    },
    governance:{
      canonical:false,
      action_permitted:'WAIT',
      capital_permission:'0R',
      automatic_execution:false,
      rule:'V79 describes state transitions only. It cannot convert research structure into execution permission.'
    }
  });
}