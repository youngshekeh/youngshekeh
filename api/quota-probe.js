const SUPABASE_URL='https://mpcelmjiycjpdyyflisn.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }
  const started=Date.now();
  try{
    const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_v70_autonomous_state`,{
      method:'POST',
      headers:{apikey:PUBLISHABLE_KEY,'Content-Type':'application/json',Accept:'application/json'},
      body:'{}',
      signal:AbortSignal.timeout(3500)
    });
    const body=await response.json().catch(()=>null);
    const canonicalOk=response.ok&&body?.ok===true;
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({
      ok:true,
      version:'v70.3-quota-recovery-probe',
      checked_at:new Date().toISOString(),
      canonical_upstream_ok:canonicalOk,
      restricted:!canonicalOk,
      upstream_status:response.status,
      latency_ms:Date.now()-started,
      canonical_mode:canonicalOk?(body?.mode??null):null
    });
  }catch(error){
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({
      ok:true,
      version:'v70.3-quota-recovery-probe',
      checked_at:new Date().toISOString(),
      canonical_upstream_ok:false,
      restricted:true,
      upstream_status:0,
      latency_ms:Date.now()-started,
      error:String(error).slice(0,160)
    });
  }
}
