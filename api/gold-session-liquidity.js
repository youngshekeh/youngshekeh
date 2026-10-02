import { getVercelOidcToken } from '@vercel/oidc';
const TARGET='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v188-session-liquidity';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Session-Liquidity','V188');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'});}
  let token='';try{token=await getVercelOidcToken();}catch{}
  if(!token)return res.status(503).json({ok:false,state:'IDENTITY_UNAVAILABLE',governance:{action_permitted:'WAIT',capital_permission:'0R'}});
  try{
    const r=await fetch(TARGET,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-V188/1.0'},
      cache:'no-store',redirect:'error',signal:AbortSignal.timeout(9000)});
    const body=await r.json().catch(()=>null);
    return res.status(r.ok?200:r.status).json(body??{ok:false,state:'UNAVAILABLE'});
  }catch{
    return res.status(503).json({ok:false,state:'UNAVAILABLE',error:'session_liquidity_unavailable',
      governance:{action_permitted:'WAIT',capital_permission:'0R',automatic_execution:false,live_order_submission_enabled:false}});
  }
}
