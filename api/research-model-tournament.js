const VERSION='v77-champion-challenger-v1';

async function getJson(path,timeout=9000){
  try{
    const r=await fetch(`https://thefatheranalytics.com${path}`,{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS/77.0'},
      cache:'no-store',
      signal:AbortSignal.timeout(timeout)
    });
    return {ok:r.ok,status:r.status,body:await r.json().catch(()=>null)};
  }catch(error){return {ok:false,status:0,body:null,error:String(error).slice(0,160)}}
}
function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function make(name,direction,reason,score){
  return {model:name,direction,reason,shadow_score:score,canonical:false,promotion_allowed:false};
}
function classify(day,quality){
  if(quality?.state!=='PASS'&&quality?.state!=='PASS_WITH_WARNINGS'){
    return [
      make('breakout_conservative_v1','NONE','V76 quality gate not open',0),
      make('structure_balanced_v1','NONE','V76 quality gate not open',0),
      make('reversal_specialist_v1','NONE','V76 quality gate not open',0),
      make('regime_baseline_v1','NONE','V76 quality gate not open',0)
    ];
  }
  const s=day?.day_state??{},r=n(s.range_vs_adr)??0,q=n(s.breakout_quality)??0;
  const belowVwap=s.vwap_relation==='BELOW',aboveVwap=s.vwap_relation==='ABOVE';
  const belowValue=s.profile_relation==='BELOW_VALUE',aboveValue=s.profile_relation==='ABOVE_VALUE';
  const belowOR=s.opening_range_relation==='BELOW_OR',aboveOR=s.opening_range_relation==='ABOVE_OR';
  const breakDown=!!s.break_prior_low,breakUp=!!s.break_prior_high;
  const sweepLow=!!s.sweep_prior_low,sweepHigh=!!s.sweep_prior_high;
  const out=[];

  let d='NONE',reason='No strict breakout alignment',score=0;
  if(breakDown&&r>=0.9&&q>=80&&belowVwap&&belowValue&&belowOR){d='DOWN';reason='Prior-low break + >0.9x ADR + below VWAP/value/opening range';score=4}
  else if(breakUp&&r>=0.9&&q>=80&&aboveVwap&&aboveValue&&aboveOR){d='UP';reason='Prior-high break + >0.9x ADR + above VWAP/value/opening range';score=4}
  out.push(make('breakout_conservative_v1',d,reason,score));

  d='NONE';reason='Structure remains mixed';score=0;
  if((breakDown||s.day_state==='TREND_DOWN'||s.day_state==='BREAKOUT_DOWN')&&r>=0.65&&belowVwap){d='DOWN';reason='Bearish structure + range expansion + below VWAP';score=3}
  else if((breakUp||s.day_state==='TREND_UP'||s.day_state==='BREAKOUT_UP')&&r>=0.65&&aboveVwap){d='UP';reason='Bullish structure + range expansion + above VWAP';score=3}
  out.push(make('structure_balanced_v1',d,reason,score));

  d='NONE';reason='No qualifying liquidity-sweep reversal';score=0;
  if(sweepLow&&aboveVwap){d='UP';reason='Prior-low sweep reclaimed above VWAP';score=2}
  else if(sweepHigh&&belowVwap){d='DOWN';reason='Prior-high sweep rejected below VWAP';score=2}
  out.push(make('reversal_specialist_v1',d,reason,score));

  d='NONE';reason='No baseline directional regime';score=0;
  if(['BREAKOUT_DOWN','TREND_DOWN'].includes(String(s.day_state))){d='DOWN';reason=`Day state ${s.day_state}`;score=1}
  else if(['BREAKOUT_UP','TREND_UP'].includes(String(s.day_state))){d='UP';reason=`Day state ${s.day_state}`;score=1}
  out.push(make('regime_baseline_v1',d,reason,score));
  return out;
}
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'})}
  const [day,quality]=await Promise.all([
    getJson('/api/gold-day-state'),
    getJson('/api/data-quality-sentinel')
  ]);
  const usable=day.ok&&day.body?.ok&&quality.ok&&quality.body?.ok;
  const models=classify(day.body,quality.body);
  const directional=models.filter(x=>x.direction==='UP'||x.direction==='DOWN');
  const up=directional.filter(x=>x.direction==='UP').length,down=directional.filter(x=>x.direction==='DOWN').length;
  const consensus=directional.length===0?'ABSTAIN':up===directional.length?'UP_UNANIMOUS':down===directional.length?'DOWN_UNANIMOUS':up>down?'UP_MAJORITY':down>up?'DOWN_MAJORITY':'MIXED';
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
    ok:usable,
    version:VERSION,
    observed_at:new Date().toISOString(),
    truth_label:'SHADOW_MODEL_TOURNAMENT',
    quality_state:quality.body?.state??'UNAVAILABLE',
    gold_price:day.body?.current?.price??null,
    source_day_state:day.body?.day_state?.day_state??null,
    features:{
      range_vs_adr:day.body?.day_state?.range_vs_adr??null,
      breakout_quality:day.body?.day_state?.breakout_quality??null,
      vwap_relation:day.body?.day_state?.vwap_relation??null,
      profile_relation:day.body?.day_state?.profile_relation??null,
      opening_range_relation:day.body?.day_state?.opening_range_relation??null,
      sweep_prior_high:day.body?.day_state?.sweep_prior_high??null,
      sweep_prior_low:day.body?.day_state?.sweep_prior_low??null
    },
    tournament:{models,consensus,directional_models:directional.length},
    governance:{
      canonical:false,
      action_permitted:'WAIT',
      capital_permission:'0R',
      automatic_model_promotion:false,
      human_review_required:true,
      rule:'Models compete only in shadow research. Tournament results cannot alter canonical execution permission.'
    }
  });
}