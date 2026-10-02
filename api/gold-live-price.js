const UPSTREAM='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/broker-live-market-intake';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Live-XAUUSD','V186');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,state:'UNAVAILABLE',error:'method_not_allowed',governance:{action_permitted:'WAIT',capital_permission:'0R'}});
  }
  try{
    const response=await fetch(UPSTREAM,{headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-V186-LIVE-PRICE/1.0'},
      cache:'no-store',redirect:'error',signal:AbortSignal.timeout(3500)});
    const body=await response.json().catch(()=>null);
    if(!response.ok||!body||typeof body!=='object'||Array.isArray(body))throw new Error('upstream_unavailable');
    return res.status(200).json(body);
  }catch{
    return res.status(503).json({ok:false,state:'UNAVAILABLE',error:'live_xauusd_unavailable',
      governance:{action_permitted:'WAIT',capital_permission:'0R',machine_execution_allowed:false,live_order_submission_enabled:false}});
  }
}
