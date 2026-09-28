const SUPABASE_URL='https://mpcelmjiycjpdyyflisn.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }
  try{
    const upstream=await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_v70_autonomous_state`,{
      method:'POST',
      headers:{apikey:PUBLISHABLE_KEY,'Content-Type':'application/json',Accept:'application/json'},
      body:'{}'
    });
    const textBody=await upstream.text();
    res.setHeader('Cache-Control','public, max-age=15, s-maxage=60, stale-while-revalidate=120');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    if(!upstream.ok){
      return res.status(200).send(JSON.stringify({
        ok:false,
        version:'v70-vercel-database-bridge',
        mode:'DATABASE_STATE_UNAVAILABLE',
        system_score:0,
        market_session:'UNVERIFIED',
        health:{database:'UNVERIFIED',edge_runtime:'RESTRICTED_OR_UNAVAILABLE',evidence:'UNVERIFIED',connectors:{healthy:0,required:0,freshness_pct:0},cron:{active_jobs:0,failures_2h:0},production_smoke:{state:'UNAVAILABLE',age_minutes:null}},
        governance:{action_permitted:'WAIT',capital_permission:'0R',can_self_promote:false},
        blockers:['DATABASE_PUBLIC_STATE_UNAVAILABLE'],
        autonomous_actions:['FAIL_CLOSED'],
        bridge:{upstream_status:upstream.status}
      }));
    }
    return res.status(200).send(textBody);
  }catch(error){
    return res.status(200).json({
      ok:false,
      version:'v70-vercel-database-bridge',
      mode:'DATABASE_STATE_UNAVAILABLE',
      system_score:0,
      market_session:'UNVERIFIED',
      health:{database:'UNVERIFIED',edge_runtime:'RESTRICTED_OR_UNAVAILABLE',evidence:'UNVERIFIED',connectors:{healthy:0,required:0,freshness_pct:0},cron:{active_jobs:0,failures_2h:0},production_smoke:{state:'UNAVAILABLE',age_minutes:null}},
      governance:{action_permitted:'WAIT',capital_permission:'0R',can_self_promote:false},
      blockers:['DATABASE_PUBLIC_STATE_UNAVAILABLE'],
      autonomous_actions:['FAIL_CLOSED'],
      bridge:{error:String(error).slice(0,160)}
    });
  }
}
