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
  if(String(kind).startsWith('cash_')) state=age<=45?'FRESH':'MARKET_CLOSED_OR_STALE';
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
async function worldBankLatest(country,indicator,label){
  const url=`https://api.worldbank.org/v2/country/${encodeURIComponent(country)}/indicator/${encodeURIComponent(indicator)}?format=json&mrnev=1&per_page=1`;
  try{
    const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS/90.0'},cache:'no-store',signal:AbortSignal.timeout(8000)});
    const j=await r.json().catch(()=>null); const meta=Array.isArray(j)?j?.[0]:null; const row=Array.isArray(j?.[1])?j[1][0]:null;
    if(!r.ok||!row)return {ok:false,label,country,indicator,state:'UNAVAILABLE',source:'World Bank API'};
    return {ok:true,label,country:row?.country?.value??country,indicator,period:String(row?.date??''),value:num(row?.value),
      source:'World Bank API',source_last_updated:meta?.lastupdated??null,frequency:'ANNUAL_STRUCTURAL'};
  }catch{return {ok:false,label,country,indicator,state:'UNAVAILABLE',source:'World Bank API'}}
}
function arxivStamp(d){
  const p=n=>String(n).padStart(2,'0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}
async function arxivActivity(category,label,days=7){
  const end=new Date();
  const start=new Date(end.getTime()-days*86400000);
  const query=`cat:${category} AND submittedDate:[${arxivStamp(start)} TO ${arxivStamp(end)}]`;
  const url=`https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&start=0&max_results=1`;
  try{
    const r=await fetch(url,{headers:{Accept:'application/atom+xml','User-Agent':'THE-FATHER-ANALYTICS/91.0'},cache:'no-store',signal:AbortSignal.timeout(9000)});
    const xml=await r.text();
    const match=xml.match(/<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/i);
    if(!r.ok||!match)return {ok:false,label,category,state:'UNAVAILABLE',source:'arXiv API'};
    return {ok:true,label,category,count:Number(match[1]),window_days:days,window_start:start.toISOString(),window_end:end.toISOString(),
      source:'arXiv API',truth_label:'ACTIVITY_COUNT_NOT_MOMENTUM'};
  }catch{return {ok:false,label,category,state:'UNAVAILABLE',source:'arXiv API'}}
}
async function cryptoGlobal(){
  try{
    const r=await fetch('https://api.coingecko.com/api/v3/global',{headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS/91.0'},cache:'no-store',signal:AbortSignal.timeout(9000)});
    const j=await r.json().catch(()=>null); const d=j?.data;
    if(!r.ok||!d)return {ok:false,state:'UNAVAILABLE',source:'CoinGecko Global API'};
    const change=num(d.market_cap_change_percentage_24h_usd);
    return {ok:true,total_market_cap_usd:num(d.total_market_cap?.usd),total_volume_usd:num(d.total_volume?.usd),
      market_cap_change_24h_pct:change,volume_change_24h_pct:num(d.volume_change_percentage_24h_usd),
      btc_dominance_pct:num(d.market_cap_percentage?.btc),eth_dominance_pct:num(d.market_cap_percentage?.eth),
      active_cryptocurrencies:num(d.active_cryptocurrencies),markets:num(d.markets),
      observed_at:d.updated_at?new Date(Number(d.updated_at)*1000).toISOString():null,
      state:change===null?'WITHHELD':change<=-3?'RISK_OFF_24H':change>=3?'EXPANSION_24H':'MIXED_24H',
      source:'CoinGecko Global API',truth_label:'CURRENT_MARKET_BREADTH'};
  }catch{return {ok:false,state:'UNAVAILABLE',source:'CoinGecko Global API'}}
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
const pause=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
function safe(v,fallback='WITHHELD'){return v===null||v===undefined||v===''?fallback:v}
function label(state){
  return String(state||'WITHHELD').replaceAll('_',' ');
}
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'})}

  // Mission Brief consumes research state. It does not run the full regression
  // suite internally; V78 is verified by a separate client-side channel.
  let [auto,day,liquidity,zones,confluence,breakout,tournament,quality,quota,marketAssets,macroEvidence,trendEvidence]=await Promise.all([
    read('/api/autonomous-state'),
    read('/api/gold-day-state'),
    read('/api/gold-liquidity-state-machine',10000),
    read('/api/gold-mtf-zones',10000),
    read('/api/gold-mtf-confluence',11000),
    read('/api/gold-breakout-acceptance',11000),
    read('/api/research-model-tournament'),
    read('/api/data-quality-sentinel'),
    read('/api/quota-probe'),
    Promise.all(MARKET_ASSETS.map(marketQuote)),
    Promise.all([
      worldBankLatest('WLD','NY.GDP.MKTP.KD.ZG','World GDP growth'),
      worldBankLatest('WLD','FP.CPI.TOTL.ZG','World inflation'),
      worldBankLatest('NG','NY.GDP.MKTP.KD.ZG','Nigeria GDP growth'),
      worldBankLatest('NG','FP.CPI.TOTL.ZG','Nigeria inflation'),
      worldBankLatest('SSF','NY.GDP.MKTP.KD.ZG','Sub-Saharan Africa GDP growth'),
      marketQuote({id:'usdngn',name:'USD/NGN',symbol:'NGN=X',kind:'fx',precision:2})
    ]),
    Promise.all([
      worldBankLatest('WLD','IT.NET.USER.ZS','Internet users'),
      worldBankLatest('WLD','GB.XPD.RSDV.GD.ZS','R&D expenditure'),
      worldBankLatest('WLD','EG.ELC.RNEW.ZS','Renewable electricity output'),
      worldBankLatest('WLD','IP.PAT.RESD','Resident patent applications'),
      marketQuote({id:'nvda',name:'NVIDIA',symbol:'NVDA',kind:'cash_equity',precision:2}),
      marketQuote({id:'botz',name:'Robotics & AI ETF',symbol:'BOTZ',kind:'cash_etf',precision:2}),
      marketQuote({id:'icln',name:'Clean Energy ETF',symbol:'ICLN',kind:'cash_etf',precision:2}),
      marketQuote({id:'btc-trend',name:'Bitcoin',symbol:'BTC-USD',kind:'crypto',precision:0})
    ])
  ]);

  const dataQuality=safe(quality.body?.state);
  if(dataQuality==='PASS' && liquidity.body?.state?.phase==='DATA_GATED'){
    await pause(250);
    const retry=await read(`/api/gold-liquidity-state-machine?brief_retry=${Date.now()}`,10000);
    if(retry.ok && retry.body?.state?.phase && retry.body.state.phase!=='DATA_GATED') liquidity=retry;
  }

  const phase=safe(liquidity.body?.state?.phase,confluence.body?.intraday?.phase??day.body?.day_state?.day_state);
  const price=liquidity.body?.price??confluence.body?.price??day.body?.current?.price??null;
  const breakoutState=safe(breakout.body?.dominant_state);
  const mtf=safe(zones.body?.composite?.state,confluence.body?.multi_timeframe?.state);
  const confluenceGated=confluence.body?.intraday?.phase==='DATA_GATED';
  const tension=confluenceGated?'CONFLUENCE_RECHECK_PENDING':safe(confluence.body?.confluence?.tension);
  const runtimeRestricted=quota.body?.restricted===true;
  const consensus=safe(tournament.body?.tournament?.consensus);
  const below=confluence.body?.confluence?.nearest_below_cluster??null;
  const above=confluence.body?.confluence?.nearest_above_cluster??null;
  const marketBreadthState=marketBreadth(marketAssets);

  const [worldGdp,worldInflation,nigeriaGdp,nigeriaInflation,ssaGdp,usdNgn]=macroEvidence;
  const pp=(a,b)=>a?.ok&&b?.ok&&a?.value!==null&&b?.value!==null?Number((a.value-b.value).toFixed(2)):null;
  const macroPulse={
    structural:[worldGdp,worldInflation,nigeriaGdp,nigeriaInflation,ssaGdp],
    market_proxy:usdNgn,
    comparisons:{
      nigeria_growth_vs_world_pp:pp(nigeriaGdp,worldGdp),
      nigeria_inflation_vs_world_pp:pp(nigeriaInflation,worldInflation),
      ssa_growth_vs_world_pp:pp(ssaGdp,worldGdp)
    },
    truth_label:'OFFICIAL_STRUCTURAL_DATA_PLUS_SEPARATE_MARKET_PROXY',
    note:'World Bank values are annual structural observations, not current-month estimates.'
  };
  const [aiResearch,roboticsResearch,crypto]=trendEvidence;
  const trendsPulse={
    research:[aiResearch,roboticsResearch],
    digital_assets:crypto,
    truth_label:'ACTIVITY_AND_MARKET_BREADTH_WITHOUT_SYNTHETIC_TREND_SCORE',
    note:'Research counts describe seven-day publication activity. They do not claim acceleration without a historical baseline.'
  };

  const [internetUsers,rdSpend,renewableOutput,residentPatents,nvda,botz,icln,btcTrend]=trendEvidence;
  const trendStructural=[internetUsers,rdSpend,renewableOutput,residentPatents];
  const trendProxies=[nvda,botz,icln,btcTrend];
  const usableTrendProxies=trendProxies.filter(x=>x?.ok&&['FRESH','DELAYED'].includes(x?.freshness));
  const trendUp=usableTrendProxies.filter(x=>x.direction==='UP').length;
  const trendDown=usableTrendProxies.filter(x=>x.direction==='DOWN').length;
  const trendFlat=usableTrendProxies.filter(x=>x.direction==='FLAT').length;
  const trendAttentionState=usableTrendProxies.length<2
    ? 'LIMITED_FRESH_SIGNAL'
    : trendUp>trendDown?'PROXY_BREADTH_POSITIVE'
      : trendDown>trendUp?'PROXY_BREADTH_NEGATIVE':'PROXY_BREADTH_MIXED';
  const trendsPulse={
    structural:trendStructural,
    market_proxies:trendProxies,
    proxy_attention:{
      state:trendAttentionState,
      usable:usableTrendProxies.length,
      total:trendProxies.length,
      up:trendUp,
      down:trendDown,
      flat:trendFlat
    },
    truth_label:'STRUCTURAL_ADOPTION_DATA_PLUS_MARKET_ATTENTION_PROXIES',
    note:'Market prices are attention proxies only. They do not prove technology adoption, productivity or real-economy impact.'
  };

  const changeParts=[];
  if(price!==null)changeParts.push(`Gold shadow proxy ${Number(price).toFixed(1)}`);
  changeParts.push(label(phase));
  if(breakoutState!=='WITHHELD')changeParts.push(label(breakoutState));
  if(mtf!=='WITHHELD')changeParts.push(label(mtf));

  const desks=[
    {id:'macro',name:'MACRO & WORLD ECONOMY',state:'ACTIVE SURFACE',detail:'World Bank structural evidence · FX proxy · growth · inflation · policy',href:'/world-economy/'},
    {id:'markets',name:'GLOBAL MARKETS',state:dataQuality==='PASS'&&phase!=='DATA_GATED'&&phase!=='WITHHELD'?'LIVE RESEARCH':'EVIDENCE-GATED',detail:`${label(phase)} · ${label(breakoutState)}`,href:'/live-markets/'},
    {id:'flows',name:'FLOWS & POSITIONING',state:'EVIDENCE-GATED',detail:'COT · systematic flows · seasonality · money flow',href:'/live-markets/'},
    {id:'quant',name:'QUANT & CALIBRATION',state:'VERIFYING QA',detail:'Separate regression channel · forecast ledger · Brier · MFE/MAE',href:'/status/'},
    {id:'risk',name:'RISK & PORTFOLIO',state:'0R FIREWALL',detail:'Scenario EV · position sizing · execution cost · capital permission',href:'/status/'},
    {id:'solutions',name:'TRENDS & SOLUTIONS',state:'EVIDENCE PULSE',detail:`${trendStructural.filter(x=>x?.ok).length}/4 structural · ${usableTrendProxies.length}/4 fresh market proxies`,href:'/global-trends/'}
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
    ['Institutional Matrix','ACTIVE SURFACE','Professional command visualization'],
    ['Global Trends Evidence Pulse','ACTIVE','Structural adoption data + freshness-gated market proxies']
  ].map(([name,state,detail])=>({name,state,detail}));

  res.setHeader('Cache-Control','public, max-age=20, s-maxage=60, stale-while-revalidate=120');
  return res.status(200).json({
    ok:true,
    version:'v91-unified-intelligence-experience-v1',
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
      qa_state:'SEPARATE_CLIENT_CHANNEL',
      qa_score:null,
      canonical_runtime:runtimeRestricted?'RESTRICTED':'AVAILABLE',
      nearest_below:below,
      nearest_above:above
    },
    command_tape:[
      {label:'DATA QUALITY',value:dataQuality},
      {label:'AUTONOMOUS QA',value:'VERIFYING SEPARATELY'},
      {label:'GOLD PHASE',value:label(phase)},
      {label:'BREAKOUT',value:label(breakoutState)},
      {label:'MODEL CONSENSUS',value:label(consensus)},
      {label:'MTF LOCATION',value:label(mtf)},
      {label:'CAPITAL',value:'WAIT · 0R'},
      {label:'RUNTIME',value:runtimeRestricted?'SURVIVOR MODE':'CANONICAL'}
    ],
    global_market_dashboard:{assets:marketAssets,breadth:marketBreadthState},
    macro_evidence_pulse:macroPulse,
    global_trends_evidence_pulse:trendsPulse,
    global_trends_evidence_pulse:trendsPulse,
    six_desks:desks,
    engine_registry:engines,
    calibration:{
      public_accuracy:'WITHHELD',
      reason:'Empirical outcome samples have not reached publication thresholds.',
      qa_score:null,
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
