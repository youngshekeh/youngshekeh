const VERSION='v82-gold-mtf-confluence-v1';

async function getJson(path,timeout=12000){
  try{
    const r=await fetch(`https://thefatheranalytics.com${path}`,{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS/82.0'},
      cache:'no-store',
      signal:AbortSignal.timeout(timeout)
    });
    return {ok:r.ok,status:r.status,body:await r.json().catch(()=>null)};
  }catch(error){return {ok:false,status:0,body:null,error:String(error).slice(0,160)}}
}
function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function cluster(levels,price){
  const xs=(levels||[]).filter(x=>n(x?.price)!==null).map(x=>({label:String(x.label),price:n(x.price)})).sort((a,b)=>a.price-b.price);
  if(!xs.length)return [];
  const tolerance=Math.max(3,Math.abs(price||xs[0].price)*0.0015);
  const groups=[];
  let g=[xs[0]];
  for(let i=1;i<xs.length;i++){
    if(xs[i].price-g.at(-1).price<=tolerance)g.push(xs[i]);
    else{groups.push(g);g=[xs[i]]}
  }
  groups.push(g);
  return groups.map(items=>{
    const center=items.reduce((s,x)=>s+x.price,0)/items.length;
    return {
      center:Number(center.toFixed(2)),
      low:Number(Math.min(...items.map(x=>x.price)).toFixed(2)),
      high:Number(Math.max(...items.map(x=>x.price)).toFixed(2)),
      strength:items.length,
      labels:items.map(x=>x.label),
      distance_pct:price?Number(((center-price)/price*100).toFixed(3)):null
    };
  });
}
function pickNearest(clusters,price,side){
  const x=clusters.filter(c=>side==='above'?c.center>price:c.center<price);
  return x.sort((a,b)=>side==='above'?a.center-b.center:b.center-a.center)[0]||null;
}
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'})}
  const [state,zones,quality]=await Promise.all([
    getJson('/api/gold-liquidity-state-machine'),
    getJson('/api/gold-mtf-zones'),
    getJson('/api/data-quality-sentinel')
  ]);
  const usable=state.ok&&state.body?.ok&&zones.ok&&zones.body?.ok&&quality.ok&&quality.body?.ok;
  const price=n(state.body?.price??zones.body?.price);
  const above=zones.body?.liquidity_ladder?.above||[];
  const below=zones.body?.liquidity_ladder?.below||[];
  const all=[...above,...below];
  const clusters=cluster(all,price);
  const nearestAbove=pickNearest(clusters,price,'above');
  const nearestBelow=pickNearest(clusters,price,'below');

  const dir=state.body?.state?.direction||'NONE';
  const phase=state.body?.state?.phase||'DATA_GATED';
  const mtfPos=n(zones.body?.composite?.average_position_pct);
  let tension='NEUTRAL_OR_MIXED';
  let countertrendRisk='NORMAL';
  if(dir==='DOWN'&&mtfPos!==null&&mtfPos<=20){
    tension='DOWNSIDE_EXPANSION_AT_DEEP_MTF_DISCOUNT';
    countertrendRisk='ELEVATED';
  }else if(dir==='UP'&&mtfPos!==null&&mtfPos>=80){
    tension='UPSIDE_EXPANSION_AT_DEEP_MTF_PREMIUM';
    countertrendRisk='ELEVATED';
  }else if(dir==='DOWN'&&mtfPos!==null&&mtfPos<50)tension='DOWNSIDE_ALIGNED_WITH_DISCOUNT_SIDE';
  else if(dir==='UP'&&mtfPos!==null&&mtfPos>50)tension='UPSIDE_ALIGNED_WITH_PREMIUM_SIDE';

  const piv=zones.body?.daily_pivots||{};
  const dayZone=(zones.body?.zones||[]).find(x=>x.timeframe==='daily')||{};
  const weekZone=(zones.body?.zones||[]).find(x=>x.timeframe==='weekly')||{};
  const repairCandidates=[
    nearestAbove,
    n(piv.s2)!==null?{center:n(piv.s2),labels:['DAILY_S2'],strength:1}:null,
    n(dayZone.mid)!==null?{center:n(dayZone.mid),labels:['DAY_MID'],strength:1}:null,
    n(zones.body?.prior_periods?.day?.low)!==null?{center:n(zones.body.prior_periods.day.low),labels:['PRIOR_DAY_LOW'],strength:1}:null,
    n(state.body?.state?.invalidation_level)!==null?{center:n(state.body.state.invalidation_level),labels:['V79_INVALIDATION_REFERENCE'],strength:1}:null
  ].filter(Boolean).sort((a,b)=>a.center-b.center);

  const continuationCondition=dir==='DOWN'
    ? `Sustained acceptance below ${nearestBelow?nearestBelow.center:'nearest downside cluster'} with V76 quality intact and V80 persistence confirmation`
    : dir==='UP'
      ? `Sustained acceptance above ${nearestAbove?nearestAbove.center:'nearest upside cluster'} with V76 quality intact and V80 persistence confirmation`
      : 'No directional continuation condition while state is neutral/gated';

  const repairCondition=dir==='DOWN'
    ? `Reclaim above the nearest overhead cluster${nearestAbove?` near ${nearestAbove.center}`:''}, then recover successive repair levels`
    : dir==='UP'
      ? `Lose the nearest support cluster${nearestBelow?` near ${nearestBelow.center}`:''}, then fail successive support levels`
      : 'No directional repair condition while state is neutral/gated';

  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
    ok:usable,
    version:VERSION,
    generated_at:new Date().toISOString(),
    truth_label:'FRAMEWORK_DERIVED_CONFLUENCE',
    price,
    quality_state:quality.body?.state??'UNAVAILABLE',
    intraday:{
      phase,
      direction:dir,
      acceptance:state.body?.state?.acceptance??'WITHHELD',
      pressure_score:state.body?.state?.pressure_score??null,
      extension_state:state.body?.state?.extension_state??null,
      failed_break_risk:state.body?.state?.failed_break_risk??null,
      invalidation_level:state.body?.state?.invalidation_level??null
    },
    multi_timeframe:{
      average_position_pct:mtfPos,
      state:zones.body?.composite?.state??null,
      daily_location:dayZone?.location??null,
      weekly_location:weekZone?.location??null,
      monthly_location:(zones.body?.zones||[]).find(x=>x.timeframe==='monthly')?.location??null,
      quarterly_location:(zones.body?.zones||[]).find(x=>x.timeframe==='quarterly')?.location??null,
      yearly_location:(zones.body?.zones||[]).find(x=>x.timeframe==='yearly')?.location??null
    },
    confluence:{
      tension,
      countertrend_risk:countertrendRisk,
      nearest_above_cluster:nearestAbove,
      nearest_below_cluster:nearestBelow,
      all_clusters:clusters
    },
    scenarios:{
      continuation:{
        name:dir==='DOWN'?'DRAGON_CONTINUATION':dir==='UP'?'HERO_CONTINUATION':'NO_DIRECTION',
        condition:continuationCondition,
        note:'Condition, not forecast.'
      },
      repair:{
        name:dir==='DOWN'?'HERO_REPAIR':dir==='UP'?'DRAGON_REPAIR':'NO_DIRECTION',
        condition:repairCondition,
        ladder:repairCandidates.slice(0,6),
        note:'Repair ladder consists of observed/framework structural references, not profit targets.'
      }
    },
    decision_compression:{
      what_changed:`Intraday state is ${phase}; multi-timeframe average location is ${mtfPos===null?'unavailable':mtfPos+'%'}.`,
      what_matters:`${tension}. Nearest downside cluster: ${nearestBelow?nearestBelow.center:'none'}; nearest overhead cluster: ${nearestAbove?nearestAbove.center:'none'}.`,
      action_permitted:'WAIT',
      capital_permission:'0R'
    },
    governance:{
      canonical:false,
      automatic_execution:false,
      action_permitted:'WAIT',
      capital_permission:'0R',
      rule:'Confluence can describe tension and conditional paths. It cannot assert certainty or grant capital permission.'
    }
  });
}