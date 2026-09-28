const VERSION='v81-gold-mtf-zone-engine-v1';
const UA='THE-FATHER-ANALYTICS/81.0';

async function chart(){
  const u='https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=2y&includePrePost=true';
  try{
    const r=await fetch(u,{headers:{'User-Agent':UA,Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(9000)});
    if(!r.ok)return {ok:false,status:r.status};
    const j=await r.json();const x=j?.chart?.result?.[0];
    return x?{ok:true,status:r.status,result:x}:{ok:false,status:r.status};
  }catch(error){return {ok:false,status:0,error:String(error).slice(0,160)}}
}
function num(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function chicagoDate(ts){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ts*1000));
  const get=t=>p.find(x=>x.type===t)?.value||'0';
  return {y:+get('year'),m:+get('month'),d:+get('day')};
}
function keyWeek(dt){
  const date=new Date(Date.UTC(dt.y,dt.m-1,dt.d));
  const day=(date.getUTCDay()+6)%7;
  date.setUTCDate(date.getUTCDate()-day);
  return date.toISOString().slice(0,10);
}
function keyMonth(dt){return `${dt.y}-${String(dt.m).padStart(2,'0')}`}
function keyQuarter(dt){return `${dt.y}-Q${Math.floor((dt.m-1)/3)+1}`}
function keyYear(dt){return String(dt.y)}
function aggregate(bars,keyFn){
  const m=new Map();
  for(const b of bars){
    const k=keyFn(b.dt);
    if(!m.has(k))m.set(k,[]);
    m.get(k).push(b);
  }
  return [...m.entries()].map(([key,x])=>{
    x.sort((a,b)=>a.ts-b.ts);
    const high=Math.max(...x.map(b=>b.high)),low=Math.min(...x.map(b=>b.low));
    return {key,open:x[0].open,high,low,close:x.at(-1).close,mid:(high+low)/2,range:high-low,start:x[0].ts,end:x.at(-1).ts,bars:x.length};
  }).sort((a,b)=>a.start-b.start);
}
function roundObj(o){
  const z={};
  for(const [k,v] of Object.entries(o||{}))z[k]=typeof v==='number'?Number(v.toFixed(2)):v;
  return z;
}
function location(price,p){
  if(!p||!(p.high>p.low)||!Number.isFinite(price))return null;
  const pos=(price-p.low)/(p.high-p.low);
  return {
    position_pct:Number((Math.max(0,Math.min(1,pos))*100).toFixed(1)),
    zone:pos<=.25?'DEEP_DISCOUNT':pos<.5?'DISCOUNT':pos<.75?'PREMIUM':'DEEP_PREMIUM'
  };
}
function pivot(prev){
  if(!prev)return null;
  const P=(prev.high+prev.low+prev.close)/3;
  const R1=2*P-prev.low,S1=2*P-prev.high;
  const R2=P+(prev.high-prev.low),S2=P-(prev.high-prev.low);
  const R3=prev.high+2*(P-prev.low),S3=prev.low-2*(prev.high-P);
  return roundObj({pivot:P,r1:R1,r2:R2,r3:R3,s1:S1,s2:S2,s3:S3});
}
function nearest(price,levels){
  const x=levels.filter(z=>Number.isFinite(z.price));
  return {
    above:x.filter(z=>z.price>price).sort((a,b)=>a.price-b.price).slice(0,6),
    below:x.filter(z=>z.price<price).sort((a,b)=>b.price-a.price).slice(0,6)
  };
}
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'})}
  const c=await chart();
  if(!c.ok)return res.status(200).json({ok:false,version:VERSION,state:'DATA_UNAVAILABLE',governance:{action_permitted:'WAIT',capital_permission:'0R'}});
  const ts=c.result.timestamp||[],q=c.result.indicators?.quote?.[0]||{};
  const bars=[];
  for(let i=0;i<ts.length;i++){
    const open=num(q.open?.[i]),high=num(q.high?.[i]),low=num(q.low?.[i]),close=num(q.close?.[i]);
    if([open,high,low,close].some(v=>v===null)||high<=0||low<=0||high<low)continue;
    bars.push({ts:ts[i],dt:chicagoDate(ts[i]),open,high,low,close});
  }
  if(bars.length<20)return res.status(200).json({ok:false,version:VERSION,state:'INSUFFICIENT_HISTORY',governance:{action_permitted:'WAIT',capital_permission:'0R'}});
  const days=aggregate(bars,dt=>`${dt.y}-${String(dt.m).padStart(2,'0')}-${String(dt.d).padStart(2,'0')}`);
  const weeks=aggregate(bars,keyWeek),months=aggregate(bars,keyMonth),quarters=aggregate(bars,keyQuarter),years=aggregate(bars,keyYear);
  const currentDay=days.at(-1),priorDay=days.at(-2),currentWeek=weeks.at(-1),priorWeek=weeks.at(-2),
    currentMonth=months.at(-1),priorMonth=months.at(-2),currentQuarter=quarters.at(-1),priorQuarter=quarters.at(-2),
    currentYear=years.at(-1),priorYear=years.at(-2);
  const price=currentDay.close;
  const levels=[];
  for(const [prefix,p] of [
    ['DAY',currentDay],['PRIOR_DAY',priorDay],['WEEK',currentWeek],['PRIOR_WEEK',priorWeek],
    ['MONTH',currentMonth],['PRIOR_MONTH',priorMonth],['QUARTER',currentQuarter],['PRIOR_QUARTER',priorQuarter],
    ['YEAR',currentYear],['PRIOR_YEAR',priorYear]
  ]){
    if(!p)continue;
    levels.push({label:`${prefix}_HIGH`,price:p.high},{label:`${prefix}_MID`,price:p.mid},{label:`${prefix}_LOW`,price:p.low});
  }
  const pvt=pivot(priorDay);
  if(pvt){
    for(const k of ['r3','r2','r1','pivot','s1','s2','s3'])levels.push({label:`DAILY_${k.toUpperCase()}`,price:pvt[k]});
  }
  const near=nearest(price,levels);
  const tf=[
    ['daily',currentDay],['weekly',currentWeek],['monthly',currentMonth],['quarterly',currentQuarter],['yearly',currentYear]
  ].map(([name,p])=>({timeframe:name,...roundObj(p),location:location(price,p)}));
  const locs=tf.map(x=>x.location?.position_pct).filter(Number.isFinite);
  const avg=locs.length?locs.reduce((a,b)=>a+b,0)/locs.length:null;
  const structuralPressure=avg===null?'UNAVAILABLE':avg<35?'MULTI_TF_DISCOUNT_PRESSURE':avg>65?'MULTI_TF_PREMIUM_PRESSURE':'MULTI_TF_MIDRANGE';
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
    ok:true,version:VERSION,generated_at:new Date().toISOString(),truth_label:'FRAMEWORK_DERIVED_FROM_DAILY_BARS',
    symbol:'GC=F',price:Number(price.toFixed(2)),
    zones:tf,
    prior_periods:{
      day:priorDay?roundObj(priorDay):null,
      week:priorWeek?roundObj(priorWeek):null,
      month:priorMonth?roundObj(priorMonth):null,
      quarter:priorQuarter?roundObj(priorQuarter):null,
      year:priorYear?roundObj(priorYear):null
    },
    daily_pivots:pvt,
    liquidity_ladder:near,
    composite:{
      average_position_pct:avg===null?null:Number(avg.toFixed(1)),
      state:structuralPressure,
      note:'Position is the current price location inside each current period range; it is not a directional forecast.'
    },
    methodology:{
      source:'Yahoo Finance delayed GC=F daily bars',
      history:'2y',
      levels:'Observed high/low plus arithmetic midpoint',
      premium_discount:'Framework-derived quartile location within observed period range',
      pivots:'Classic pivots from prior completed daily HLC'
    },
    governance:{canonical:false,action_permitted:'WAIT',capital_permission:'0R',promotion_allowed:false}
  });
}