import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {buildGoldFeedQuality} from './builder.mjs';
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type, apikey','Access-Control-Allow-Methods':'GET, OPTIONS'};
function serverKey(){
  const bundle=Deno.env.get('SUPABASE_SECRET_KEYS');
  if(bundle){try{const p=JSON.parse(bundle);if(p?.default)return p.default}catch{}}
  const k=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';if(!k)throw new Error('server_key_unavailable');return k;
}
async function getJson(url,headers){
  const r=await fetch(url,{headers,cache:'no-store',signal:AbortSignal.timeout(7000)});
  return{r,body:await r.json().catch(()=>null)};
}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});
  if(req.method!=='GET')return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers:{...CORS,Allow:'GET'}});
  try{
    const base=Deno.env.get('SUPABASE_URL')||'https://mpcelmjiycjpdyyflisn.supabase.co',key=serverKey();
    const auth=key.startsWith('ey')?{Authorization:`Bearer ${key}`}:{};
    const headers={apikey:key,Accept:'application/json',...auth};
    const bridges=await getJson(base+'/rest/v1/gold_live_market_bridges?select=id,created_at,revoked_at&revoked_at=is.null&order=created_at.desc&limit=1',headers);
    if(!bridges.r.ok||!Array.isArray(bridges.body))throw new Error('bridge_lookup_failed');
    const active=bridges.body[0]??null;
    let ticks=[];
    if(active?.id){
      const fields='received_at,observed_at,sequence,trade_mode,bid,ask,terminal_connected,relay_version,mt5_package_version,os_family,spread_usd';
      const out=await getJson(base+`/rest/v1/gold_live_xauusd_ticks?select=${fields}&bridge_id=eq.${encodeURIComponent(active.id)}&order=received_at.desc&limit=120`,headers);
      if(!out.r.ok||!Array.isArray(out.body))throw new Error('tick_lookup_failed');
      ticks=out.body;
    }
    const body=buildGoldFeedQuality({now:new Date(),ticks});
    return Response.json(body,{headers:{...CORS,'Cache-Control':'public, max-age=1, s-maxage=3, stale-while-revalidate=5'}});
  }catch(error){
    console.error(error);
    return Response.json({ok:false,version:'v196-gold-feed-quality-v1',state:'UNAVAILABLE',
      governance:{quality_score_not_probability:true,probation_required:true,market_data_only:true,feed_quality_cannot_grant_trade_permission:true,automatic_execution:false,machine_execution_allowed:false,live_order_submission_enabled:false,action_permitted:'WAIT',capital_permission:'0R'}},
      {status:503,headers:{...CORS,'Cache-Control':'no-store'}});
  }
});
