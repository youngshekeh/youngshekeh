import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type, apikey",
  "Access-Control-Allow-Methods":"GET, OPTIONS"
};
const VERSION="v132-gold-autonomous-shadow-trader-v1";
const TTL=15_000;
let cache:any=null,cachedAt=0,inflight:Promise<any>|null=null;

function secretKey(){
  const bundle=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(bundle){try{const p=JSON.parse(bundle);if(p?.default)return p.default}catch{}}
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!legacy)throw new Error("server_key_unavailable");
  return legacy;
}
async function rows(base:string,key:string,path:string){
  const r=await fetch(base+"/rest/v1/"+path,{
    headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:"application/json"},
    cache:"no-store",
    signal:AbortSignal.timeout(5000)
  });
  if(!r.ok)throw new Error(`postgrest_${r.status}`);
  const body=await r.json();
  return Array.isArray(body)?body:[];
}
const num=(v:any)=>{const n=Number(v);return Number.isFinite(n)?n:null};
const round=(v:any,d=3)=>{const n=num(v);return n==null?null:Number(n.toFixed(d))};

async function build(){
  const base=Deno.env.get("SUPABASE_URL")||"https://mpcelmjiycjpdyyflisn.supabase.co";
  const key=secretKey();

  const [intents,outcomes,snapshots]=await Promise.all([
    rows(base,key,"gold_shadow_trade_intents?select=id,created_at,transition_id,source_snapshot_id,strategy_code,side,source_market_time,source_price,stop_price,target_price,extension_target_price,risk_points,reward_points,reference_rr,market_status,session_state,daily_bias,daily_structure,desk_state,entry_basis,simulation_mode,live_order_eligible,live_trading_enabled,broker_adapter_state&order=id.asc&limit=1000"),
    rows(base,key,"gold_shadow_trade_outcomes?select=id,intent_id,resolved_at,resolution_code,resolved_market_time,entry_price,exit_price,gross_pnl_points,gross_r,mfe_points,mae_points,elapsed_minutes,observed_primary_target,observed_stop,cost_model_state,net_r&order=id.asc&limit=1000"),
    rows(base,key,"gold_live_desk_snapshots?select=id,captured_at,market_time,futures_price,market_status,desk_state,system_action,system_capital_permission&order=id.desc&limit=1")
  ]);

  const latest=snapshots[0]||null;
  const outcomeByIntent=new Map<number,any>();
  for(const o of outcomes)outcomeByIntent.set(Number(o.intent_id),o);

  const open=intents.filter((i:any)=>!outcomeByIntent.has(Number(i.id)));
  const resolved=intents.filter((i:any)=>outcomeByIntent.has(Number(i.id)));
  const latestPrice=num(latest?.futures_price);

  const openMarks=open.map((i:any)=>{
    const entry=num(i.source_price),risk=num(i.risk_points);
    let points=null,r=null;
    if(latestPrice!=null&&entry!=null&&risk!=null&&risk>0){
      points=i.side==="LONG"?latestPrice-entry:entry-latestPrice;
      r=points/risk;
    }
    return {
      intent_id:i.id,
      transition_id:i.transition_id,
      strategy_code:i.strategy_code,
      side:i.side,
      source_market_time:i.source_market_time,
      entry_price:round(entry,2),
      current_delayed_mark:round(latestPrice,2),
      unrealized_gross_points:round(points,3),
      unrealized_gross_r:round(r,3),
      stop_price:round(i.stop_price,2),
      target_price:round(i.target_price,2),
      reference_rr:round(i.reference_rr,3),
      mark_basis:"LATEST_DELAYED_COMEX_REFERENCE",
      executable_quote:false
    };
  });

  const resolvedRows=resolved.map((i:any)=>{
    const o=outcomeByIntent.get(Number(i.id));
    return {
      intent_id:i.id,
      transition_id:i.transition_id,
      strategy_code:i.strategy_code,
      side:i.side,
      entry_price:round(i.source_price,2),
      stop_price:round(i.stop_price,2),
      target_price:round(i.target_price,2),
      resolution_code:o?.resolution_code,
      exit_price:round(o?.exit_price,2),
      gross_pnl_points:round(o?.gross_pnl_points,3),
      gross_r:round(o?.gross_r,3),
      mfe_points:round(o?.mfe_points,3),
      mae_points:round(o?.mae_points,3),
      elapsed_minutes:round(o?.elapsed_minutes,1),
      cost_model_state:o?.cost_model_state??"UNAVAILABLE",
      net_r:o?.net_r==null?null:round(o.net_r,3)
    };
  });

  const resolvedN=resolvedRows.length;
  const publicStats=resolvedN>=10;
  const grossRs=resolvedRows.map((x:any)=>num(x.gross_r)).filter((x:any)=>x!=null);
  const winners=grossRs.filter((x:any)=>x>0).length;
  const avgR=grossRs.length?grossRs.reduce((a:number,b:number)=>a+b,0)/grossRs.length:null;

  let state="COLLECTING";
  if(intents.length===0)state="WAITING_FOR_TRIGGER_EVENTS";
  else if(open.length>0&&resolvedN===0)state="SHADOW_POSITIONS_OPEN";
  else if(resolvedN<10)state="WITHHELD_SAMPLE_TOO_SMALL";
  else if(resolvedN<30)state="EARLY_SHADOW_EVIDENCE";
  else state="MATURE_SHADOW_EVIDENCE";

  return {
    ok:true,
    version:VERSION,
    generated_at:new Date().toISOString(),
    state,
    market:{
      latest_delayed_price:round(latestPrice,2),
      market_time:latest?.market_time??null,
      market_status:latest?.market_status??"UNKNOWN",
      desk_state:latest?.desk_state??"UNKNOWN",
      system_action:latest?.system_action??"WAIT",
      system_capital_permission:latest?.system_capital_permission??"0R"
    },
    pipeline:{
      total_shadow_intents:intents.length,
      open_shadow_intents:open.length,
      resolved_shadow_outcomes:resolvedN,
      minimum_public_sample:10
    },
    performance:{
      statistics_withheld:!publicStats,
      reason:publicStats?null:"RESOLVED_SAMPLE_BELOW_10",
      public_statistics:publicStats?{
        resolved_count:resolvedN,
        positive_gross_r_count:winners,
        gross_positive_rate_pct:round((winners/resolvedN)*100,2),
        average_gross_r:round(avgR,3)
      }:null,
      cost_adjusted_statistics_available:false,
      trade_pnl_claimed:false
    },
    open_marks:openMarks.slice(-8).reverse(),
    recent_resolved:resolvedRows.slice(-8).reverse(),
    methodology:{
      autonomous_event_capture:true,
      event_study_independent_trades:true,
      triggers:[
        "LONG_RETEST_ZONE_ENTERED",
        "SHORT_FAILURE_THRESHOLD_BREACHED"
      ],
      entry_basis:"DELAYED_COMEX_REFERENCE",
      primary_exit_rule:"FIRST_OBSERVED_PRIMARY_TARGET_OR_STOP_OR_120M_TIMEOUT",
      snapshot_observed:true,
      intrabar_sequence_inferred:false,
      broker_spread_measured:false,
      slippage_measured:false,
      cost_adjusted_r_available:false,
      delayed_reference_not_execution_quote:true
    },
    governance:{
      shadow_only:true,
      live_trading_enabled:false,
      live_order_eligible:false,
      order_submission_enabled:false,
      broker_adapter_state:"NOT_CONNECTED",
      automatic_real_capital:false,
      real_capital_permission:"0R"
    }
  };
}
async function current(){
  if(cache&&Date.now()-cachedAt<TTL)return cache;
  if(inflight)return inflight;
  inflight=build().then(x=>{cache=x;cachedAt=Date.now();return x}).finally(()=>{inflight=null});
  return inflight;
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="GET")return Response.json({ok:false,error:"method_not_allowed"},{status:405,headers:CORS});
  try{
    return Response.json(await current(),{
      headers:{...CORS,"Cache-Control":"public, max-age=5, s-maxage=15, stale-while-revalidate=20"}
    });
  }catch(error){
    console.error(error);
    return Response.json({
      ok:false,version:VERSION,state:"UNAVAILABLE",
      governance:{
        shadow_only:true,
        live_trading_enabled:false,
        live_order_eligible:false,
        order_submission_enabled:false,
        broker_adapter_state:"NOT_CONNECTED",
        automatic_real_capital:false,
        real_capital_permission:"0R"
      }
    },{status:503,headers:{...CORS,"Cache-Control":"no-store"}});
  }
});