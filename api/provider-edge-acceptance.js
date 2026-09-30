const CHECKS=[
  {
    name:'auth_runtime',
    url:'https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-auth-runtime-check',
    validate:(body)=>body?.ok===true&&body?.state==='PASSWORD_AUTH_READY'
  },
  {
    name:'final_readiness',
    url:'https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-final-readiness',
    validate:(body)=>body?.ok===true&&Array.isArray(body?.hard_blockers)&&body.hard_blockers.length===0
  },
  {
    name:'billing_acceptance',
    url:'https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-billing-acceptance',
    validate:(body)=>body?.ok===true&&body?.ready_for_checkout===true&&body?.live_flow_verified===true
  }
];

async function probe(check,attempt){
  const started=Date.now();
  try{
    const url=new URL(check.url);
    url.searchParams.set('external_probe',String(Date.now())+'-'+attempt);
    const response=await fetch(url,{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-EXTERNAL-ACCEPTANCE/116.0'},
      cache:'no-store',
      signal:AbortSignal.timeout(12000)
    });
    const body=await response.json().catch(()=>null);
    return {
      name:check.name,
      attempt,
      ok:response.ok&&check.validate(body),
      status:response.status,
      latency_ms:Date.now()-started,
      state:body?.state??body?.version??null
    };
  }catch(error){
    return {
      name:check.name,
      attempt,
      ok:false,
      status:0,
      latency_ms:Date.now()-started,
      error:String(error).slice(0,120)
    };
  }
}

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }

  const results=[];
  for(let attempt=1;attempt<=2;attempt++){
    for(const check of CHECKS){
      results.push(await probe(check,attempt));
    }
  }

  const passed=results.filter(x=>x.ok).length;
  const rateLimited=results.filter(x=>x.status===429||x.status===546).length;
  const serverErrors=results.filter(x=>x.status>=500||x.status===0).length;
  const maxLatency=Math.max(...results.map(x=>Number(x.latency_ms)||0));
  const ok=passed===results.length&&rateLimited===0&&serverErrors===0;

  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Probe-Origin','VERCEL_EXTERNAL_TO_SUPABASE');
  return res.status(200).json({
    ok,
    version:'v116-external-edge-acceptance-v1',
    checked_at:new Date().toISOString(),
    state:ok?'EXTERNAL_EDGE_PATH_VERIFIED':'EXTERNAL_EDGE_PATH_DEGRADED',
    scope:'READ_ONLY_LOW_LOAD_ACCEPTANCE',
    summary:{
      passed,
      failed:results.length-passed,
      total:results.length,
      rate_limited:rateLimited,
      server_errors:serverErrors,
      max_latency_ms:maxLatency
    },
    results,
    truth:{
      externally_observed_from_vercel:true,
      proves_current_low_load_reachability:true,
      guarantees_future_capacity:false,
      load_test:false,
      creates_charges:false,
      mutates_data:false
    }
  });
}
