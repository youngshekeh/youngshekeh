const ALLOWED=new Set(['https://thefatheranalytics.com','https://www.thefatheranalytics.com','https://the-father-analytics.vercel.app','https://the-father-analytics-the-father.vercel.app']);
const GOVERNANCE={action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false,production_broker_verified:false,sandbox_evidence_can_unlock_capital:false};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
async function limitedJson(req){
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new Error('json_required');
  const reader=req.body?.getReader();if(!reader)throw new Error('invalid_json');
  const chunks=[];let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>32768){await reader.cancel();throw new Error('body_too_large');}chunks.push(part.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Error('invalid_json');}
}
function claims(token){try{const p=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(atob(p+'='.repeat((4-p.length%4)%4)));}catch{return {};}}
export function createSandboxReceiptHandler({base,serverKey,fetchImpl=fetch}){
  return async req=>{
    const origin=req.headers.get('origin');
    const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',
      'Access-Control-Allow-Origin':origin&&ALLOWED.has(origin)?origin:'https://thefatheranalytics.com',
      'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
    const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
    const deny=(status,error)=>reply(status,{ok:false,error,governance:GOVERNANCE});
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(!['GET','POST'].includes(req.method))return deny(405,'method_not_allowed');
    if(req.method==='POST'&&origin&&!ALLOWED.has(origin))return deny(403,'origin_not_allowed');
    const auth=req.headers.get('authorization')||'';const token=auth.replace(/^Bearer\s+/i,'').trim();
    if(req.method==='POST'&&(!token||!/^Bearer\s+/i.test(auth)))return deny(401,'missing_token');
    try{
      const key=serverKey();const serviceHeaders={apikey:key,Accept:'application/json'};if(key.startsWith('ey'))serviceHeaders.Authorization=`Bearer ${key}`;
      const read=async(path,init={})=>{const response=await fetchImpl(base+path,{...init,cache:'no-store',signal:AbortSignal.timeout(8000)});return{ok:response.ok,status:response.status,body:await response.json().catch(()=>null)};};
      const rpc=async(name,args)=>read('/rest/v1/rpc/'+name,{method:'POST',headers:{...serviceHeaders,'Content-Type':'application/json'},body:JSON.stringify(args)});
      if(req.method==='GET'){const status=await rpc('get_v183_gold_sandbox_certification_status',{});return status.ok&&status.body?.ok===true?reply(200,status.body):deny(503,'sandbox_status_unavailable');}
      const session=await read('/auth/v1/user',{headers:{apikey:key,Authorization:`Bearer ${token}`,Accept:'application/json'}});
      if(!session.ok||!UUID.test(String(session.body?.id||'')))return deny(401,'invalid_session');
      const userId=session.body.id;
      const owners=await read(`/rest/v1/owner_users?select=role,active&user_id=eq.${encodeURIComponent(userId)}&active=eq.true&limit=1`,{headers:serviceHeaders});
      if(!owners.ok)return deny(503,'owner_check_unavailable');
      if(!Array.isArray(owners.body)||owners.body[0]?.active!==true)return deny(403,'owner_only');
      if(claims(token)?.aal!=='aal2')return deny(403,'aal2_required');
      let receipt;try{receipt=await limitedJson(req);}catch(error){return deny(error.message==='body_too_large'?413:error.message==='json_required'?415:400,error.message);}
      const result=await rpc('ingest_v183_gold_sandbox_receipt',{p_owner_user_id:userId,p_receipt:receipt});
      if(!result.ok||!result.body)return deny(503,'sandbox_receipt_intake_unavailable');
      const status=result.body.ok===true?200:result.body.error==='conflicting_replay'||result.body.error==='out_of_order_receipt'?409:422;
      return reply(status,{...result.body,governance:GOVERNANCE});
    }catch{return deny(503,'sandbox_receipt_intake_unavailable');}
  };
}
