import { getVercelOidcToken } from '@vercel/oidc';

const TARGET='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v115-oidc-probe';

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }
  let token='';
  try{
    token=await getVercelOidcToken();
  }catch{}
  if(!token){
    res.setHeader('Cache-Control','no-store');
    return res.status(503).json({ok:false,state:'VERCEL_OIDC_UNAVAILABLE'});
  }
  try{
    const upstream=await fetch(TARGET,{
      headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},
      cache:'no-store',
      signal:AbortSignal.timeout(10000)
    });
    const body=await upstream.json().catch(()=>null);
    res.setHeader('Cache-Control','no-store');
    return res.status(upstream.status).json(body??{ok:false,state:'OIDC_PROBE_UNAVAILABLE'});
  }catch{
    res.setHeader('Cache-Control','no-store');
    return res.status(503).json({ok:false,state:'OIDC_PROBE_UNAVAILABLE'});
  }
}
