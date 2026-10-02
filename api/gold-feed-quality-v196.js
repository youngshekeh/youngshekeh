const TARGET='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-feed-quality-v196';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Gold-Feed-Quality','V196');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'});}
  try{
    const r=await fetch(TARGET,{headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-V196/1.0'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
    const body=await r.json().catch(()=>null);
    return res.status(r.ok?200:r.status).json(body??{ok:false,state:'UNAVAILABLE'});
  }catch{
    return res.status(503).json({ok:false,state:'UNAVAILABLE',version:'v196-gold-feed-quality-v1',
      governance:{quality_score_not_probability:true,probation_required:true,market_data_only:true,feed_quality_cannot_grant_trade_permission:true,automatic_execution:false,machine_execution_allowed:false,live_order_submission_enabled:false,action_permitted:'WAIT',capital_permission:'0R'}});
  }
}
