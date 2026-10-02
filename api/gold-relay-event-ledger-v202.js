const TARGET='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-relay-event-ledger-v202';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Gold-Relay-Event-Ledger','V202');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'});}
  try{
    const r=await fetch(TARGET,{headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-V202/1.0'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(9000)});
    const body=await r.json().catch(()=>null);
    return res.status(r.ok?200:r.status).json(body??{ok:false,state:'UNAVAILABLE'});
  }catch{
    return res.status(503).json({ok:false,state:'UNAVAILABLE',version:'v202-gold-relay-event-ledger-v1',
      governance:{append_only:true,hash_chained:true,action_permitted:'WAIT',capital_permission:'0R',automatic_execution:false,live_order_submission_enabled:false}});
  }
}
