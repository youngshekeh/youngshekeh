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
    return Response.json(body,{headers:{...CORS,'Cache-Control':'no-store'}});
  }catch(error){
    console.error(error);
    return Response.json({ok:false,version:'v195-gold-bridge-readiness-v1',state:'UNAVAILABLE',
      governance:{market_data_only:true,commissioning_not_trade_permission:true,automatic_execution:false,machine_execution_allowed:false,live_order_submission_enabled:false,action_permitted:'WAIT',capital_permission:'0R'}},
      {status:503,headers:{...CORS,'Cache-Control':'no-store'}});
  }
});

const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
const age=(now,v)=>{const t=Date.parse(String(v||''));return Number.isFinite(t)?Math.max(0,Math.round((now.getTime()-t)/1000)):null};

export function buildGoldBridgeReadiness({now=new Date(),bridges=[],live={}}={}){
  const rows=Array.isArray(bridges)?bridges:[];
  const active=rows.filter(x=>x?.revoked_at==null);
  const used=active.filter(x=>n(x?.use_count)>0||x?.last_used_at);
  const latestUsed=used.map(x=>x?.last_used_at).filter(Boolean).sort().at(-1)??null;
  const lastActivityAge=age(now,latestUsed);
  const liveFresh=live?.ok===true&&live?.state==='BROKER_LIVE'&&live?.quality?.fresh===true&&
    typeof live?.quote?.mid==='number'&&Number.isFinite(live.quote.mid)&&live.quote.mid>0;
  // Credential authentication increments bridge.use_count BEFORE tick validation.
  // Only a real, persisted quote from get_v186_gold_live_market_status
  // can prove first-tick arrival. Authentication is a separate milestone.
  const firstTickSeen=!!live?.quote?.observed_at&&
    live?.source?.connected===true&&
    Number.isFinite(Date.parse(String(live.quote.observed_at)));
  const liveConnected=firstTickSeen&&(live?.source?.connected===true||live?.state==='BROKER_LIVE');
  const enrolled=active.length>0;

  let state='NO_BRIDGE_ENROLLED';
  let next='ENROLL_OWNER_AAL2_BRIDGE';
  if(enrolled&&!firstTickSeen){state='BRIDGE_ENROLLED_WAITING_FIRST_TICK';next='RUN_MT5_RELAY_ON_WINDOWS';}
  else if(firstTickSeen&&!liveFresh){state=liveConnected?'BROKER_QUOTE_STALE':'BRIDGE_ACTIVITY_WITHOUT_FRESH_QUOTE';next='RESTORE_FRESH_MT5_TICKS';}
  else if(liveFresh){state='BROKER_LIVE';next='VERIFY_BROKER_DATA_DISPLAY_RIGHTS';}

  const gates={
    bridge_enrolled:{pass:enrolled,count:active.length},
    bridge_authenticated:{pass:used.length>0,last_activity_at:latestUsed,activity_age_seconds:lastActivityAge},
    first_tick_received:{pass:firstTickSeen,observed_at:firstTickSeen?live.quote.observed_at:null,proof:'PERSISTED_TICK_NOT_CREDENTIAL_USE'},
    broker_intake_endpoint:'https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/broker-live-market-intake',
    quote_fresh:{pass:liveFresh,quote_age_seconds:n(live?.quote?.age_seconds)??n(live?.quality?.quote_age_seconds)},
    broker_live:{pass:liveFresh&&liveConnected}
  };

  return {
    ok:true,
    version:'v326-gold-bridge-first-tick-truth-review',
    generated_at:now.toISOString(),
    symbol:'XAUUSD',
    state,
    gates,
    next_step_code:next,
    public_counts:{active_bridges:active.length,bridges_with_activity:used.length},
    diagnostic:{first_tick_counted_from:'PERSISTED_RECEIVER_QUOTE_ONLY',bridge_key_authentication_is_not_tick:true,actual_mt5_relay_tested:false,quote_redistribution_license_verified:false},
    live_market:{
      state:live?.state??'UNAVAILABLE',
      connected:liveConnected,
      fresh:liveFresh,
      trade_mode:liveFresh?(live?.quote?.trade_mode??live?.trade_mode??null):null,
      // Market data rights are not verified. A public commissioning status
      // must not redistribute actual broker quote prices by default.
      mid:null
    },
    privacy:{
      bridge_ids_public:false,
      bridge_keys_public:false,
      owner_identity_public:false,
      account_number_public:false
    },
    governance:{
      market_data_only:true,
      commissioning_not_trade_permission:true,
      automatic_execution:false,
      machine_execution_allowed:false,
      live_order_submission_enabled:false,
      action_permitted:'WAIT',
      capital_permission:'0R'
    }
  };
}
