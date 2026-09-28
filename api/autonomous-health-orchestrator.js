const VERSION='v113.0-autonomous-health-orchestrator-v1';
const BASE=process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:'https://thefatheranalytics.com';

const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
function label(v){return String(v??'WITHHELD').replaceAll('_',' ')}
function lane(id,state,critical,detail,meta={}){
  return {id,state,critical:!!critical,detail,...meta};
}
async function fetchAny(path,timeout=9000){
  const attempts=[];
  for(let attempt=1;attempt<=2;attempt++){
    const started=Date.now();
    try{
      const r=await fetch(BASE+path,{
        headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS/113.0'},
        cache:'no-store',
        signal:AbortSignal.timeout(timeout)
      });
      const body=await r.json().catch(()=>null);
      const record={attempt,status:r.status,ok:r.ok,latency_ms:Date.now()-started};
      attempts.push(record);
      if(r.ok)return {ok:true,status:r.status,body,attempts,recovered_after_retry:attempt>1,latency_ms:record.latency_ms};
      if(!(r.status===408||r.status===425||r.status===429||r.status>=500))break;
    }catch(error){
      attempts.push({attempt,status:0,ok:false,latency_ms:Date.now()-started,error:String(error).slice(0,140)});
    }
    if(attempt===1)await sleep(140);
  }
  const last=attempts.at(-1)??{};
  return {ok:false,status:last.status??0,body:null,attempts,recovered_after_retry:false,latency_ms:last.latency_ms??0,error:last.error??null};
}
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'})}
  const started=Date.now();
  const [mission,quality,autonomous,quota,day]=await Promise.all([
    fetchAny('/api/mission-brief',15000),
    fetchAny('/api/data-quality-sentinel',10000),
    fetchAny('/api/autonomous-state',10000),
    fetchAny('/api/quota-probe',8000),
    fetchAny('/api/gold-day-state',10000)
  ]);

  const q=mission.body?.quant_accountability??{};
  const anchor=q?.external_anchor??{};
  const markets=mission.body?.global_market_dashboard?.assets??[];
  const gold=Array.isArray(markets)?markets.find(x=>x?.id==='gold'):null;
  const capitalSafe=autonomous.body?.governance?.action_permitted==='WAIT'&&autonomous.body?.governance?.capital_permission==='0R';
  const qualityState=String(quality.body?.state??'UNAVAILABLE');
  const rootState=String(anchor?.root_state??anchor?.state??'UNAVAILABLE');
  const heartbeatState=String(anchor?.heartbeat_state??'UNAVAILABLE');
  const canonicalRuntime=String(mission.body?.what_changed?.canonical_runtime??'UNAVAILABLE');
  const quotaRestricted=quota.body?.restricted===true;

  const lanes=[
    lane('MISSION_BRIEF',mission.ok?'HEALTHY':'FAIL',true,mission.ok?`HTTP ${mission.status} · public-safe intelligence assembled`:`mission unavailable · status ${mission.status}`,{recovered_after_retry:mission.recovered_after_retry}),
    lane('DATA_QUALITY',['PASS','PASS_WITH_WARNINGS'].includes(qualityState)?'HEALTHY':'FAIL',true,`sentinel ${label(qualityState)}`,{recovered_after_retry:quality.recovered_after_retry}),
    lane('CAPITAL_FIREWALL',capitalSafe?'HEALTHY':'FAIL',true,capitalSafe?'WAIT · 0R invariant verified':'capital firewall invariant violated',{recovered_after_retry:autonomous.recovered_after_retry}),
    lane('PROVENANCE_ROOT',['MATCH','PENDING_NEWER_CHECKPOINT'].includes(rootState)?'HEALTHY':'FAIL',true,`root ${label(rootState)}`),
    lane('ANCHOR_HEARTBEAT',heartbeatState==='FRESH'?'HEALTHY':'FAIL',true,`heartbeat ${label(heartbeatState)} · age ${anchor?.age_minutes??'n/a'}m`),
    lane('CANONICAL_RUNTIME',canonicalRuntime==='AVAILABLE'?'HEALTHY':'GATED',false,canonicalRuntime==='AVAILABLE'?'canonical runtime available':'survivor mode active; canonical upstream restricted'),
    lane('MARKET_GOLD',gold?.ok&&['FRESH','DELAYED'].includes(String(gold?.freshness))?'HEALTHY':'DEGRADED',false,gold?.ok?`Gold ${gold.price??'n/a'} · ${label(gold.freshness)} · age ${gold.age_minutes??'n/a'}m`:'Gold market proxy unavailable'),
    lane('UPSTREAM_QUOTA',quota.ok?(quotaRestricted?'GATED':'HEALTHY'):'DEGRADED',false,quota.ok?(quotaRestricted?`upstream restricted · status ${quota.body?.upstream_status??'n/a'}`:'upstream unrestricted'):'quota probe unavailable',{recovered_after_retry:quota.recovered_after_retry}),
    lane('DAY_STATE',day.ok&&day.body?.ok===true?'HEALTHY':'DEGRADED',false,day.ok?`day state ${label(day.body?.day_state?.day_state??day.body?.state?.phase)}`:'day-state endpoint unavailable',{recovered_after_retry:day.recovered_after_retry})
  ];

  const criticalFailures=lanes.filter(x=>x.critical&&x.state==='FAIL');
  const guarded=lanes.filter(x=>x.state==='GATED'||x.state==='DEGRADED');
  const recovered=lanes.filter(x=>x.recovered_after_retry);
  const state=criticalFailures.length?'FAIL_CLOSED':guarded.length?'GUARDED':'NOMINAL';
  const weighted=lanes.reduce((sum,x)=>sum+(x.state==='HEALTHY'?1:x.state==='GATED'?0.65:x.state==='DEGRADED'?0.4:0),0);
  const readinessPct=Math.round(weighted/lanes.length*100);

  const incidents=[
    ...criticalFailures.map(x=>({severity:'CRITICAL',lane:x.id,state:x.state,detail:x.detail,containment:'FAIL_CLOSED'})),
    ...guarded.map(x=>({severity:x.state==='GATED'?'INFO':'WARNING',lane:x.id,state:x.state,detail:x.detail,containment:x.state==='GATED'?'KEEP_GATED':'RETRY_AND_QUARANTINE_IF_PERSISTENT'}))
  ];
  const recoveryActions=[];
  if(recovered.length)recoveryActions.push({action:'TRANSIENT_RETRY_RECOVERY',state:'EXECUTED',detail:`${recovered.length} lane(s) recovered on the second fetch attempt`});
  if(guarded.some(x=>x.state==='DEGRADED'))recoveryActions.push({action:'DEGRADED_LANE_ISOLATION',state:'ACTIVE',detail:'Degraded non-critical lanes are excluded from authority escalation.'});
  if(quotaRestricted)recoveryActions.push({action:'SURVIVOR_RUNTIME',state:'ACTIVE',detail:'Canonical upstream remains restricted; survivor evidence may display but cannot gain execution authority.'});
  recoveryActions.push({action:'CAPITAL_FIREWALL',state:'LOCKED',detail:'WAIT · 0R remains immutable while health orchestration is observational.'});

  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Robots-Tag','noindex');
  return res.status(200).json({
    ok:criticalFailures.length===0,
    version:VERSION,
    checked_at:new Date().toISOString(),
    state,
    readiness_pct:readinessPct,
    latency_ms:Date.now()-started,
    summary:{
      lanes:lanes.length,
      healthy:lanes.filter(x=>x.state==='HEALTHY').length,
      gated:lanes.filter(x=>x.state==='GATED').length,
      degraded:lanes.filter(x=>x.state==='DEGRADED').length,
      critical_failures:criticalFailures.length,
      retry_recoveries:recovered.length
    },
    lanes,
    incidents,
    recovery_actions:recoveryActions,
    governance:{
      autonomous_observation:true,
      transient_retry_recovery:true,
      degraded_lane_isolation:true,
      automatic_execution:false,
      automatic_model_promotion:false,
      action_permitted:'WAIT',
      capital_permission:'0R',
      rule:'Health orchestration may retry, isolate, and fail closed; it may not grant execution or capital authority.'
    },
    truth_label:'AUTONOMOUS_SYSTEM_HEALTH_COORDINATION_NOT_FORECAST_ACCURACY_NOT_BROKER_EXECUTION'
  });
}