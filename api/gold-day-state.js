const UA='THE-FATHER-ANALYTICS/75.0';

async function chart(){
  const url='https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=5m&range=5d&includePrePost=true';
  const started=Date.now();
  try{
    const r=await fetch(url,{headers:{'User-Agent':UA,Accept:'application/json'},signal:AbortSignal.timeout(6500)});
    if(!r.ok)return {ok:false,status:r.status,latency_ms:Date.now()-started};
    const j=await r.json();
    const x=j?.chart?.result?.[0];
    if(!x)return {ok:false,status:r.status,latency_ms:Date.now()-started};
    return {ok:true,status:r.status,latency_ms:Date.now()-started,result:x};
  }catch(error){return {ok:false,status:0,latency_ms:Date.now()-started,error:String(error).slice(0,160)}}
}
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function chicago(ts){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(ts*1000));
  const get=t=>p.find(x=>x.type===t)?.value||'0';
  return {year:+get('year'),month:+get('month'),day:+get('day'),hour:+get('hour'),minute:+get('minute')};
}
function sessionLabel(ts){
  const p=chicago(ts);
  const base=new Date(Date.UTC(p.year,p.month-1,p.day,12));
  if(p.hour*60+p.minute>=17*60)base.setUTCDate(base.getUTCDate()+1);
  return base.toISOString().slice(0,10);
}
function summarize(bars){
  if(!bars.length)return null;
  const sorted=[...bars].sort((a,b)=>a.ts-b.ts);
  const vol=sorted.reduce((s,b)=>s+(b.volume||0),0);
  const vwapNum=sorted.reduce((s,b)=>s+(((b.high+b.low+b.close)/3)*(b.volume||0)),0);
  return {
    label:sorted[0].session,
    open:sorted[0].open,
    high:Math.max(...sorted.map(b=>b.high)),
    low:Math.min(...sorted.map(b=>b.low)),
    close:sorted.at(-1).close,
    range:Math.max(...sorted.map(b=>b.high))-Math.min(...sorted.map(b=>b.low)),
    volume:vol,
    vwap:vol>0?vwapNum/vol:null,
    bars:sorted
  };
}
function volumeProfile(bars,bins=24){
  if(!bars.length)return null;
  const lo=Math.min(...bars.map(b=>b.low)),hi=Math.max(...bars.map(b=>b.high));
  if(!(hi>lo))return null;
  const width=(hi-lo)/bins,vols=Array(bins).fill(0);
  for(const b of bars){
    const px=(b.high+b.low+b.close)/3;
    const i=Math.max(0,Math.min(bins-1,Math.floor((px-lo)/width)));
    vols[i]+=b.volume||0;
  }
  const total=vols.reduce((a,b)=>a+b,0);
  if(total<=0)return null;
  let poc=vols.indexOf(Math.max(...vols)),left=poc,right=poc,area=vols[poc];
  while(area/total<0.70&&(left>0||right<bins-1)){
    const lv=left>0?vols[left-1]:-1,rv=right<bins-1?vols[right+1]:-1;
    if(rv>=lv&&right<bins-1){right++;area+=vols[right]}else if(left>0){left--;area+=vols[left]}
    else break;
  }
  const center=i=>lo+(i+.5)*width;
  return {method:'5m_bar_volume_profile_proxy',poc:+center(poc).toFixed(2),val:+(lo+left*width).toFixed(2),vah:+(lo+(right+1)*width).toFixed(2),value_area_pct:+(area/total*100).toFixed(1),bins};
}
function nearestLevels(price,levels){
  const clean=levels.filter(x=>Number.isFinite(x.price));
  const above=clean.filter(x=>x.price>price).sort((a,b)=>a.price-b.price)[0]||null;
  const below=clean.filter(x=>x.price<price).sort((a,b)=>b.price-a.price)[0]||null;
  return {above,below};
}
function classify(cur,prev,adr,or,vp){
  const close=cur.close,range=cur.range,position=range>0?(close-cur.low)/range:.5,ratio=adr>0?range/adr:null;
  const breakHigh=prev?close>prev.high:false,breakLow=prev?close<prev.low:false;
  const highSweep=prev?cur.high>prev.high&&close<=prev.high:false;
  const lowSweep=prev?cur.low<prev.low&&close>=prev.low:false;
  let state='BALANCED_ROTATION';
  if(highSweep&&lowSweep)state='TWO_SIDED_LIQUIDITY_DAY';
  else if(highSweep)state='HIGH_SWEEP_REJECTION';
  else if(lowSweep)state='LOW_SWEEP_REJECTION';
  else if(breakHigh&&ratio!==null&&ratio>=.75)state='BREAKOUT_UP';
  else if(breakLow&&ratio!==null&&ratio>=.75)state='BREAKOUT_DOWN';
  else if(cur.vwap!==null&&close>cur.vwap&&position>=.72&&ratio!==null&&ratio>=.65)state='TREND_UP';
  else if(cur.vwap!==null&&close<cur.vwap&&position<=.28&&ratio!==null&&ratio>=.65)state='TREND_DOWN';
  else if(ratio!==null&&ratio<=.55)state='RANGE_COMPRESSION';
  const boundary=breakHigh?prev.high:breakLow?prev.low:null;
  const dist=boundary!==null?Math.abs(close-boundary):0;
  const breakoutQuality=boundary!==null&&adr>0?Math.min(100,Math.round(40+Math.min(40,dist/adr*200)+(breakHigh?position*20:(1-position)*20))):0;
  const signalDay=(highSweep||lowSweep)&&(cur.vwap!==null)&&((lowSweep&&close>cur.vwap)||(highSweep&&close<cur.vwap));
  return {day_state:state,framework_signal_day:signalDay,range_vs_adr:ratio===null?null:+ratio.toFixed(3),range_position:+position.toFixed(3),
    break_prior_high:breakHigh,break_prior_low:breakLow,sweep_prior_high:highSweep,sweep_prior_low:lowSweep,
    breakout_quality:breakoutQuality,vwap_relation:cur.vwap===null?'UNAVAILABLE':close>=cur.vwap?'ABOVE':'BELOW',
    profile_relation:vp?close>vp.vah?'ABOVE_VALUE':close<vp.val?'BELOW_VALUE':'INSIDE_VALUE':'UNAVAILABLE',
    opening_range_relation:or?close>or.high?'ABOVE_OR':close<or.low?'BELOW_OR':'INSIDE_OR':'UNAVAILABLE'};
}
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'})}
  const c=await chart();
  if(!c.ok)return res.status(200).json({ok:false,version:'v75-gold-day-state-v1',state:'DATA_UNAVAILABLE',governance:{action:'WAIT',capital_permission:'0R'}});
  const ts=c.result.timestamp||[],q=c.result.indicators?.quote?.[0]||{};
  const bars=[];
  for(let i=0;i<ts.length;i++){
    const open=finite(q.open?.[i]),high=finite(q.high?.[i]),low=finite(q.low?.[i]),close=finite(q.close?.[i]);
    if([open,high,low,close].some(v=>v===null))continue;
    bars.push({ts:ts[i],session:sessionLabel(ts[i]),open,high,low,close,volume:finite(q.volume?.[i])||0});
  }
  const groups=new Map();
  for(const b of bars){if(!groups.has(b.session))groups.set(b.session,[]);groups.get(b.session).push(b)}
  const sessions=[...groups.entries()].map(([label,x])=>summarize(x)).filter(Boolean).sort((a,b)=>a.bars[0].ts-b.bars[0].ts);
  const cur=sessions.at(-1),prev=sessions.at(-2);
  if(!cur||!prev)return res.status(200).json({ok:false,version:'v75-gold-day-state-v1',state:'INSUFFICIENT_SESSION_HISTORY',governance:{action:'WAIT',capital_permission:'0R'}});
  const prior=sessions.slice(0,-1).slice(-3);
  const adr=prior.length?prior.reduce((s,x)=>s+x.range,0)/prior.length:null;
  const orBars=cur.bars.slice(0,Math.min(12,cur.bars.length));
  const or=orBars.length?{high:Math.max(...orBars.map(b=>b.high)),low:Math.min(...orBars.map(b=>b.low)),bars:orBars.length}:null;
  const vp=volumeProfile(cur.bars);
  const state=classify(cur,prev,adr,or,vp);
  const weekHigh=Math.max(...sessions.map(x=>x.high)),weekLow=Math.min(...sessions.map(x=>x.low));
  const levels=[
    {label:'PRIOR_SESSION_HIGH',price:prev.high},{label:'PRIOR_SESSION_LOW',price:prev.low},
    {label:'WEEK_WINDOW_HIGH',price:weekHigh},{label:'WEEK_WINDOW_LOW',price:weekLow},
    ...(or?[{label:'SESSION_OPEN_RANGE_HIGH',price:or.high},{label:'SESSION_OPEN_RANGE_LOW',price:or.low}]:[]),
    ...(vp?[{label:'PROFILE_VAH_PROXY',price:vp.vah},{label:'PROFILE_VAL_PROXY',price:vp.val},{label:'PROFILE_POC_PROXY',price:vp.poc}]:[])
  ];
  const nearest=nearestLevels(cur.close,levels);
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
    ok:true,version:'v75-gold-day-state-v1',generated_at:new Date().toISOString(),truth_label:'SHADOW_QUANT_RESEARCH',
    symbol:'GC=F',market_session:'MARKET_OPEN_OR_DELAYED_FEED',session_label:cur.label,
    current:{open:+cur.open.toFixed(2),high:+cur.high.toFixed(2),low:+cur.low.toFixed(2),price:+cur.close.toFixed(2),vwap:cur.vwap===null?null:+cur.vwap.toFixed(2),range:+cur.range.toFixed(2)},
    previous:{label:prev.label,high:+prev.high.toFixed(2),low:+prev.low.toFixed(2),close:+prev.close.toFixed(2),range:+prev.range.toFixed(2)},
    range_model:{adr3:adr===null?null:+adr.toFixed(2),range_vs_adr:state.range_vs_adr},
    opening_range:or?{high:+or.high.toFixed(2),low:+or.low.toFixed(2),bars:or.bars}:null,
    volume_profile_proxy:vp,
    day_state:state,
    liquidity:{nearest_above:nearest.above,nearest_below:nearest.below,week_window_high:+weekHigh.toFixed(2),week_window_low:+weekLow.toFixed(2)},
    methodology:{bar_interval:'5m',history:'5d',profile:'Bar-volume proxy, not exchange tick volume',adr:'Average completed session range over up to 3 prior sessions',classification:'Deterministic transparent rules'},
    governance:{canonical:false,action_permitted:'WAIT',capital_permission:'0R',promotion_allowed:false,note:'Research-only day-state classification; not an execution signal.'}
  });
}
