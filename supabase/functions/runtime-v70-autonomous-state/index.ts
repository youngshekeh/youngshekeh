const TFA_PRIVATE_AUTHZ='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v115-oidc-probe';

function tfaConstantTimeEqual(a:string,b:string){
  if(!a||!b||a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
async function tfaPrivateAuthorized(req:Request){
  const auth=req.headers.get('authorization')||'';
  const token=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';
  if(!token)return false;

  const serviceRole=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(serviceRole&&tfaConstantTimeEqual(token,serviceRole))return true;

  try{
    const r=await fetch(TFA_PRIVATE_AUTHZ,{
      headers:{Authorization:auth,Accept:'application/json'},
      signal:AbortSignal.timeout(5000)
    });
    const body=await r.json().catch(()=>null);
    return r.ok&&body?.ok===true&&body?.state==='VERCEL_WORKLOAD_VERIFIED';
  }catch{return false}
}

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'https://mpcelmjiycjpdyyflisn.supabase.co';
function publishableKey(){
  const bundle=Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if(bundle){try{const parsed=JSON.parse(bundle);if(parsed?.default)return parsed.default}catch{}}
  return Deno.env.get('SUPABASE_ANON_KEY')||'';
}
const PUBLISHABLE_KEY=publishableKey();
const INTERNAL_DB_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const UA='THE-FATHER-ANALYTICS/70.2';

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
  const r=await timedFetch(`https://thefatheranalytics.com${path}`,{method:'GET',headers:{Accept:'text/html'}},1000);
  return {path,ok:r.ok,status:r.status,latency_ms:r.ms};
}
function number(v){const n=Number(v);return Number.isFinite(n)?n:null}
function ageMinutes(ts){const n=new Date(ts||0).getTime();return Number.isFinite(n)&&n>0?Math.max(0,(Date.now()-n)/60000):null}
async function yahoo(symbol){
  const encoded=encodeURIComponent(symbol);
  const r=await timedFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1m&range=1d`,{headers:{'User-Agent':UA,Accept:'application/json'}},5500);
  if(!r.ok||!r.response)return {symbol,ok:false,status:r.status,latency_ms:r.ms};
  try{
    const j=await r.response.json();const m=j?.chart?.result?.[0]?.meta;
    if(!m)return {symbol,ok:false,status:r.status,latency_ms:r.ms};
    const price=number(m.regularMarketPrice),previous=number(m.previousClose??m.chartPreviousClose);
    const marketTime=m.regularMarketTime?new Date(Number(m.regularMarketTime)*1000).toISOString():null;
    return {symbol,ok:price!==null,status:r.status,latency_ms:r.ms,price,previous_close:previous,
      change_pct:price!==null&&previous?Number((((price-previous)/previous)*100).toFixed(3)):null,
      market_time:marketTime,age_minutes:ageMinutes(marketTime),currency:m.currency??null,source:'Yahoo Finance delayed market data'};
  }catch{return {symbol,ok:false,status:r.status,latency_ms:r.ms}}
}
function chicagoSession(){
  const now=new Date();
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(now);
  const get=(type)=>parts.find(p=>p.type===type)?.value||'';
  const day=get('weekday'),minute=Number(get('hour'))*60+Number(get('minute'));
  const closed=day==='Sat'||(day==='Sun'&&minute<17*60)||(day==='Fri'&&minute>=16*60)||(['Mon','Tue','Wed','Thu'].includes(day)&&minute>=16*60&&minute<17*60);
  return {state:closed?'MARKET_CLOSED':'MARKET_OPEN',day,minute};
}
async function canonicalState(){
  const r=await timedFetch(`${SUPABASE_URL}/rest/v1/rpc/get_v70_autonomous_state`,{method:'POST',headers:{apikey:INTERNAL_DB_KEY,Authorization:`Bearer ${INTERNAL_DB_KEY}`,'Content-Type':'application/json',Accept:'application/json'},body:'{}'},1000);
  if(!r.ok||!r.response)return {ok:false,status:r.status,ms:r.ms,error:r.error??null};
  const body=await r.response.json().catch(()=>null);return {ok:!!body?.ok,status:r.status,ms:r.ms,body};
}
async function regimeMemory(){
  const r=await timedFetch(`${SUPABASE_URL}/rest/v1/rpc/get_v89_market_regime_state`,{method:'POST',headers:{apikey:INTERNAL_DB_KEY,Authorization:`Bearer ${INTERNAL_DB_KEY}`,'Content-Type':'application/json',Accept:'application/json'},body:'{}'},1000);
  if(!r.ok||!r.response)return {ok:false,status:r.status,ms:r.ms,error:r.error??null};
  const body=await r.response.json().catch(()=>null);return {ok:!!body?.ok,status:r.status,ms:r.ms,body};
}
async function learningStack(){
  const r=await timedFetch(`${SUPABASE_URL}/rest/v1/rpc/get_v100_closed_loop_learning_stack`,{method:'POST',headers:{apikey:INTERNAL_DB_KEY,Authorization:`Bearer ${INTERNAL_DB_KEY}`,'Content-Type':'application/json',Accept:'application/json'},body:'{}'},1000);
  if(!r.ok||!r.response)return {ok:false,status:r.status,ms:r.ms,error:r.error??null};
  const body=await r.response.json().catch(()=>null);return {ok:!!body?.ok,status:r.status,ms:r.ms,body};
}
function ch(feed){return Number.isFinite(Number(feed?.change_pct))?Number(feed.change_pct):null}
function shadowState(feeds,stale,marketState){
  if(marketState==='MARKET_CLOSED')return {state:'MARKET_CLOSED',hero_score:0,dragon_score:0,confidence:'WITHHELD'};
  if(stale)return {state:'DATA_GATED',hero_score:0,dragon_score:0,confidence:'WITHHELD'};
  const by=Object.fromEntries(feeds.map(x=>[x.symbol,x]));
  let hero=0,dragon=0;
  const gold=ch(by['GC=F']),dxy=ch(by['DX-Y.NYB']),brent=ch(by['BZ=F']);
  if(gold!==null){if(gold>=0.15)hero++;else if(gold<=-0.15)dragon++}
  if(dxy!==null){if(dxy<=-0.05)hero++;else if(dxy>=0.05)dragon++}
  if(brent!==null){if(brent<=-1)hero++;else if(brent>=1)dragon++}
  const state=dragon>=3?'DRAGON_PRESSURE_SHADOW':hero>=3?'HERO_REPAIR_SHADOW':dragon>hero?'DRAGON_BIAS_MIXED_SHADOW':hero>dragon?'HERO_BIAS_MIXED_SHADOW':'MIXED_SHADOW';
  return {state,hero_score:hero,dragon_score:dragon,confidence:'WITHHELD_CANONICAL_EVIDENCE'};
}
async function survivorState(upstream){
  const session=chicagoSession();
  const [routes,feeds]=await Promise.all([
    Promise.all(['/','/status','/live-markets','/gold-live','/member'].map(routeProbe)),
    Promise.all([yahoo('GC=F'),yahoo('DX-Y.NYB'),yahoo('^TNX'),yahoo('BZ=F'),yahoo('EURUSD=X'),yahoo('BTC-USD')])
  ]);
  const routesHealthy=routes.filter(x=>x.ok).length,feedsHealthy=feeds.filter(x=>x.ok).length;
  const coreSymbols=new Set(['GC=F','DX-Y.NYB','BZ=F','EURUSD=X','BTC-USD']);
  const core=feeds.filter(x=>coreSymbols.has(x.symbol));
  const coreFresh=core.filter(x=>x.ok&&x.age_minutes!==null&&x.age_minutes<=30);
  const goldFresh=core.find(x=>x.symbol==='GC=F')?.age_minutes<=30;
  const coreAges=coreFresh.map(x=>x.age_minutes).filter(Number.isFinite);
  const coreAge=coreAges.length?Math.max(...coreAges):null;
  const stale=session.state==='MARKET_OPEN'&&(!goldFresh||coreFresh.length<4||coreAge===null||coreAge>30);
  const shadow=shadowState(feeds,stale,session.state);
  const systemScore=Math.min(55,35+routesHealthy*2+coreFresh.length*2);
  const testPassed=routesHealthy===routes.length&&(session.state==='MARKET_CLOSED'||(goldFresh&&coreFresh.length>=4));
  return {
    ok:true,version:'v70.3-pressure-aware-survivor-node',generated_at:new Date().toISOString(),mode:'VERCEL_SURVIVOR_NODE',
    system_score:systemScore,market_session:session.state,
    health:{database:'MANAGEMENT_ONLY',edge_runtime:'RESTRICTED_QUOTA',evidence:'WITHHELD',
      connectors:{healthy:0,required:8,freshness_pct:0},cron:{active_jobs:null,failures_2h:null,state:'UNVERIFIED_FROM_SURVIVOR_NODE'},
      production_smoke:{state:'BLOCKED_BY_SUPABASE_QUOTA',age_minutes:null},public_routes:{healthy:routesHealthy,total:routes.length}},
    governance:{action_permitted:'WAIT',capital_permission:'0R',can_self_promote:false,
      rule:'Survivor telemetry can preserve observability but cannot substitute for canonical evidence or increase capital permission.'},
    blockers:['SUPABASE_PUBLIC_API_QUOTA_RESTRICTED','CANONICAL_EVIDENCE_UNAVAILABLE','PRODUCTION_SMOKE_BLOCKED'],
    autonomous_actions:['KEEP_PUBLIC_CONTROL_SURFACE_ONLINE','RUN_BOUNDED_SHADOW_MARKET_TELEMETRY','LOAD_SHED_NONESSENTIAL_EDGE_JOBS','WAIT_FOR_SUPABASE_QUOTA_RECOVERY','DO_NOT_PROMOTE_TRADING_PERMISSION'],
    autonomous_stack:{
      fabric_version:'v74-survivor-fallback',
      v70:{state:'VERCEL_SURVIVOR_NODE'},
      v71:{state:'COLLECTING_SHADOW_RESEARCH',observations_publicly_unverified:true,current_shadow_state:shadow.state},
      v72:{state:'LOAD_SHEDDING_POLICY_ACTIVE',paused_edge_jobs_publicly_unverified:true},
      v73:{state:'LOCKED_CANONICAL_UNAVAILABLE',human_review_required:true}
    },
    survivor_test:{test_id:'V70-TODAY-SURVIVOR',passed:testPassed,route_health:`${routesHealthy}/${routes.length}`,
      market_feeds:`${feedsHealthy}/${feeds.length} reachable`,core_fresh_feeds:`${coreFresh.length}/${core.length}`,
      core_quote_age_minutes:coreAge===null?null:Number(coreAge.toFixed(1)),stale,
      deferred_macro_feeds:['^TNX cash-session yield may remain Friday-stamped during Sunday futures/FX trading'],
      note:'This validates the Vercel survivor node, not canonical market permission.'},
    shadow_market:{truth_label:'SHADOW_TELEMETRY_ONLY',market_session:session.state,stale,signal:shadow,feeds},
    bridge:{canonical_upstream_ok:false,supabase_status:upstream.status,supabase_latency_ms:upstream.ms}
  };
}
async function legacyHandler(req:any,res:any){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'})}
  try{
    const upstream=await canonicalState();
    const [memory,learning]=upstream.ok
      ? await Promise.all([regimeMemory(),learningStack()])
      : [
          {ok:false,status:0,error:'DB_ADMISSION_GATED'},
          {ok:false,status:0,error:'DB_ADMISSION_GATED'}
        ];
    const body=upstream.ok&&upstream.body
      ? {...upstream.body,version:`${upstream.body.version}+vercel-bridge`,
          cross_asset_regime_memory:memory.ok&&memory.body?memory.body:{ok:false,state:'DB_MEMORY_UNAVAILABLE',status:memory.status},
          closed_loop_learning:learning.ok&&learning.body?learning.body:{ok:false,state:'DB_LEARNING_UNAVAILABLE',status:learning.status},
          bridge:{canonical_upstream_ok:true,supabase_status:upstream.status,supabase_latency_ms:upstream.ms}}
      : await survivorState(upstream);
    if(!body.cross_asset_regime_memory){
      body.cross_asset_regime_memory=memory.ok&&memory.body?memory.body:{ok:false,state:'DB_GATED_SURVIVOR_MODE',status:memory.status};
    }
    if(!body.closed_loop_learning){
      body.closed_loop_learning=learning.ok&&learning.body?learning.body:{ok:false,state:'DB_GATED_SURVIVOR_MODE',status:learning.status};
    }
    res.setHeader('Cache-Control','public, max-age=15, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(body);
  }catch(error){
    return res.status(200).json({ok:false,version:'v70.3-pressure-aware-survivor-node',generated_at:new Date().toISOString(),mode:'FAIL_CLOSED',
      system_score:0,market_session:'UNVERIFIED',health:{database:'UNVERIFIED',edge_runtime:'UNVERIFIED',evidence:'WITHHELD',
      connectors:{healthy:0,required:8,freshness_pct:0},cron:{active_jobs:0,failures_2h:0},production_smoke:{state:'UNAVAILABLE',age_minutes:null}},
      governance:{action_permitted:'WAIT',capital_permission:'0R',can_self_promote:false},blockers:['AUTONOMOUS_STATE_BRIDGE_FAILURE'],
      autonomous_actions:['FAIL_CLOSED'],bridge:{error:String(error).slice(0,160)}})
  }
}

Deno.serve(async(req:Request)=>{
  if(!(await tfaPrivateAuthorized(req))){
    return Response.json(
      {ok:false,error:'unauthorized_private_runtime'},
      {status:401,headers:{'Cache-Control':'no-store'}}
    );
  }
  const headers=new Headers();
  let status=200;
  const res:any={
    setHeader(name:string,value:string){headers.set(name,String(value));},
    status(code:number){status=code;return res;},
    json(body:any){headers.set('Content-Type','application/json');return new Response(JSON.stringify(body),{status,headers});}
  };
  return await legacyHandler(req,res);
});
