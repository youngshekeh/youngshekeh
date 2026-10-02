
const GOVERNANCE={action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false,production_capable:false,bridge_can_unlock_capital:false};
const EVENT_FIELDS=new Set(['sequence','observed_at','event_type','client_order_id','broker_order_id','side','requested_r','requested_price','fill_price','bid','ask','kill_switch_state']);
async function sha256Hex(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function jsonBody(req,max=32768){
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new Error('json_required');
 const text=await req.text();if(new TextEncoder().encode(text).length>max)throw new Error('body_too_large');
 try{return JSON.parse(text);}catch{throw new Error('invalid_json');}
}
export function createBridgeIntakeHandler({base,serverKey,fetchImpl=fetch}){
 return async req=>{
  const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  const deny=(status,error)=>reply(status,{ok:false,error,governance:GOVERNANCE});
  if(!['GET','POST'].includes(req.method))return deny(405,'method_not_allowed');
  try{
    const key=serverKey();const serviceHeaders={apikey:key,Accept:'application/json'};if(key.startsWith('ey'))serviceHeaders.Authorization=`Bearer ${key}`;
    const read=async(path,init={})=>{const response=await fetchImpl(base+path,{...init,cache:'no-store',signal:AbortSignal.timeout(8000)});return{ok:response.ok,status:response.status,body:await response.json().catch(()=>null)};};
    const rpc=async(name,args)=>read('/rest/v1/rpc/'+name,{method:'POST',headers:{...serviceHeaders,'Content-Type':'application/json'},body:JSON.stringify(args)});
    if(req.method==='GET'){
      const out=await rpc('get_v184_gold_sandbox_bridge_transport_status',{});
      return out.ok&&out.body?.ok===true?reply(200,out.body):deny(503,'bridge_status_unavailable');
    }
    const bridgeId=Number(req.headers.get('x-tfa-bridge-id'));
    const bridgeKey=req.headers.get('x-tfa-bridge-key')||'';
    if(!Number.isSafeInteger(bridgeId)||bridgeId<=0||!/^tfa_demo_[A-Za-z0-9_-]{40,80}$/.test(bridgeKey))return deny(401,'invalid_bridge_credential');
    const hash=await sha256Hex(bridgeKey);
    const auth=await rpc('authenticate_v184_gold_sandbox_bridge',{p_bridge_id:bridgeId,p_key_sha256:hash});
    if(!auth.ok||auth.body?.ok!==true)return deny(401,'invalid_bridge_credential');
    let body;try{body=await jsonBody(req);}catch(error){return deny(error.message==='body_too_large'?413:error.message==='json_required'?415:400,error.message);}
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!EVENT_FIELDS.has(k)))return deny(422,'invalid_bridge_event');
    const receipt={mode:'BROKER_DEMO_SANDBOX',asset:'XAUUSD',provenance:'DEMO_BROKER_USER_SUPPLIED',
      source_code:auth.body.source_code,provider_symbol:auth.body.provider_symbol,...body};
    const out=await rpc('ingest_v183_gold_sandbox_receipt',{p_owner_user_id:auth.body.owner_user_id,p_receipt:receipt});
    if(!out.ok||!out.body)return deny(503,'bridge_intake_unavailable');
    const status=out.body.ok===true?200:out.body.error==='conflicting_replay'||out.body.error==='out_of_order_receipt'?409:422;
    return reply(status,{...out.body,bridge:{bridge_id:bridgeId,source_code:auth.body.source_code,provider_symbol:auth.body.provider_symbol,production_capable:false},governance:GOVERNANCE});
  }catch{return deny(503,'bridge_intake_unavailable');}
 };
}
