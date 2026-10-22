// V238: one bounded canonical read; no scheduler, model, seal or trading writes.
export const STATE_TTL_MS=10*60*1000;
const HOLD=Object.freeze({action_permitted:'WAIT',capital_permission:'0R',
  can_self_promote:false,external_effects:false,funds_moved:false,trades_sent:false,
  live_order_submission_enabled:false,human_release_required:true});
const label=v=>typeof v==='string'&&/^[A-Z0-9_ .:/-]{1,100}$/.test(v)?v:'UNVERIFIED';
const metric=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const labels=v=>Array.isArray(v)?v.slice(0,20).map(label):[];
function publicHealth(h={}){
  return {database:label(h.database),edge_runtime:label(h.edge_runtime),evidence:label(h.evidence),
    connectors:{healthy:metric(h.connectors?.healthy),required:metric(h.connectors?.required),freshness_pct:metric(h.connectors?.freshness_pct)},
    cron:{active_jobs:metric(h.cron?.active_jobs),failures_2h:metric(h.cron?.failures_2h)},
    production_smoke:{state:label(h.production_smoke?.state),age_minutes:metric(h.production_smoke?.age_minutes)}};
}
export function classifyState(body,now=Date.now()){
  if(!body||Array.isArray(body)||body.ok!==true)return 'PRIVATE_STATE_UNAVAILABLE';
  const stamp=Date.parse(String(body.generated_at||''));
  if(!Number.isFinite(stamp)||stamp>now+5000||now-stamp>STATE_TTL_MS)return 'STALE_RESEARCH_SNAPSHOT';
  if(body.governance?.action_permitted!=='WAIT'||body.governance?.capital_permission!=='0R'
    ||body.governance?.can_self_promote!==false)return 'RESEARCH_GOVERNANCE_UNVERIFIED';
  return 'CURRENT_RESEARCH_OBSERVATION';
}
export function createReadOnlyState({base,serviceKey,fetchImpl=fetch,now=Date.now,
  authDeadline=2000,readDeadline=4500}={}){
  let pending=null,cached=null,until=0,retryAt=0;
  const reply=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store',
    'X-TFA-Research':'V238-BOUNDED-CANONICAL-READ',...(status===503?{'Retry-After':'60'}:{})}});
  const hold=state=>reply(503,{ok:false,usable:false,state,version:'v238-read-only-state-v1',
    governance:HOLD,action:'WAIT',capital_permission:'0R',live_order_submission_enabled:false});
  async function read(){
    const r=await fetchImpl(base+'/rest/v1/rpc/get_v70_autonomous_state',{
      method:'POST',headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,
        'Content-Type':'application/json',Accept:'application/json'},body:'{}',
      redirect:'error',cache:'no-store',signal:AbortSignal.timeout(readDeadline)});
    if(!r.ok)throw Error('canonical_read_unavailable');
    return await r.json();
  }
  return async function handler(req){
    if(req.method!=='GET')return reply(405,{ok:false,error:'method_not_allowed'});
    const auth=req.headers.get('authorization')||'';
    if(!serviceKey||!auth.startsWith('Bearer ')||auth.length<16)return reply(401,{ok:false,error:'unauthorized_private_runtime'});
    // Always verify caller identity, including on a warm data cache. No caller
    // controls a URL, query, RPC name, credential or database request body.
    try{
      const r=await fetchImpl(base+'/functions/v1/runtime-v115-oidc-probe',{
        headers:{Authorization:auth,Accept:'application/json'},redirect:'error',
        cache:'no-store',signal:AbortSignal.timeout(authDeadline)});
      const b=await r.json();
      if(!r.ok||b?.ok!==true||b.state!=='VERCEL_WORKLOAD_VERIFIED')return reply(401,{ok:false,error:'unauthorized_private_runtime'});
    }catch{return hold('WORKLOAD_IDENTITY_UNAVAILABLE');}
    if(now()<retryAt)return hold('PRIVATE_STATE_RETRY_COOLDOWN');
    try{
      let body;
      if(cached&&now()<until)body=cached;
      else{
        if(!pending)pending=read().then(b=>{cached=b;until=now()+10000;return b;})
          .finally(()=>{pending=null;});
        body=await pending;
      }
      const state=classifyState(body,now());
      if(state!=='CURRENT_RESEARCH_OBSERVATION')return hold(state);
      // Publish only the existing aggregate research fields; never forward raw
      // database errors, private identifiers, credentials or new backend fields.
      return reply(200,{ok:true,usable:true,version:'v238-read-only-state-v1',state,
        generated_at:body.generated_at,mode:label(body.mode),system_score:metric(body.system_score),
        market_session:label(body.market_session),health:publicHealth(body.health??{}),
        blockers:labels(body.blockers),autonomous_actions:labels(body.autonomous_actions),
        governance:HOLD,live_order_submission_enabled:false,
        continuous_kernel_certified:false,checkout_certified:false});
    }catch{cached=null;until=0;retryAt=now()+30000;return hold('PRIVATE_STATE_UNAVAILABLE');}
  };
}
