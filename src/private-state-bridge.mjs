// Read-only public state bridge. A reachable private service is not healthy evidence.
export const PRIVATE_STATE_DEADLINE_MS=8000;
export function usablePrivateState(body){
  return body!==null&&typeof body==='object'&&!Array.isArray(body)
    &&body.ok===true&&body.usable!==false;
}
export function createPrivateStateHandler({getToken,fetchImpl=fetch,
  deadlineMs=PRIVATE_STATE_DEADLINE_MS,functionSlug='runtime-v70-autonomous-state'}={}){
  if(!['runtime-v70-autonomous-state','runtime-v115-mission-brief'].includes(functionSlug))throw Error('invalid_private_read_target');
  return async function handler(req,res){
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-TFA-Runtime','PRIVATE_BRAIN');
    res.setHeader('X-TFA-Auth','VERCEL_OIDC');
    const unavailable=(error,body=null)=>{
      res.setHeader('Retry-After','60');
      return res.status(503).json({ok:false,usable:false,
        state:['LOAD_SHED_DB_RECOVERY','STALE_RESEARCH_SNAPSHOT','RESEARCH_GOVERNANCE_UNVERIFIED','WORKLOAD_IDENTITY_UNAVAILABLE','PRIVATE_STATE_RETRY_COOLDOWN'].includes(body?.state)?body.state:'PRIVATE_STATE_UNAVAILABLE',
        error,action:'WAIT',capital_permission:'0R',
        live_order_submission_enabled:false,automatic_execution:false,
        governance:{action_permitted:'WAIT',capital_permission:'0R',
          external_effects:false,funds_moved:false,trades_sent:false,human_release_required:true}});
    };
    if(req.method!=='GET'){
      res.setHeader('Allow','GET');
      return res.status(405).json({ok:false,error:'method_not_allowed'});
    }
    let token;
    try{token=await getToken();}catch{}
    if(!token)return unavailable('vercel_workload_identity_unavailable');
    try{
      const target=new URL('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/'+functionSlug);
      target.search=new URL(req.url,'https://thefatheranalytics.com').search;
      const upstream=await fetchImpl(target,{headers:{Authorization:`Bearer ${token}`,
        Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-PUBLIC-SHELL/237'},
        redirect:'error',cache:'no-store',signal:AbortSignal.timeout(deadlineMs)});
      const body=await upstream.json();
      if(!upstream.ok||!usablePrivateState(body))return unavailable('private_state_unverified',body);
      return res.status(200).json(body);
    }catch{return unavailable('private_runtime_unavailable');}
  };
}
