
const ALLOWED=new Set(['https://thefatheranalytics.com','https://www.thefatheranalytics.com','https://the-father-analytics.vercel.app','https://the-father-analytics-the-father.vercel.app']);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const GOVERNANCE={action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false,production_capable:false};

function claims(token){try{const p=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(atob(p+'='.repeat((4-p.length%4)%4)));}catch{return {};}}
async function jsonBody(req,max=16384){
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new Error('json_required');
  const text=await req.text();if(new TextEncoder().encode(text).length>max)throw new Error('body_too_large');
  try{return JSON.parse(text);}catch{throw new Error('invalid_json');}
}
async function sha256Hex(value){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function randomKey(){
  const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);
  const b64=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return 'tfa_demo_'+b64;
}
export function createBridgeControlHandler({base,serverKey,fetchImpl=fetch}){
 return async req=>{
  const origin=req.headers.get('origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',
    'Access-Control-Allow-Origin':origin&&ALLOWED.has(origin)?origin:'https://thefatheranalytics.com',
    'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  const deny=(status,error)=>reply(status,{ok:false,error,governance:GOVERNANCE});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return deny(405,'method_not_allowed');
  if(origin&&!ALLOWED.has(origin))return deny(403,'origin_not_allowed');
  const auth=req.headers.get('authorization')||'';const token=auth.replace(/^Bearer\s+/i,'').trim();
  if(!token||!/^Bearer\s+/i.test(auth))return deny(401,'missing_token');
  try{
    const key=serverKey();const serviceHeaders={apikey:key,Accept:'application/json'};if(key.startsWith('ey'))serviceHeaders.Authorization=`Bearer ${key}`;
    const read=async(path,init={})=>{const response=await fetchImpl(base+path,{...init,cache:'no-store',signal:AbortSignal.timeout(8000)});return{ok:response.ok,status:response.status,body:await response.json().catch(()=>null)};};
    const rpc=async(name,args)=>read('/rest/v1/rpc/'+name,{method:'POST',headers:{...serviceHeaders,'Content-Type':'application/json'},body:JSON.stringify(args)});
    const session=await read('/auth/v1/user',{headers:{apikey:key,Authorization:`Bearer ${token}`,Accept:'application/json'}});
    if(!session.ok||!UUID.test(String(session.body?.id||'')))return deny(401,'invalid_session');
    const userId=session.body.id;
    const owners=await read(`/rest/v1/owner_users?select=role,active&user_id=eq.${encodeURIComponent(userId)}&active=eq.true&limit=1`,{headers:serviceHeaders});
    if(!owners.ok)return deny(503,'owner_check_unavailable');
    if(!Array.isArray(owners.body)||owners.body[0]?.active!==true)return deny(403,'owner_only');
    if(claims(token)?.aal!=='aal2')return deny(403,'aal2_required');
    let body;try{body=await jsonBody(req);}catch(error){return deny(error.message==='body_too_large'?413:error.message==='json_required'?415:400,error.message);}
    const action=body?.action;
    if(action==='status'){
      const out=await rpc('list_v184_gold_sandbox_bridges',{p_owner_user_id:userId});
      return out.ok&&out.body?.ok===true?reply(200,out.body):deny(503,'bridge_status_unavailable');
    }
    if(action==='revoke'){
      if(!Number.isSafeInteger(body?.bridge_id)||body.bridge_id<=0)return deny(422,'invalid_bridge_id');
      const out=await rpc('revoke_v184_gold_sandbox_bridge',{p_owner_user_id:userId,p_bridge_id:body.bridge_id});
      return out.ok&&out.body?reply(out.body.ok===true?200:404,{...out.body,governance:GOVERNANCE}):deny(503,'bridge_revoke_unavailable');
    }
    if(action==='create'){
      const label=String(body?.bridge_label||'').trim();
      const source=String(body?.source_code||'').trim();
      const symbol=String(body?.provider_symbol||'').trim();
      if(label.length<1||label.length>80||!/^[A-Z0-9_-]{3,64}$/.test(source)||!/^XAUUSD[A-Za-z0-9._-]{0,16}$/.test(symbol))return deny(422,'invalid_bridge_configuration');
      const bridgeKey=randomKey();const hash=await sha256Hex(bridgeKey);
      const out=await rpc('create_v184_gold_sandbox_bridge',{
        p_owner_user_id:userId,p_bridge_label:label,p_source_code:source,p_provider_symbol:symbol,p_key_sha256:hash
      });
      if(!out.ok||!out.body)return deny(503,'bridge_create_unavailable');
      if(out.body.ok!==true)return reply(out.body.error==='active_bridge_already_exists'?409:422,{...out.body,governance:GOVERNANCE});
      return reply(200,{...out.body,bridge_key:bridgeKey,bridge_key_display_once:true,governance:GOVERNANCE});
    }
    return deny(422,'invalid_action');
  }catch{return deny(503,'bridge_control_unavailable');}
 };
}
