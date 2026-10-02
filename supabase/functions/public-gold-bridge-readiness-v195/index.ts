import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {buildGoldBridgeReadiness} from './builder.mjs';

const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type, apikey','Access-Control-Allow-Methods':'GET, OPTIONS'};
function serverKey(){
  const bundle=Deno.env.get('SUPABASE_SECRET_KEYS');
  if(bundle){try{const p=JSON.parse(bundle);if(p?.default)return p.default}catch{}}
  const k=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!k)throw new Error('server_key_unavailable');
  return k;
}
async function jsonFetch(url,init={}){
  const r=await fetch(url,{...init,cache:'no-store',signal:AbortSignal.timeout(7000)});
  const body=await r.json().catch(()=>null);return{r,body};
}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});
  if(req.method!=='GET')return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers:{...CORS,Allow:'GET'}});
  try{
    const base=Deno.env.get('SUPABASE_URL')||'https://mpcelmjiycjpdyyflisn.supabase.co',key=serverKey();
    const auth=key.startsWith('ey')?{Authorization:`Bearer ${key}`}:{};
    const headers={apikey:key,Accept:'application/json',...auth};
    const [bridgesRes,liveRes]=await Promise.all([
      jsonFetch(base+'/rest/v1/gold_live_market_bridges?select=created_at,last_used_at,use_count,revoked_at,mode&order=created_at.desc',{headers}),
      jsonFetch(base+'/rest/v1/rpc/get_v186_gold_live_market_status',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'})
    ]);
    if(!bridgesRes.r.ok||!Array.isArray(bridgesRes.body)||!liveRes.r.ok||liveRes.body?.ok!==true)throw new Error('v195_upstream_unavailable');
    const body=buildGoldBridgeReadiness({now:new Date(),bridges:bridgesRes.body,live:liveRes.body});
    return Response.json(body,{headers:{...CORS,'Cache-Control':'public, max-age=2, s-maxage=5, stale-while-revalidate=10'}});
  }catch(error){
    console.error(error);
    return Response.json({ok:false,version:'v195-gold-bridge-readiness-v1',state:'UNAVAILABLE',
      governance:{market_data_only:true,commissioning_not_trade_permission:true,automatic_execution:false,machine_execution_allowed:false,live_order_submission_enabled:false,action_permitted:'WAIT',capital_permission:'0R'}},
      {status:503,headers:{...CORS,'Cache-Control':'no-store'}});
  }
});
