import { getVercelOidcToken } from '@vercel/oidc';
import {classifyGoldStateBridge} from '../src/v300-v79-semantic-http.mjs';

const TARGET='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v79-liquidity';

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
      redirect:'error',
      cache:'no-store',
      signal:AbortSignal.timeout(12000)
    });
    const body=await upstream.json().catch(()=>null);
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-TFA-Runtime','PRIVATE_BRAIN');
    res.setHeader('X-TFA-Auth','VERCEL_OIDC');
    const result=classifyGoldStateBridge({httpStatus:upstream.status,body});
    res.setHeader('X-TFA-Gold-State-Policy',result.policy);
    if(!result.certifiedObservation)res.setHeader('Retry-After','60');
    return res.status(result.httpStatus).json(result.payload);
  }catch{
    res.setHeader('Cache-Control','no-store');
    return res.status(503).json({ok:false,error:'private_runtime_unavailable'});
  }
}
