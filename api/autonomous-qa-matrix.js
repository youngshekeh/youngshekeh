import { getVercelOidcToken } from '@vercel/oidc';

const TARGET='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v115-autonomous-qa';

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }

  let oidcToken='';
  try{
    oidcToken=await getVercelOidcToken();
  }catch{}

  if(!oidcToken){
    res.setHeader('Cache-Control','no-store');
    return res.status(503).json({ok:false,error:'vercel_workload_identity_unavailable'});
  }

  try{
    const incoming=new URL(req.url,'https://thefatheranalytics.com');
    const target=new URL(TARGET);
    target.search=incoming.search;
    const upstream=await fetch(target,{
      headers:{
        Authorization:`Bearer ${oidcToken}`,
        Accept:'application/json',
        'User-Agent':'THE-FATHER-ANALYTICS-PUBLIC-SHELL/115.1'
      },
      cache:'no-store',
      signal:AbortSignal.timeout(30000)
    });
    const body=await upstream.json().catch(()=>null);
    const pressureOpen=body?.transport?.pressure_circuit?.open===true;
    // Keep browsers uncached. Only a truthful pressure-open result is shared at Vercel's CDN
    // for the current five-minute URL bucket to suppress cross-client diagnostic amplification.
    if(pressureOpen){
      res.setHeader('Cache-Control','public, max-age=0, s-maxage=300, must-revalidate');
      res.setHeader('CDN-Cache-Control','public, max-age=300');
      res.setHeader('Vercel-CDN-Cache-Control','public, max-age=300');
      res.setHeader('X-TFA-Pressure-Cache','ACTIVE_5M');
    }else{
      res.setHeader('Cache-Control','private, no-store');
      res.setHeader('CDN-Cache-Control','no-store');
      res.setHeader('Vercel-CDN-Cache-Control','no-store');
      res.setHeader('X-TFA-Pressure-Cache','BYPASS');
    }
    res.setHeader('X-TFA-Runtime','PRIVATE_BRAIN');
    res.setHeader('X-TFA-Auth','VERCEL_OIDC');
    return res.status(upstream.ok?200:upstream.status).json(body??{ok:false,error:'private_runtime_unavailable'});
  }catch{
    res.setHeader('Cache-Control','no-store');
    return res.status(503).json({ok:false,error:'private_runtime_unavailable'});
  }
}
