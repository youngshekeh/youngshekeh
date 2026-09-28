const UA='THE-FATHER-ANALYTICS/71.0';

async function fetchJson(url,timeout=5500){
  const started=Date.now();
  try{
    const response=await fetch(url,{headers:{'User-Agent':UA,Accept:'application/json'},signal:AbortSignal.timeout(timeout)});
    if(!response.ok)return {ok:false,status:response.status,ms:Date.now()-started};
    return {ok:true,status:response.status,ms:Date.now()-started,body:await response.json()};
  }catch(error){return {ok:false,status:0,ms:Date.now()-started,error:String(error).slice(0,160)}}
}
function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
function pct(price,previous){return price!==null&&previous?Number((((price-previous)/previous)*100).toFixed(4)):null}
function ageMinutes(ts){const t=new Date(ts||0).getTime();return Number.isFinite(t)&&t>0?Math.max(0,(Date.now()-t)/60000):null}
async function quote(symbol){
  const r=await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`);
  if(!r.ok)return {symbol,ok:false,status:r.status,latency_ms:r.ms};
  const meta=r.body?.chart?.result?.[0]?.meta;
  if(!meta)return {symbol,ok:false,status:r.status,latency_ms:r.ms};
  const price=num(meta.regularMarketPrice),previous=num(meta.previousClose??meta.chartPreviousClose);
  const time=meta.regularMarketTime?new Date(Number(meta.regularMarketTime)*1000).toISOString():null;
  return {symbol,ok:price!==null,status:r.status,latency_ms:r.ms,price,previous_close:previous,change_pct:pct(price,previous),
    market_time:time,age_minutes:ageMinutes(time),currency:meta.currency??null,source:'Yahoo Finance delayed market data'};
}
function marketSession(){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());
  const get=(type)=>parts.find(x=>x.type===type)?.value||'';
  const day=get('weekday'),minute=Number(get('hour'))*60+Number(get('minute'));
  const closed=day==='Sat'||(day==='Sun'&&minute<17*60)||(day==='Fri'&&minute>=16*60)||(['Mon','Tue','Wed','Thu'].includes(day)&&minute>=16*60&&minute<17*60);
  return closed?'MARKET_CLOSED':'MARKET_OPEN';
}
function change(feed){return Number.isFinite(Number(feed?.change_pct))?Number(feed.change_pct):null}
function classify(feeds,session){
  if(session==='MARKET_CLOSED')return {state:'MARKET_CLOSED',hero_score:0,dragon_score:0,prediction_direction:'NONE'};
  const by=Object.fromEntries(feeds.map(x=>[x.symbol,x]));
  const core=['GC=F','DX-Y.NYB','BZ=F','EURUSD=X','BTC-USD'].map(s=>by[s]);
  const fresh=core.filter(x=>x?.ok&&x.age_minutes!==null&&x.age_minutes<=30);
  if(fresh.length<4||!by['GC=F']?.ok||by['GC=F']?.age_minutes>30)return {state:'DATA_GATED',hero_score:0,dragon_score:0,prediction_direction:'NONE'};
  let hero=0,dragon=0;
  const gold=change(by['GC=F']),dxy=change(by['DX-Y.NYB']),brent=change(by['BZ=F']);
  if(gold!==null){if(gold>=0.15)hero++;else if(gold<=-0.15)dragon++}
  if(dxy!==null){if(dxy<=-0.05)hero++;else if(dxy>=0.05)dragon++}
  if(brent!==null){if(brent<=-1)hero++;else if(brent>=1)dragon++}
  let state='MIXED_SHADOW',direction='NONE';
  if(dragon>=3){state='DRAGON_PRESSURE_SHADOW';direction='DOWN'}
  else if(hero>=3){state='HERO_REPAIR_SHADOW';direction='UP'}
  else if(dragon>hero){state='DRAGON_BIAS_MIXED_SHADOW';direction='DOWN'}
  else if(hero>dragon){state='HERO_BIAS_MIXED_SHADOW';direction='UP'}
  return {state,hero_score:hero,dragon_score:dragon,prediction_direction:direction};
}
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'})}
  const session=marketSession();
  const feeds=await Promise.all([quote('GC=F'),quote('DX-Y.NYB'),quote('^TNX'),quote('BZ=F'),quote('EURUSD=X'),quote('BTC-USD')]);
  const signal=classify(feeds,session);
  const gold=feeds.find(x=>x.symbol==='GC=F')||null;
  const coreFresh=feeds.filter(x=>['GC=F','DX-Y.NYB','BZ=F','EURUSD=X','BTC-USD'].includes(x.symbol)&&x.ok&&x.age_minutes!==null&&x.age_minutes<=30).length;
  const fresh=session==='MARKET_CLOSED'||(gold?.ok&&gold.age_minutes<=30&&coreFresh>=4);
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
    ok:true,
    version:'v71-shadow-market-snapshot-v1',
    observed_at:new Date().toISOString(),
    truth_label:'SHADOW_RESEARCH_ONLY',
    market_session:session,
    fresh,
    core_fresh_feeds:coreFresh,
    signal:{...signal,confidence:'WITHHELD_UNTIL_CALIBRATED'},
    gold:{price:gold?.price??null,change_pct:gold?.change_pct??null,market_time:gold?.market_time??null,age_minutes:gold?.age_minutes??null},
    feeds,
    governance:{canonical:false,action_permitted:'WAIT',capital_permission:'0R',promotion_allowed:false}
  });
}
