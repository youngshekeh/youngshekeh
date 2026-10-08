const TFA_PRIVATE_AUTHZ='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v115-oidc-probe';

function tfaConstantTimeEqual(a:string,b:string){
  if(!a||!b||a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
async function tfaPrivateAuthorized(req:Request){
  const auth=req.headers.get('authorization')||'';
  const token=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';
  if(!token)return false;

  const serviceRole=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(serviceRole&&tfaConstantTimeEqual(token,serviceRole))return true;

  try{
    const r=await fetch(TFA_PRIVATE_AUTHZ,{
      headers:{Authorization:auth,Accept:'application/json'},
      signal:AbortSignal.timeout(5000)
    });
    const body=await r.json().catch(()=>null);
    return r.ok&&body?.ok===true&&body?.state==='VERCEL_WORKLOAD_VERIFIED';
  }catch{return false}
}


const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'https://mpcelmjiycjpdyyflisn.supabase.co';
function publicApiKey(){
  const bundle=Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if(bundle){try{const parsed=JSON.parse(bundle);if(parsed?.default)return parsed.default}catch{}}
  return Deno.env.get('SUPABASE_ANON_KEY')||'';
}
const PUBLISHABLE_KEY=publicApiKey();
const INTERNAL_DB_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';

Deno.serve(async(req:Request)=>{
  if(!(await tfaPrivateAuthorized(req))){
    return Response.json(
      {ok:false,error:'unauthorized_private_runtime'},
      {status:401,headers:{'Cache-Control':'no-store'}}
    );
  }
  if(req.method!=='GET')return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers:{Allow:'GET'}});
  const started=Date.now();
  try{
    const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_v70_autonomous_state`,{
      method:'POST',
      headers:{apikey:INTERNAL_DB_KEY,Authorization:`Bearer ${INTERNAL_DB_KEY}`,'Content-Type':'application/json',Accept:'application/json'},
      body:'{}',
      signal:AbortSignal.timeout(1000)
    });
    const body=await response.json().catch(()=>null);
    const canonicalOk=response.ok&&body?.ok===true;
    return Response.json({
      ok:true,version:'v115-private-quota-probe-v2-fast-admission',checked_at:new Date().toISOString(),
      canonical_upstream_ok:canonicalOk,restricted:!canonicalOk,upstream_status:response.status,
      latency_ms:Date.now()-started,canonical_mode:canonicalOk?(body?.mode??null):null
    },{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    return Response.json({
      ok:true,version:'v115-private-quota-probe-v2-fast-admission',checked_at:new Date().toISOString(),
      canonical_upstream_ok:false,restricted:true,upstream_status:0,latency_ms:Date.now()-started,
      error:String(error).slice(0,160)
    },{headers:{'Cache-Control':'no-store'}});
  }
});
