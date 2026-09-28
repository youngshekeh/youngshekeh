const VERSION='v76-data-quality-sentinel-v1';

async function getJson(url,timeout=8000){
  const started=Date.now();
  try{
    const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS/76.0'},cache:'no-store',signal:AbortSignal.timeout(timeout)});
    const body=await r.json().catch(()=>null);
    return {ok:r.ok&&!!body,status:r.status,latency_ms:Date.now()-started,body};
  }catch(error){
    return {ok:false,status:0,latency_ms:Date.now()-started,body:null,error:String(error).slice(0,160)};
  }
}
function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function ageMinutes(v){const t=new Date(v||0).getTime();return Number.isFinite(t)&&t>0?Math.max(0,(Date.now()-t)/60000):null}
function add(arr,code,severity,detail){arr.push({code,severity,detail})}
function validBar(name,bar,issues){
  if(!bar||typeof bar!=='object'){add(issues,`${name}_MISSING`,'critical',`${name} object missing`);return}
  const o=n(bar.open),h=n(bar.high),l=n(bar.low),c=n(bar.price??bar.close);
  for(const [k,v] of [['open',o],['high',h],['low',l],['close',c]]){
    if(v===null)add(issues,`${name}_${String(k).toUpperCase()}_MISSING`,'critical',`${name} ${k} unavailable`);
    else if(v<=0)add(issues,`${name}_${String(k).toUpperCase()}_NONPOSITIVE`,'critical',`${name} ${k}=${v}`);
  }
  if([o,h,l,c].every(v=>v!==null)){
    if(h<Math.max(o,l,c))add(issues,`${name}_HIGH_GEOMETRY_INVALID`,'critical',`high ${h} below another OHLC field`);
    if(l>Math.min(o,h,c))add(issues,`${name}_LOW_GEOMETRY_INVALID`,'critical',`low ${l} above another OHLC field`);
    if(h<l)add(issues,`${name}_HIGH_BELOW_LOW`,'critical',`high ${h} < low ${l}`);
  }
}
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'})}
  const [day,shadow]=await Promise.all([
    getJson('https://thefatheranalytics.com/api/gold-day-state'),
    getJson('https://thefatheranalytics.com/api/shadow-market-snapshot')
  ]);
  const issues=[];
  if(!day.ok||!day.body?.ok)add(issues,'DAY_STATE_SOURCE_UNAVAILABLE','critical',`status ${day.status}`);
  if(!shadow.ok||!shadow.body?.ok)add(issues,'SHADOW_SOURCE_UNAVAILABLE','critical',`status ${shadow.status}`);
  if(day.body?.ok){
    validBar('CURRENT',day.body.current,issues);
    validBar('PREVIOUS',{...day.body.previous,open:day.body.previous?.close,price:day.body.previous?.close},issues);
    const p=day.body.volume_profile_proxy;
    if(p){
      const val=n(p.val),poc=n(p.poc),vah=n(p.vah);
      if([val,poc,vah].some(v=>v===null))add(issues,'PROFILE_LEVEL_MISSING','important','VAL/POC/VAH incomplete');
      else if(!(val<=poc&&poc<=vah))add(issues,'PROFILE_ORDER_INVALID','critical',`VAL ${val}, POC ${poc}, VAH ${vah}`);
    }
    const or=day.body.opening_range;
    if(or){
      const hi=n(or.high),lo=n(or.low);
      if(hi===null||lo===null||hi<=0||lo<=0||hi<lo)add(issues,'OPENING_RANGE_INVALID','critical',`OR low ${lo}, high ${hi}`);
    }
    const generatedAge=ageMinutes(day.body.generated_at);
    if(generatedAge===null||generatedAge>5)add(issues,'DAY_STATE_STALE','important',`age_minutes=${generatedAge}`);
    const rv=n(day.body.day_state?.range_vs_adr);
    if(rv!==null&&(rv<0||rv>10))add(issues,'RANGE_RATIO_OUTLIER','important',`range_vs_adr=${rv}`);
  }
  if(shadow.body?.ok){
    const observedAge=ageMinutes(shadow.body.observed_at);
    if(shadow.body.market_session==='MARKET_OPEN'&&(observedAge===null||observedAge>20))add(issues,'SHADOW_SNAPSHOT_STALE','important',`age_minutes=${observedAge}`);
    const gp=n(shadow.body.gold?.price);
    if(gp===null||gp<=0)add(issues,'SHADOW_GOLD_PRICE_INVALID','critical',`gold_price=${gp}`);
  }
  if(day.body?.ok&&shadow.body?.ok){
    const a=n(day.body.current?.price),b=n(shadow.body.gold?.price);
    if(a!==null&&b!==null&&a>0&&b>0){
      const diff=Math.abs(a-b)/((a+b)/2)*100;
      if(diff>1.5)add(issues,'CROSS_SOURCE_PRICE_DIVERGENCE','critical',`difference_pct=${diff.toFixed(3)}`);
      else if(diff>0.75)add(issues,'CROSS_SOURCE_PRICE_DRIFT','important',`difference_pct=${diff.toFixed(3)}`);
    }
  }
  const critical=issues.filter(x=>x.severity==='critical').length;
  const important=issues.filter(x=>x.severity==='important').length;
  const state=critical>0?'QUARANTINE':important>0?'PASS_WITH_WARNINGS':'PASS';
  const dayPrice=n(day.body?.current?.price),shadowPrice=n(shadow.body?.gold?.price);
  const diffPct=dayPrice&&shadowPrice?Math.abs(dayPrice-shadowPrice)/((dayPrice+shadowPrice)/2)*100:null;
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
    ok:true,version:VERSION,checked_at:new Date().toISOString(),state,
    counts:{critical,important,total:issues.length},
    checks:{
      day_state_http:day.status,shadow_http:shadow.status,
      day_price:dayPrice,shadow_price:shadowPrice,
      cross_source_diff_pct:diffPct===null?null:Number(diffPct.toFixed(4)),
      day_state:day.body?.day_state?.day_state??null,
      day_generated_age_minutes:ageMinutes(day.body?.generated_at),
      shadow_observed_age_minutes:ageMinutes(shadow.body?.observed_at)
    },
    issues,
    governance:{
      quarantine:critical>0,
      action_permitted:'WAIT',
      capital_permission:'0R',
      can_override_canonical:false,
      rule:'Data quality may block downstream research. It can never promote execution permission.'
    }
  });
}