const TFA_PRIVATE_AUTHZ='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v115-oidc-probe';
function constantTimeEqual(a:string,b:string){if(!a||!b||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
async function authorized(req:Request){
  const auth=req.headers.get('authorization')||'';
  const token=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';
  if(!token)return false;
  const serviceRole=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(serviceRole&&constantTimeEqual(token,serviceRole))return true;
  try{
    const r=await fetch(TFA_PRIVATE_AUTHZ,{headers:{Authorization:auth,Accept:'application/json'},signal:AbortSignal.timeout(5000)});
    const body=await r.json().catch(()=>null);
    return r.ok&&body?.ok===true&&body?.state==='VERCEL_WORKLOAD_VERIFIED';
  }catch{return false}
}
const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'https://mpcelmjiycjpdyyflisn.supabase.co';
const SERVICE_ROLE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
async function dbState(){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_v163_safe_alternative_minute_search`,{
    method:'POST',
    headers:{apikey:SERVICE_ROLE,Authorization:`Bearer ${SERVICE_ROLE}`,'Content-Type':'application/json',Accept:'application/json'},
    body:'{}',
    signal:AbortSignal.timeout(15000)
  });
  const body=await r.json().catch(()=>null);
  if(!r.ok||!body)throw new Error(`v163_rpc_${r.status}`);
  return body;
}
Deno.serve(async(req:Request)=>{
  if(req.method!=='GET')return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers:{Allow:'GET','Cache-Control':'no-store'}});
  if(!(await authorized(req)))return Response.json({ok:false,error:'unauthorized_private_runtime'},{status:401,headers:{'Cache-Control':'no-store'}});
  try{
    const state=await dbState();
    return Response.json({...state,engine_version:state?.version??null,version:'v163-safe-alternative-minute-search-private-runtime-v1',runtime_bridge:{private:true,auth:'VERCEL_OIDC_OR_SUPABASE_SERVICE_ROLE',source:'get_v163_safe_alternative_minute_search'}},{headers:{'Cache-Control':'no-store','X-TFA-Runtime':'PRIVATE_BRAIN','X-TFA-Engine':'V163'}});
  }catch(error){
    return Response.json({ok:false,version:'v163-safe-alternative-minute-search-private-runtime-v1',state:'FAIL_CLOSED',error:'v163_safe_alternative_runtime_unavailable',detail:String(error).slice(0,160),governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_routing:false,automatic_rescheduling:false,automatic_rollback:false}},{status:503,headers:{'Cache-Control':'no-store','X-TFA-Runtime':'PRIVATE_BRAIN','X-TFA-Engine':'V163'}});
  }
});