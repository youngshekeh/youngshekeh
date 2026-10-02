import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type, apikey','Access-Control-Allow-Methods':'GET, OPTIONS'};
const VERSION='v192-gold-alert-router-public-v1';
function serverKey(){
  const bundle=Deno.env.get('SUPABASE_SECRET_KEYS');
  if(bundle){try{const p=JSON.parse(bundle);if(p?.default)return p.default}catch{}}
  const legacy=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!legacy)throw new Error('server_key_unavailable');
  return legacy;
}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});
  if(req.method!=='GET')return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers:{...CORS,Allow:'GET'}});
  try{
    const base=Deno.env.get('SUPABASE_URL')||'https://mpcelmjiycjpdyyflisn.supabase.co',key=serverKey();
    const r=await fetch(base+'/rest/v1/rpc/get_v192_gold_alert_router',{
      method:'POST',
      headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({p_limit:30}),
      cache:'no-store',signal:AbortSignal.timeout(8000)
    });
    const body=await r.json().catch(()=>null);
    if(!r.ok||body?.ok!==true)throw new Error('router_rpc_'+r.status);
    return Response.json({...body,public_version:VERSION},{headers:{...CORS,'Cache-Control':'public, max-age=5, s-maxage=15, stale-while-revalidate=30'}});
  }catch(error){
    console.error(error);
    return Response.json({ok:false,version:VERSION,state:'UNAVAILABLE',
      counts:{routes:0,visible_alerts:0,notification_ready:0,chain_failures:null},
      governance:{priority_score_not_probability:true,alerts_are_review_prompts_only:true,action_permitted:'WAIT',capital_permission:'0R',automatic_execution:false,live_order_submission_enabled:false}},
      {status:503,headers:{...CORS,'Cache-Control':'no-store'}});
  }
});