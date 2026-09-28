const BASE='https://thefatheranalytics.com';
const MARKET_ASSETS=[
  {id:'gold',name:'Gold',symbol:'GC=F',kind:'futures',precision:1},
  {id:'dxy',name:'U.S. Dollar Index',symbol:'DX-Y.NYB',kind:'index',precision:3},
  {id:'spx',name:'S&P 500',symbol:'^GSPC',kind:'cash_index',precision:2},
  {id:'btc',name:'Bitcoin',symbol:'BTC-USD',kind:'crypto',precision:0},
  {id:'eurusd',name:'EUR/USD',symbol:'EURUSD=X',kind:'fx',precision:4},
  {id:'us10y',name:'U.S. 10Y Yield',symbol:'^TNX',kind:'cash_yield',precision:3},
  {id:'oil',name:'WTI Crude',symbol:'CL=F',kind:'futures',precision:2}
];
function num(v){const x=Number(v);return Number.isFinite(x)?x:null}
function marketDirection(change){
  if(change===null)return 'UNAVAILABLE';
  if(change>=0.15)return 'UP';
  if(change<=-0.15)return 'DOWN';
  return 'FLAT';
}
function marketFreshness(kind,ts){
  if(!ts)return {state:'UNAVAILABLE',age_minutes:null};
  const age=Math.max(0,(Date.now()/1000-ts)/60);
  let state='FRESH';
  if(kind==='cash_index'||kind==='cash_yield') state=age<=45?'FRESH':'MARKET_CLOSED_OR_STALE';
  else if(kind==='crypto') state=age<=20?'FRESH':age<=60?'DELAYED':'STALE';
  else state=age<=30?'FRESH':age<=120?'DELAYED':'STALE';
  return {state,age_minutes:Number(age.toFixed(1))};
}
async function marketQuote(asset){
  const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.symbol)}?interval=5m&range=1d&includePrePost=true`;
  try{
    const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS/88.0'},cache:'no-store',signal:AbortSignal.timeout(8000)});
    const j=await r.json().catch(()=>null); const m=j?.chart?.result?.[0]?.meta;
    if(!r.ok||!m)return {id:asset.id,name:asset.name,symbol:asset.symbol,ok:false,freshness:'UNAVAILABLE'};
    const price=num(m.regularMarketPrice??m.fulldayPrice),prev=num(m.previousClose??m.chartPreviousClose);
    const pct=num(m.regularMarketChangePercent??m.fulldayChangePercent)??(price!==null&&prev?((price-prev)/prev*100):null);
    const ts=num(m.regularMarketTime),fresh=marketFreshness(asset.kind,ts);
    return {id:asset.id,name:asset.name,symbol:asset.symbol,kind:asset.kind,ok:true,
      price:price===null?null:Number(price.toFixed(asset.precision)),
      change_pct:pct===null?null:Number(pct.toFixed(3)),direction:marketDirection(pct),
      observed_at:ts?new Date(ts*1000).toISOString():null,freshness:fresh.state,age_minutes:fresh.age_minutes,
      source:'Yahoo Finance chart endpoint'};
  }catch{return {id:asset.id,name:asset.name,symbol:asset.symbol,ok:false,freshness:'UNAVAILABLE'}}
}
function marketBreadth(rows){
  const live=rows.filter(x=>x.ok&&['FRESH','DELAYED'].includes(x.freshness));
  const by=id=>live.find(x=>x.id===id);
  const up=live.filter(x=>x.direction==='UP').length,down=live.filter(x=>x.direction==='DOWN').length,flat=live.filter(x=>x.direction==='FLAT').length;
  const dxy=by('dxy'),eur=by('eurusd'),btc=by('btc'),spx=by('spx'),oil=by('oil'),gold=by('gold');
  const usdFirm=(dxy?.direction==='UP'||eur?.direction==='DOWN'),usdSoft=(dxy?.direction==='DOWN'||eur?.direction==='UP');
  const risk=[btc,spx].filter(Boolean),riskDown=risk.filter(x=>x.direction==='DOWN').length,riskUp=risk.filter(x=>x.direction==='UP').length;
  const riskSoft=riskDown>riskUp,riskFirm=riskUp>riskDown;
  let state='MIXED_CROSS_ASSET_TAPE';
  if(usdFirm&&riskSoft&&oil?.direction==='UP')state='USD_FIRM_ENERGY_UP_RISK_SOFT';
  else if(usdFirm&&riskSoft)state='USD_FIRM_RISK_SOFT';
  else if(usdSoft&&riskFirm)state='USD_SOFT_RISK_FIRM';
  else if(oil?.direction==='UP'&&gold?.direction==='DOWN')state='COMMODITY_DIVERGENCE';
  return {state,usable_assets:live.length,up,down,flat,breadth_score:live.length?Number(((up-down)/live.length).toFixed(2)):0,
    usd_state:usdFirm?'FIRM':usdSoft?'SOFT':'MIXED',risk_state:riskSoft?'SOFT':riskFirm?'FIRM':'MIXED',
    note:'Descriptive cross-asset pattern only; not a causal claim or trade signal.'};
}


async function read(path,timeout=9000){
  const started=Date.now();
  try{
    const response=await fetch(BASE+path,{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS/87.0'},
      cache:'no-store',
      signal:AbortSignal.timeout(timeout)
    });
    const body=await response.json().catch(()=>null);
    return {ok:response.ok&&!!body,status:response.status,latency_ms:Date.now()-started,body};
  }catch(error){
    return {ok:false,status:0,latency_ms:Date.now()-started,body:null,error:String(error).slice(0,160)};
  }
}
function safe(v,fallback='WITHHELD'){return v===null||v===undefined||v===''?fallback:v}
function label(state){
  return String(state||'WITHHELD').replaceAll('_',' ');
}
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'})}
  const [auto,qa,day,confluence,breakout,tournament,quality,quota,marketAssets]=await Promise.all([
    read('/api/autonomous-state'),
    read('/api/autonomous-qa-matrix',12000),
    read('/api/gold-day-state'),
    read('/api/gold-mtf-confluence',11000),
    read('/api/gold-breakout-acceptance',11000),
    read('/api/research-model-tournament'),
    read('/api/data-quality-sentinel'),
    read('/api/quota-probe'),
    Promise.all(MARKET_ASSETS.map(marketQuote))
  ]);
  const phase=safe(confluence.body?.intraday?.phase,day.body?.day_state?.day_state);
  const price=confluence.body?.price??day.body?.current?.price??null;
  const breakoutState=safe(breakout.body?.dominant_state);
  const mtf=safe(confluence.body?.multi_timeframe?.state);
  const tension=safe(confluence.body?.confluence?.tension);
  const qaPass=qa.body?.summary?.passed??0,qaTotal=qa.body?.summary?.total??0;
  const qaState=safe(qa.body?.state);
  const dataQuality=safe(quality.body?.state);
  const runtimeRestricted=quota.body?.restricted===true;
  const consensus=safe(tournament.body?.tournament?.consensus);
  const below=confluence.body?.confluence?.nearest_below_cluster??null;
  const above=confluence.body?.confluence?.nearest_above_cluster??null;
  const marketBreadthState=marketBreadth(marketAssets);

  const changeParts=[];
  if(price!==null)changeParts.push(`Gold shadow proxy ${Number(price).toFixed(1)}`);
  changeParts.push(label(phase));
  if(breakoutState!=='WITHHELD')changeParts.push(label(breakoutState));
  if(mtf!=='WITHHELD')changeParts.push(label(mtf));

  const desks=[
    {id:'macro',name:'MACRO & WORLD ECONOMY',state:'ACTIVE SURFACE',detail:'Growth · inflation · rates · liquidity · fiscal · trade',href:'/world-economy/'},
    {id:'markets',name:'GLOBAL MARKETS',state:dataQuality==='PASS'&&phase!=='DATA_GATED'&&qaState==='PASS'?'LIVE RESEARCH':'EVIDENCE-GATED',detail:`${label(phase)} · ${label(breakoutState)}`,href:'/live-markets/'},
    {id:'flows',name:'FLOWS & POSITIONING',state:'EVIDENCE-GATED',detail:'COT · systematic flows · seasonality · money flow',href:'/live-markets/'},
    {id:'quant',name:'QUANT & CALIBRATION',state:qaState==='PASS'?'QA PASS':'WITHHELD',detail:`${qaPass}/${qaTotal} autonomous invariants · forecast ledger · Brier · MFE/MAE`,href:'/status/'},
    {id:'risk',name:'RISK & PORTFOLIO',state:'0R FIREWALL',detail:'Scenario EV · position sizing · execution cost · capital permission',href:'/status/'},
    {id:'solutions',name:'TRENDS & SOLUTIONS',state:'ACTIVE SURFACE',detail:'AI · industry · culture · problem maps · solution lab',href:'/global-trends/'}
  ];

  const engines=[
    ['WHAT CHANGED?™','ACTIVE','Decision compression'],
    ['Day-State / Lifecycle','ACTIVE',label(day.body?.day_state?.day_state)],
    ['Multi-Timeframe State Machine','ACTIVE',label(phase)],
    ['Breakout Quality','ACTIVE',label(breakoutState)],
    ['False-Breakout Detector','ACTIVE',safe(breakout.body?.downside?.false_breakout_risk,'MONITORING')],
    ['Liquidity Heat Map','ACTIVE',below&&above?`${below.center} ↔ ${above.center}`:'WITHHELD'],
    ['CRT / AMD','FRAMEWORK','Evidence-gated structure engine'],
    ['SMC / FVG / Order Blocks','FRAMEWORK','Proxy layer only where data supports it'],
    ['COT / Institutional Positioning','EVIDENCE-GATED','No fabricated positioning'],
    ['Seasonality & Cycles','EVIDENCE-GATED','Historical context requires verified sample'],
    ['Forecast Ledger','ACTIVE','Immutable outcomes + calibration'],
    ['Signal Reputation','LEARNING','Sample thresholds enforced'],
    ['Expected Value Engine','GATED','No EV without empirical inputs'],
    ['Portfolio Risk','GATED','Capital permission remains 0R'],
    ['Source Provenance','ACTIVE','Evidence trail + immutable snapshots'],
    ['Freshness Decay','ACTIVE','Stale inputs fail closed'],
    ['Adventure Map','ACTIVE SURFACE','Kid-friendly regime storytelling'],
    ['Institutional Matrix','ACTIVE SURFACE','Professional command visualization']
  ].map(([name,state,detail])=>({name,state,detail}));

  res.setHeader('Cache-Control','public, max-age=20, s-maxage=60, stale-while-revalidate=120');
  return res.status(200).json({
    ok:true,
    version:'v88-unified-intelligence-experience-v1',
    generated_at:new Date().toISOString(),
    truth_label:'PUBLIC_SAFE_MISSION_BRIEF',
    what_changed:{
      headline:changeParts.join(' · '),
      price,
      phase,
      breakout_state:breakoutState,
      model_consensus:consensus,
      multi_timeframe_state:mtf,
      confluence_tension:tension,
      data_quality:dataQuality,
      qa_state:qaState,
      qa_score:`${qaPass}/${qaTotal}`,
      canonical_runtime:runtimeRestricted?'RESTRICTED':'AVAILABLE',
      nearest_below:below,
      nearest_above:above
    },
    command_tape:[
      {label:'DATA QUALITY',value:dataQuality},
      {label:'AUTONOMOUS QA',value:`${qaPass}/${qaTotal} ${qaState}`},
      {label:'GOLD PHASE',value:label(phase)},
      {label:'BREAKOUT',value:label(breakoutState)},
      {label:'MODEL CONSENSUS',value:label(consensus)},
      {label:'MTF LOCATION',value:label(mtf)},
      {label:'CAPITAL',value:'WAIT · 0R'},
      {label:'RUNTIME',value:runtimeRestricted?'SURVIVOR MODE':'CANONICAL'}
    ],
    global_market_dashboard:{assets:marketAssets,breadth:marketBreadthState},
    six_desks:desks,
    engine_registry:engines,
    calibration:{
      public_accuracy:'WITHHELD',
      reason:'Empirical outcome samples have not reached publication thresholds.',
      qa_score:`${qaPass}/${qaTotal}`,
      automatic_promotion:false,
      capital_permission:'0R'
    },
    governance:{
      action_permitted:'WAIT',
      capital_permission:'0R',
      automatic_execution:false,
      automatic_risk_increase:false,
      rule:'Elite presentation never overrides evidence gates.'
    }
  });
}