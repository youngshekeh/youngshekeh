const VERSION='v88-global-market-dashboard-v1';
const UA='THE-FATHER-ANALYTICS/88.0';
const ASSETS=[
  {id:'gold',name:'Gold',symbol:'GC=F',kind:'futures',precision:1,role:'real_asset'},
  {id:'dxy',name:'U.S. Dollar Index',symbol:'DX-Y.NYB',kind:'index',precision:3,role:'usd'},
  {id:'spx',name:'S&P 500',symbol:'^GSPC',kind:'cash_index',precision:2,role:'risk'},
  {id:'btc',name:'Bitcoin',symbol:'BTC-USD',kind:'crypto',precision:0,role:'risk'},
  {id:'eurusd',name:'EUR/USD',symbol:'EURUSD=X',kind:'fx',precision:4,role:'usd_inverse'},
  {id:'us10y',name:'U.S. 10Y Yield',symbol:'^TNX',kind:'cash_yield',precision:3,role:'rates'},
  {id:'oil',name:'WTI Crude',symbol:'CL=F',kind:'futures',precision:2,role:'energy'}
];
function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function dir(change){
  if(change===null)return 'UNAVAILABLE';
  if(change>=0.15)return 'UP';
  if(change<=-0.15)return 'DOWN';
  return 'FLAT';
}
function freshness(kind,ts){
  if(!ts)return {state:'UNAVAILABLE',age_minutes:null};
  const age=Math.max(0,(Date.now()/1000-ts)/60);
  let state='FRESH';
  if(kind==='cash_index'||kind==='cash_yield') state=age<=45?'FRESH':'MARKET_CLOSED_OR_STALE';
  else if(kind==='crypto') state=age<=20?'FRESH':age<=60?'DELAYED':'STALE';
  else state=age<=30?'FRESH':age<=120?'DELAYED':'STALE';
  return {state,age_minutes:Number(age.toFixed(1))};
}
async function quote(asset){
  const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.symbol)}?interval=5m&range=1d&includePrePost=true`;
  const started=Date.now();
  try{
    const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':UA},cache:'no-store',signal:AbortSignal.timeout(9000)});
    const j=await r.json().catch(()=>null);
    const x=j?.chart?.result?.[0],m=x?.meta;
    if(!r.ok||!m)return {id:asset.id,name:asset.name,symbol:asset.symbol,ok:false,state:'UNAVAILABLE',latency_ms:Date.now()-started};
    const price=n(m.regularMarketPrice??m.fulldayPrice);
    const prev=n(m.previousClose??m.chartPreviousClose);
    const changePct=n(m.regularMarketChangePercent??m.fulldayChangePercent) ??
      (price!==null&&prev?((price-prev)/prev*100):null);
    const ts=n(m.regularMarketTime);
    const fresh=freshness(asset.kind,ts);
    return {
      id:asset.id,name:asset.name,symbol:asset.symbol,role:asset.role,kind:asset.kind,ok:true,
      price:price===null?null:Number(price.toFixed(asset.precision)),
      previous_close:prev===null?null:Number(prev.toFixed(asset.precision)),
      change_pct:changePct===null?null:Number(changePct.toFixed(3)),
      direction:dir(changePct),
      day_high:n(m.regularMarketDayHigh),day_low:n(m.regularMarketDayLow),
      observed_at:ts?new Date(ts*1000).toISOString():null,
      freshness:fresh.state,age_minutes:fresh.age_minutes,
      source:'Yahoo Finance chart endpoint',latency_ms:Date.now()-started
    };
  }catch(error){
    return {id:asset.id,name:asset.name,symbol:asset.symbol,ok:false,state:'UNAVAILABLE',error:String(error).slice(0,120),latency_ms:Date.now()-started};
  }
}
function find(rows,id){return rows.find(x=>x.id===id&&x.ok)||null}
function live(row){return !!row&&['FRESH','DELAYED'].includes(row.freshness)}
function sign(row){return live(row)?row.direction:'UNAVAILABLE'}
function breadth(rows){
  const usable=rows.filter(x=>x.ok&&live(x));
  const up=usable.filter(x=>x.direction==='UP').length;
  const down=usable.filter(x=>x.direction==='DOWN').length;
  const flat=usable.filter(x=>x.direction==='FLAT').length;
  const dxy=find(rows,'dxy'),eur=find(rows,'eurusd'),gold=find(rows,'gold'),btc=find(rows,'btc'),oil=find(rows,'oil'),spx=find(rows,'spx'),y10=find(rows,'us10y');
  const usdFirm=(sign(dxy)==='UP'||sign(eur)==='DOWN');
  const usdSoft=(sign(dxy)==='DOWN'||sign(eur)==='UP');
  const riskSoft=[btc,spx].filter(live).filter(x=>x.direction==='DOWN').length >
                 [btc,spx].filter(live).filter(x=>x.direction==='UP').length;
  const riskFirm=[btc,spx].filter(live).filter(x=>x.direction==='UP').length >
                 [btc,spx].filter(live).filter(x=>x.direction==='DOWN').length;
  const energy=sign(oil);
  const metal=sign(gold);
  let pattern='MIXED_CROSS_ASSET_TAPE';
  if(usdFirm&&riskSoft&&energy==='UP') pattern='USD_FIRM_ENERGY_UP_RISK_SOFT';
  else if(usdFirm&&riskSoft) pattern='USD_FIRM_RISK_SOFT';
  else if(usdSoft&&riskFirm) pattern='USD_SOFT_RISK_FIRM';
  else if(energy==='UP'&&metal==='DOWN') pattern='COMMODITY_DIVERGENCE';
  const score=usable.length?Number(((up-down)/usable.length).toFixed(2)):0;
  return {
    state:pattern,usable_assets:usable.length,up,down,flat,breadth_score:score,
    usd_state:usdFirm?'FIRM':usdSoft?'SOFT':'MIXED',
    risk_state:riskSoft?'SOFT':riskFirm?'FIRM':'MIXED',
    energy_state:energy,gold_state:metal,
    rates_state:sign(y10),
    note:'Descriptive rule-based cross-asset pattern. It is not a causal claim or trade signal.'
  };
}
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'})}
  const rows=await Promise.all(ASSETS.map(quote));
  const ok=rows.filter(x=>x.ok).length;
  const fresh=rows.filter(x=>x.ok&&x.freshness==='FRESH').length;
  const b=breadth(rows);
  res.setHeader('Cache-Control','public, max-age=15, s-maxage=45, stale-while-revalidate=90');
  return res.status(200).json({
    ok:ok>=5,version:VERSION,generated_at:new Date().toISOString(),truth_label:'VERIFIED_MARKET_QUOTES_WITH_FRESHNESS',
    summary:{available:ok,total:rows.length,fresh,pattern:b.state,breadth_score:b.breadth_score},
    assets:rows,breadth:b,
    governance:{canonical:false,action_permitted:'WAIT',capital_permission:'0R',automatic_execution:false,
      rule:'Cross-asset observations describe verified quote relationships only. They cannot grant execution permission.'}
  });
}