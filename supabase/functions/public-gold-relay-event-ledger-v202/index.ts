import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type, apikey','Access-Control-Allow-Methods':'GET, OPTIONS'};
const VERSION='v202-gold-relay-event-ledger-public-v1';
const RELAY='https://thefatheranalytics.com/api/gold-relay-observability-v199';

function serverKey(){
  const bundle=Deno.env.get('SUPABASE_SECRET_KEYS');
  if(bundle){try{const p=JSON.parse(bundle);if(p?.default)return p.default}catch{}}
  const legacy=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!legacy)throw new Error('server_key_unavailable');
  return legacy;
}
function svcHeaders(key:string){
  const h:any={apikey:key,Accept:'application/json'};
  if(key.startsWith('ey'))h.Authorization=`Bearer ${key}`;
  return h;
}
async function rpc(base:string,key:string,name:string,args:any){
  const r=await fetch(base+'/rest/v1/rpc/'+name,{
    method:'POST',
    headers:{...svcHeaders(key),'Content-Type':'application/json'},
    body:JSON.stringify(args),
    cache:'no-store',
    signal:AbortSignal.timeout(8000)
  });
  const body=await r.json().catch(()=>null);
  if(!r.ok||!body)throw new Error(name+'_'+r.status);
  return body;
}
function sanitized(relay:any){
  return{
    state:String(relay?.state||'UNAVAILABLE'),
    next_step_code:String(relay?.next_step_code||'UNKNOWN'),
    bridge_enrolled:relay?.bridge?.enrolled===true,
    authentication_reached:relay?.bridge?.authentication_reached===true,
    first_tick_seen:relay?.relay?.first_tick_seen===true,
    sustained_stream:relay?.relay?.streaming===true,
    authenticated_requests:Number.isFinite(Number(relay?.bridge?.total_authenticated_requests))?Math.max(0,Number(relay.bridge.total_authenticated_requests)):0,
    accepted_ticks:Number.isFinite(Number(relay?.relay?.accepted_ticks_examined))?Math.max(0,Number(relay.relay.accepted_ticks_examined)):0,
    latest_tick_age_seconds:Number.isFinite(Number(relay?.relay?.latest_tick_age_seconds))?Math.max(0,Math.round(Number(relay.relay.latest_tick_age_seconds))):null,
    source_version:String(relay?.version||'v199-gold-relay-observability-v1'),
    action_permitted:'WAIT',
    capital_permission:'0R',
    automatic_execution:false,
    live_order_submission_enabled:false
  };
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});
  if(req.method!=='GET')return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers:{...CORS,Allow:'GET'}});
  try{
    const base=Deno.env.get('SUPABASE_URL')||'https://mpcelmjiycjpdyyflisn.supabase.co',key=serverKey();
    let relay:any=null,capture:any={ok:false,state:'RELAY_OBSERVABILITY_UNAVAILABLE',inserted:false};
    try{
      const r=await fetch(RELAY,{headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-V202/1.0'},cache:'no-store',signal:AbortSignal.timeout(8000)});
      const body=await r.json().catch(()=>null);
      if(r.ok&&body?.ok===true){
        relay=body;
        capture=await rpc(base,key,'capture_v202_gold_relay_event',{p_event:sanitized(body)});
      }
    }catch(error){console.error('v202_capture',error);}

    const ledger=await rpc(base,key,'get_v202_gold_relay_event_ledger',{p_limit:40});
    if(ledger?.ok!==true)throw new Error('ledger_unavailable');

    return Response.json({
      ...ledger,
      public_version:VERSION,
      capture:{
        ok:capture?.ok===true,
        state:capture?.state??'RELAY_OBSERVABILITY_UNAVAILABLE',
        inserted:capture?.inserted===true,
        event_id:capture?.event_id??null
      },
      current_relay:relay?{
        state:relay?.state??'UNAVAILABLE',
        next_step_code:relay?.next_step_code??'UNKNOWN',
        authentication_reached:relay?.bridge?.authentication_reached===true,
        first_tick_seen:relay?.relay?.first_tick_seen===true,
        streaming:relay?.relay?.streaming===true
      }:null,
      privacy:{bridge_ids_public:false,bridge_keys_public:false,tick_sequences_public:false,account_numbers_public:false}
    },{headers:{...CORS,'Cache-Control':'public, max-age=3, s-maxage=5, stale-while-revalidate=10'}});
  }catch(error){
    console.error(error);
    return Response.json({ok:false,version:VERSION,state:'UNAVAILABLE',
      governance:{append_only:true,hash_chained:true,action_permitted:'WAIT',capital_permission:'0R',automatic_execution:false,live_order_submission_enabled:false}},
      {status:503,headers:{...CORS,'Cache-Control':'no-store'}});
  }
});
