
const GOVERNANCE={action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false,machine_execution_allowed:false,market_data_only:true};
const FIELDS=new Set(['observed_at','sequence','trade_mode','bid','ask','last','terminal_tick_time_msc','tick_flags','volume_real','terminal_build','terminal_connected','digits','point','relay_version','mt5_package_version','os_family']);
async function sha256Hex(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function jsonBody(req,max=16384){
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new Error('json_required');
 const text=await req.text();if(new TextEncoder().encode(text).length>max)throw new Error('body_too_large');
 try{return JSON.parse(text);}catch{throw new Error('invalid_json');}
}
export function createLiveMarketIntakeHandler({base,serverKey,fetchImpl=fetch}){
 return async req=>{
  const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  const deny=(status,error)=>reply(status,{ok:false,error,governance:GOVERNANCE});
  if(!['GET','POST'].includes(req.method))return deny(405,'method_not_allowed');
  try{
    const key=serverKey();const serviceHeaders={apikey:key,Accept:'application/json'};if(key.startsWith('ey'))serviceHeaders.Authorization=`Bearer ${key}`;
    const read=async(path,init={})=>{const response=await fetchImpl(base+path,{...init,cache:'no-store',signal:AbortSignal.timeout(6000)});return{ok:response.ok,status:response.status,body:await response.json().catch(()=>null)};};
    const rpc=async(name,args)=>read('/rest/v1/rpc/'+name,{method:'POST',headers:{...serviceHeaders,'Content-Type':'application/json'},body:JSON.stringify(args)});
    if(req.method==='GET'){
      const out=await rpc('get_v186_gold_live_market_status',{});
      return out.ok&&out.body?.ok===true?reply(200,out.body):deny(503,'live_market_status_unavailable');
    }
    const bridgeId=Number(req.headers.get('x-tfa-live-bridge-id'));
    const bridgeKey=req.headers.get('x-tfa-live-bridge-key')||'';
    if(!Number.isSafeInteger(bridgeId)||bridgeId<=0||!/^tfa_live_[A-Za-z0-9_-]{40,80}$/.test(bridgeKey))return deny(401,'invalid_bridge_credential');
    const hash=await sha256Hex(bridgeKey);
    const auth=await rpc('authenticate_v186_gold_live_market_bridge',{p_bridge_id:bridgeId,p_key_sha256:hash});
    if(!auth.ok||auth.body?.ok!==true)return deny(401,'invalid_bridge_credential');
    let body;try{body=await jsonBody(req);}catch(error){return deny(error.message==='body_too_large'?413:error.message==='json_required'?415:400,error.message);}
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!FIELDS.has(k)))return deny(422,'invalid_live_tick');
    const out=await rpc('ingest_v186_gold_live_tick',{p_bridge_id:bridgeId,p_tick:body});
    if(!out.ok||!out.body)return deny(503,'live_tick_intake_unavailable');
    const status=out.body.ok===true?200:out.body.error==='conflicting_tick_replay'||out.body.error==='out_of_order_tick'?409:422;
    return reply(status,{...out.body,bridge:{bridge_id:bridgeId,source_code:auth.body.source_code,provider_symbol:auth.body.provider_symbol,market_data_only:true},governance:GOVERNANCE});
  }catch{return deny(503,'live_tick_intake_unavailable');}
 };
}
