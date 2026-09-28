const SUPABASE_URL='https://mpcelmjiycjpdyyflisn.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';
const UA='THE-FATHER-ANALYTICS/70.1';

async function timedFetch(url,options={},timeout=5000){
  const started=Date.now();
  try{
    const response=await fetch(url,{...options,signal:AbortSignal.timeout(timeout)});
    return {ok:response.ok,status:response.status,ms:Date.now()-started,response};
  }catch(error){
    return {ok:false,status:0,ms:Date.now()-started,error:String(error).slice(0,160),response:null};
  }
}

async function routeProbe(path){
  const r=await timedFetch(`https://thefatheranalytics.com${path}`,{method:'GET',headers:{Accept:'text/html'}},3500);
  return {path,ok:r.ok,status:r.status,latency_ms:r.ms};
}

function number(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

async function yahoo(symbol){
  const encoded=encodeURIComponent(symbol);
  const r=await timedFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1m&range=1d`,{
    headers:{'User-Agent':UA,Accept:'application/json'}
  },5500);
  if(!r.ok||!r.response)return {symbol,ok:false,status:r.status,latency_ms:r.ms};
  try{
    const j=await r.response.json();
    const m=j?.chart?.result?.[0]?.meta;
    if(!m)return {symbol,ok:false,status:r.status,latency_ms:r.ms};
    const price=number(m.regularMarketPrice);
    const previous=number(m.previousClose??m.chartPreviousClose);
    return {
      symbol,ok:price!==null,status:r.status,latency_ms:r.ms,
      price,previous_close:previous,
      change_pct:price!==null&&previous?Number((((price-previous)/previous)*100).toFixed(3)):null,
      market_time:m.regularMarketTime?new Date(Number(m.regularMarketTime)*1000).toISOString():null,
      currency:m.currency??null,
      source:'Yahoo Finance delayed market data'
    };
  }catch{
    return {symbol,ok:false,status:r.status,latency_ms:r.ms};
  }
}

function chicagoSession(){
  const now=new Date();
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:'America/Chicago',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false
  }).formatToParts(now);
  const get=(type)=>parts.find(p=>p.type===type)?.value||'';
  const day=get('weekday');
  const minute=Number(get('hour'))*60+Number(get('minute'));
  const closed=day==='Sat'||(day==='Sun'&&minute<17*60)||(day==='Fri'&&minute>=16*60)||(['Mon','Tue','Wed','Thu'].includes(day)&&minute>=16*60&&minute<17*60);
  return closed?'MARKET_CLOSED':'MARKET_OPEN';
}

async function canonicalState(){
  const r=await timedFetch(`${SUPABASE_URL}/rest/v1/rpc/get_v70_autonomous_state`,{
    method:'POST',
    headers:{apikey:PUBLISHABLE_KEY,'Content-Type':'application/json',Accept:'application/json'},
    body:'{}'
  },3500);
  if(!r.ok||!r.response)return {ok:false,status:r.status,ms:r.ms,error:r.error??null};
  const body=await r.response.json().catch(()=>null);
  return {ok:!!body?.ok,status:r.status,ms:r.ms,body};
}

async function survivorState(upstream){
  const marketSession=chicagoSession();
  const [routes,feeds]=await Promise.all([
    Promise.all(['/','/status','/live-markets','/gold-live','/member'].map(routeProbe)),
    Promise.all([
      yahoo('GC=F'),
      yahoo('DX-Y.NYB'),
      yahoo('^TNX'),
      yahoo('BZ=F'),
      yahoo('EURUSD=X'),
      yahoo('BTC-USD')
    ])
  ]);
  const routesHealthy=routes.filter(x=>x.ok).length;
  const feedsHealthy=feeds.filter(x=>x.ok).length;
  const times=feeds.filter(x=>x.market_time).map(x=>new Date(x.market_time).getTime()).filter(Number.isFinite);
  const oldest=times.length?Math.min(...times):0;
  const quoteAgeMinutes=oldest?Math.max(0,(Date.now()-oldest)/60000):null;
  const stale=marketSession==='MARKET_OPEN'&&(quoteAgeMinutes===null||quoteAgeMinutes>30||feedsHealthy<4);
  const systemScore=Math.min(55,35+routesHealthy*2+feedsHealthy);
  const testPassed=routesHealthy===routes.length&&feedsHealthy>=4;
  return {
    ok:true,
    version:'v70.1-hybrid-survivor-node',
    generated_at:new Date().toISOString(),
    mode:'VERCEL_SURVIVOR_NODE',
    system_score:systemScore,
    market_session:marketSession,
    health:{
      database:'MANAGEMENT_ONLY',
      edge_runtime:'RESTRICTED_QUOTA',
      evidence:'WITHHELD',
      connectors:{healthy:0,required:8,freshness_pct:0},
      cron:{active_jobs:40,failures_2h:0},
      production_smoke:{state:'BLOCKED_BY_SUPABASE_QUOTA',age_minutes:null},
      public_routes:{healthy:routesHealthy,total:routes.length}
    },
    governance:{
      action_permitted:'WAIT',
      capital_permission:'0R',
      can_self_promote:false,
      rule:'Survivor telemetry can preserve observability but cannot substitute for canonical evidence or increase capital permission.'
    },
    blockers:[
      'SUPABASE_PUBLIC_API_QUOTA_RESTRICTED',
      'CANONICAL_EVIDENCE_UNAVAILABLE',
      'PRODUCTION_SMOKE_BLOCKED'
    ],
    autonomous_actions:[
      'KEEP_PUBLIC_CONTROL_SURFACE_ONLINE',
      'RUN_BOUNDED_SHADOW_MARKET_TELEMETRY',
      'WAIT_FOR_SUPABASE_QUOTA_RECOVERY',
      'DO_NOT_PROMOTE_TRADING_PERMISSION'
    ],
    survivor_test:{
      test_id:'V70-TODAY-SURVIVOR',
      passed:testPassed,
      route_health:`${routesHealthy}/${routes.length}`,
      market_feeds:`${feedsHealthy}/${feeds.length}`,
      quote_age_minutes:quoteAgeMinutes===null?null:Number(quoteAgeMinutes.toFixed(1)),
      stale,
      note:'This validates the Vercel survivor node, not canonical market permission.'
    },
    shadow_market:{
      truth_label:'SHADOW_TELEMETRY_ONLY',
      market_session:marketSession,
      stale,
      feeds
    },
    bridge:{
      canonical_upstream_ok:false,
      supabase_status:upstream.status,
      supabase_latency_ms:upstream.ms
    }
  };
}

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }
  try{
    const upstream=await canonicalState();
    let body;
    if(upstream.ok&&upstream.body){
      body={
        ...upstream.body,
        version:`${upstream.body.version}+vercel-bridge`,
        bridge:{canonical_upstream_ok:true,supabase_status:upstream.status,supabase_latency_ms:upstream.ms}
      };
    }else{
      body=await survivorState(upstream);
    }
    res.setHeader('Cache-Control','public, max-age=15, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(body);
  }catch(error){
    return res.status(200).json({
      ok:false,
      version:'v70.1-hybrid-survivor-node',
      generated_at:new Date().toISOString(),
      mode:'FAIL_CLOSED',
      system_score:0,
      market_session:'UNVERIFIED',
      health:{database:'UNVERIFIED',edge_runtime:'UNVERIFIED',evidence:'WITHHELD',connectors:{healthy:0,required:8,freshness_pct:0},cron:{active_jobs:0,failures_2h:0},production_smoke:{state:'UNAVAILABLE',age_minutes:null}},
      governance:{action_permitted:'WAIT',capital_permission:'0R',can_self_promote:false},
      blockers:['AUTONOMOUS_STATE_BRIDGE_FAILURE'],
      autonomous_actions:['FAIL_CLOSED'],
      bridge:{error:String(error).slice(0,160)}
    });
  }
}
