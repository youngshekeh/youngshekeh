const VERSION='v78-autonomous-regression-matrix-v1';
const BASE='https://thefatheranalytics.com';

async function fetchAny(path,timeout=10000){
  const started=Date.now();
  try{
    const r=await fetch(BASE+path,{headers:{Accept:'application/json,text/html','User-Agent':'THE-FATHER-ANALYTICS/78.0'},cache:'no-store',signal:AbortSignal.timeout(timeout)});
    const ct=r.headers.get('content-type')||'';
    const body=ct.includes('application/json')?await r.json().catch(()=>null):await r.text().catch(()=>null);
    return {ok:r.ok,status:r.status,latency_ms:Date.now()-started,body};
  }catch(error){return {ok:false,status:0,latency_ms:Date.now()-started,body:null,error:String(error).slice(0,160)}}
}
function result(name,pass,detail,latency_ms){return {name,pass:!!pass,detail,latency_ms}}
function positive(v){const n=Number(v);return Number.isFinite(n)&&n>0}
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'})}
  const [home,gold,auto,day,quality,selftest,tournament,shadow,quota]=await Promise.all([
    fetchAny('/'),
    fetchAny('/gold-live/'),
    fetchAny('/api/autonomous-state'),
    fetchAny('/api/gold-day-state'),
    fetchAny('/api/data-quality-sentinel'),
    fetchAny('/api/data-quality-sentinel?selftest=1'),
    fetchAny('/api/research-model-tournament'),
    fetchAny('/api/shadow-market-snapshot'),
    fetchAny('/api/quota-probe')
  ]);
  const tests=[];
  tests.push(result('homepage_http',home.status===200,`status=${home.status}`,home.latency_ms));
  tests.push(result('gold_surface_http',gold.status===200,`status=${gold.status}`,gold.latency_ms));
  tests.push(result('v70_firewall',auto.body?.governance?.action_permitted==='WAIT'&&auto.body?.governance?.capital_permission==='0R',
    `action=${auto.body?.governance?.action_permitted}, capital=${auto.body?.governance?.capital_permission}`,auto.latency_ms));
  tests.push(result('v75_no_zero_ohlc',day.body?.ok===true&&positive(day.body?.current?.open)&&positive(day.body?.current?.high)&&positive(day.body?.current?.low)&&positive(day.body?.current?.price)&&positive(day.body?.previous?.high)&&positive(day.body?.previous?.low),
    `current=${JSON.stringify(day.body?.current??null)}, previous_high=${day.body?.previous?.high}, previous_low=${day.body?.previous?.low}`,day.latency_ms));
  tests.push(result('v75_shadow_only',day.body?.governance?.canonical===false&&day.body?.governance?.action_permitted==='WAIT'&&day.body?.governance?.capital_permission==='0R',
    `canonical=${day.body?.governance?.canonical}, action=${day.body?.governance?.action_permitted}, capital=${day.body?.governance?.capital_permission}`,day.latency_ms));
  tests.push(result('v76_live_gate',quality.body?.state==='PASS'||quality.body?.state==='PASS_WITH_WARNINGS',
    `state=${quality.body?.state}, critical=${quality.body?.counts?.critical}`,quality.latency_ms));
  tests.push(result('v76_regression_quarantine',selftest.body?.state==='QUARANTINE'&&selftest.body?.self_test?.passed===true,
    `state=${selftest.body?.state}, passed=${selftest.body?.self_test?.passed}`,selftest.latency_ms));
  tests.push(result('v77_shadow_only',tournament.body?.governance?.canonical===false&&tournament.body?.governance?.action_permitted==='WAIT'&&tournament.body?.governance?.capital_permission==='0R'&&tournament.body?.governance?.automatic_model_promotion===false,
    `canonical=${tournament.body?.governance?.canonical}, promotion=${tournament.body?.governance?.automatic_model_promotion}`,tournament.latency_ms));
  tests.push(result('shadow_feed_firewall',shadow.body?.governance?.canonical===false&&shadow.body?.governance?.action_permitted==='WAIT'&&shadow.body?.governance?.capital_permission==='0R',
    `canonical=${shadow.body?.governance?.canonical}, action=${shadow.body?.governance?.action_permitted}`,shadow.latency_ms));
  tests.push(result('quota_probe_truthful',quota.body?.ok===true&&typeof quota.body?.restricted==='boolean',
    `restricted=${quota.body?.restricted}, upstream=${quota.body?.upstream_status}`,quota.latency_ms));

  const passed=tests.filter(x=>x.pass).length;
  const failed=tests.length-passed;
  const state=failed===0?'PASS':failed<=2?'DEGRADED':'FAIL';
  const maxLatency=Math.max(...tests.map(x=>Number(x.latency_ms)||0));
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
    ok:failed===0,
    version:VERSION,
    checked_at:new Date().toISOString(),
    state,
    summary:{passed,failed,total:tests.length,max_latency_ms:maxLatency},
    tests,
    invariants:{
      canonical_execution_permission:'UNCHANGED',
      action_permitted:'WAIT',
      capital_permission:'0R',
      automatic_promotion:false
    }
  });
}