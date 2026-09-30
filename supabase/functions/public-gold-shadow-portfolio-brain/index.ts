import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type, apikey",
  "Access-Control-Allow-Methods":"GET, OPTIONS"
};
const VERSION="v133-gold-shadow-portfolio-brain-v1";
const POLICY="v133-one-slot-first-eligible-v1";
const TTL=15_000;
let cache:any=null,cachedAt=0,inflight:Promise<any>|null=null;

function secretKey(){
  const b=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(b){try{const p=JSON.parse(b);if(p?.default)return p.default}catch{}}
  const k=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!k)throw new Error("server_key_unavailable");
  return k;
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
const n=(v:any)=>{const x=Number(v);return Number.isFinite(x)?x:null};
const round=(v:any,d=3)=>{const x=n(v);return x==null?null:Number(x.toFixed(d))};

async function build(){
  const base=Deno.env.get("SUPABASE_URL")||"https://mpcelmjiycjpdyyflisn.supabase.co";
  const key=secretKey();

  const [decisions,outcomes,intents,snapshots]=await Promise.all([
    rows(base,key,`gold_shadow_portfolio_decisions?select=id,intent_id,transition_id,policy_version,policy_mode,decision,decision_reason,side,source_market_time,source_price,reference_rr,max_concurrent_positions,shadow_risk_budget_r,allocated_risk_r,conflicting_open_intent_id,future_performance_used,reviewer_signal_used,live_order_eligible,live_trading_enabled,broker_adapter_state&policy_version=eq.${POLICY}&order=source_market_time.asc&limit=1000`),
    rows(base,key,"gold_shadow_portfolio_outcomes?select=id,decision_id,intent_id,shadow_outcome_id,resolved_market_time,resolution_code,allocated_risk_r,gross_trade_r,portfolio_gross_r,cost_model_state,portfolio_net_r&order=id.asc&limit=1000"),
    rows(base,key,"gold_shadow_trade_intents?select=id,transition_id,strategy_code,side,source_market_time,source_price,stop_price,target_price,risk_points,reference_rr&order=id.asc&limit=1000"),
    rows(base,key,"gold_live_desk_snapshots?select=id,market_time,futures_price,market_status,desk_state,system_action,system_capital_permission&order=id.desc&limit=1")
  ]);

  const latest=snapshots[0]||null;
  const latestPrice=n(latest?.futures_price);
  const outcomeByDecision=new Map<number,any>();
  for(const x of outcomes)outcomeByDecision.set(Number(x.decision_id),x);
  const intentById=new Map<number,any>();
  for(const x of intents)intentById.set(Number(x.id),x);

  const allocated=decisions.filter((x:any)=>x.decision==="ALLOCATE");
  const skipped=decisions.filter((x:any)=>x.decision==="SKIP");
  const openAllocated=allocated.filter((x:any)=>!outcomeByDecision.has(Number(x.id)));
  const resolvedAllocated=allocated.filter((x:any)=>outcomeByDecision.has(Number(x.id)));

  const openPositions=openAllocated.map((d:any)=>{
    const i=intentById.get(Number(d.intent_id))||{};
    const entry=n(i.source_price),risk=n(i.risk_points);
    let points=null,grossR=null;
    if(latestPrice!=null&&entry!=null&&risk!=null&&risk>0){
      points=i.side==="LONG"?latestPrice-entry:entry-latestPrice;
      grossR=points/risk;
    }
    return {
      decision_id:d.id,
      intent_id:d.intent_id,
      transition_id:d.transition_id,
      strategy_code:i.strategy_code??null,
      side:d.side,
      allocated_risk_r:round(d.allocated_risk_r,2),
      entry_price:round(entry,2),
      latest_delayed_mark:round(latestPrice,2),
      unrealized_gross_points:round(points,3),
      unrealized_portfolio_r:round(grossR==null?null:grossR*n(d.allocated_risk_r),3),
      stop_price:round(i.stop_price,2),
      target_price:round(i.target_price,2),
      reference_rr:round(d.reference_rr,3),
      executable_quote:false
    };
  });

  const resolvedRows=resolvedAllocated.map((d:any)=>{
    const o=outcomeByDecision.get(Number(d.id));
    return {
      decision_id:d.id,
      intent_id:d.intent_id,
      side:d.side,
      resolution_code:o?.resolution_code??null,
      resolved_market_time:o?.resolved_market_time??null,
      portfolio_gross_r:round(o?.portfolio_gross_r,3),
      cost_model_state:o?.cost_model_state??"UNAVAILABLE",
      portfolio_net_r:o?.portfolio_net_r==null?null:round(o.portfolio_net_r,3)
    };
  });

  const resolvedN=resolvedRows.length;
  const publish=resolvedN>=10;
  const rs=resolvedRows.map((x:any)=>n(x.portfolio_gross_r)).filter((x:any)=>x!=null);
  const cumulative=rs.reduce((a:number,b:number)=>a+b,0);
  const positive=rs.filter((x:any)=>x>0).length;

  let state="COLLECTING";
  if(decisions.length===0)state="WAITING_FOR_SHADOW_INTENTS";
  else if(openAllocated.length>0&&resolvedN===0)state="SHADOW_SLOT_ALLOCATED";
  else if(resolvedN<10)state="WITHHELD_SAMPLE_TOO_SMALL";
  else if(resolvedN<30)state="EARLY_PORTFOLIO_EVIDENCE";
  else state="MATURE_PORTFOLIO_EVIDENCE";

  return {
    ok:true,
    version:VERSION,
    generated_at:new Date().toISOString(),
    state,
    policy:{
      version:POLICY,
      mode:"ONE_SLOT_FIRST_ELIGIBLE",
      max_concurrent_positions:1,
      shadow_risk_budget_r:1,
      selection_rule:"FIRST_ELIGIBLE_LEVEL_EVENT_WHEN_SLOT_FREE",
      pyramiding:false,
      simultaneous_long_short:false,
      future_performance_used:false,
      reviewer_signal_used:false,
      optimization_used:false
    },
    pipeline:{
      total_decisions:decisions.length,
      allocated:allocated.length,
      skipped_overlap:skipped.length,
      open_allocations:openAllocated.length,
      resolved_allocations:resolvedN,
      minimum_public_sample:10
    },
    market:{
      latest_delayed_price:round(latestPrice,2),
      market_time:latest?.market_time??null,
      market_status:latest?.market_status??"UNKNOWN",
      desk_state:latest?.desk_state??"UNKNOWN",
      system_action:latest?.system_action??"WAIT",
      system_capital_permission:latest?.system_capital_permission??"0R"
    },
    performance:{
      statistics_withheld:!publish,
      reason:publish?null:"RESOLVED_PORTFOLIO_SAMPLE_BELOW_10",
      public_statistics:publish?{
        resolved_allocations:resolvedN,
        positive_gross_r_count:positive,
        gross_positive_rate_pct:round((positive/resolvedN)*100,2),
        cumulative_gross_r:round(cumulative,3),
        average_gross_r:round(cumulative/resolvedN,3)
      }:null,
      cost_adjusted_statistics_available:false,
      realized_money_pnl_claimed:false
    },
    open_positions:openPositions,
    recent_resolved:resolvedRows.slice(-8).reverse(),
    methodology:{
      derives_only_from_v132_shadow_intents:true,
      event_time_ordered:true,
      one_position_slot:true,
      skipped_overlaps_are_not_counted_as_portfolio_trades:true,
      delayed_reference_not_execution_quote:true,
      broker_spread_measured:false,
      slippage_measured:false,
      cost_adjusted_r_available:false,
      no_future_performance_selection:true
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
        shadow_only:true,live_trading_enabled:false,live_order_eligible:false,
        order_submission_enabled:false,broker_adapter_state:"NOT_CONNECTED",
        automatic_real_capital:false,real_capital_permission:"0R"
      }
    },{status:503,headers:{...CORS,"Cache-Control":"no-store"}});
  }
});