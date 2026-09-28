const BASE='https://thefatheranalytics.com';

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
  const [auto,qa,day,confluence,breakout,tournament,quality,quota]=await Promise.all([
    read('/api/autonomous-state'),
    read('/api/autonomous-qa-matrix',12000),
    read('/api/gold-day-state'),
    read('/api/gold-mtf-confluence',11000),
    read('/api/gold-breakout-acceptance',11000),
    read('/api/research-model-tournament'),
    read('/api/data-quality-sentinel'),
    read('/api/quota-probe')
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
    version:'v87-unified-intelligence-experience-v1',
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