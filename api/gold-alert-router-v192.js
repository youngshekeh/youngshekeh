const TARGET='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-alert-router-v192';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Gold-Alert-Router','V192');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'});}
  try{
    const r=await fetch(TARGET,{headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-V192-ROUTER/1.0'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(9000)});
    const body=await r.json().catch(()=>null);
    return res.status(r.ok?200:r.status).json(body??{ok:false,state:'UNAVAILABLE'});
  }catch{
    return res.status(503).json({ok:false,state:'UNAVAILABLE',version:'v192-gold-alert-router-v1',
      counts:{routes:0,visible_alerts:0,notification_ready:0,chain_failures:null},
      governance:{priority_score_not_probability:true,alerts_are_review_prompts_only:true,action_permitted:'WAIT',capital_permission:'0R',automatic_execution:false,live_order_submission_enabled:false}});
  }
}
