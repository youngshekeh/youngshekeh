
const GOVERNANCE={action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false,production_capable:false,health_can_unlock_capital:false};
const FIELDS=new Set(['observed_at','heartbeat_sequence','relay_version','mt5_package_version','python_version','os_family','terminal_build','terminal_connected','trade_mode','symbol_resolved','history_access','process_uptime_seconds']);
async function sha256Hex(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function jsonBody(req,max=16384){
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new Error('json_required');
 const text=await req.text();if(new TextEncoder().encode(text).length>max)throw new Error('body_too_large');
 try{return JSON.parse(text);}catch{throw new Error('invalid_json');}
}
export function createBridgeHealthHandler({base,serverKey,fetchImpl=fetch}){
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
      const out=await rpc('get_v185_gold_sandbox_bridge_health_status',{});
      return out.ok&&out.body?.ok===true?reply(200,out.body):deny(503,'bridge_health_unavailable');
    }
    const bridgeId=Number(req.headers.get('x-tfa-bridge-id'));
    const bridgeKey=req.headers.get('x-tfa-bridge-key')||'';
    if(!Number.isSafeInteger(bridgeId)||bridgeId<=0||!/^tfa_demo_[A-Za-z0-9_-]{40,80}$/.test(bridgeKey))return deny(401,'invalid_bridge_credential');
    const hash=await sha256Hex(bridgeKey);
    const auth=await rpc('authenticate_v184_gold_sandbox_bridge',{p_bridge_id:bridgeId,p_key_sha256:hash});
    if(!auth.ok||auth.body?.ok!==true)return deny(401,'invalid_bridge_credential');
    let body;try{body=await jsonBody(req);}catch(error){return deny(error.message==='body_too_large'?413:error.message==='json_required'?415:400,error.message);}
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!FIELDS.has(k)))return deny(422,'invalid_heartbeat');
    if(body.trade_mode!=='DEMO')return deny(422,'non_demo_heartbeat_blocked');
    const out=await rpc('ingest_v185_gold_sandbox_bridge_heartbeat',{p_bridge_id:bridgeId,p_heartbeat:body});
    if(!out.ok||!out.body)return deny(503,'bridge_health_intake_unavailable');
    const status=out.body.ok===true?200:out.body.error==='conflicting_heartbeat_replay'||out.body.error==='out_of_order_heartbeat'?409:422;
    return reply(status,{...out.body,bridge:{bridge_id:bridgeId,source_code:auth.body.source_code,provider_symbol:auth.body.provider_symbol,production_capable:false},governance:GOVERNANCE});
  }catch{return deny(503,'bridge_health_intake_unavailable');}
 };
}
