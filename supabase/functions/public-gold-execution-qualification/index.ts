import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type, apikey",
  "Access-Control-Allow-Methods":"GET, OPTIONS"
};
const VERSION="v136-gold-execution-qualification-firewall-v1";
const TTL=15_000;
let cache:any=null,cachedAt=0,inflight:Promise<any>|null=null;

function secretKey(){
  const bundle=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(bundle){
    try{
      const parsed=JSON.parse(bundle);
      if(parsed?.default)return parsed.default;
    }catch{}
  }
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

async function build(){
  const base=Deno.env.get("SUPABASE_URL")||"https://mpcelmjiycjpdyyflisn.supabase.co";
  const key=secretKey();
  const snapshots=await rows(
    base,key,
    "gold_execution_qualification_snapshots?select=id,evaluated_at,qualification_version,portfolio_decision_id,intent_id,strategy_code,side,source_market_time,reference_entry,stop_price,target_price,risk_points,reference_rr,requested_paper_r,dry_run_client_order_id,risk_geometry_valid,resolved_research_sample,mature_sample_required,mature_research_sample,adapter_lab_pass,adapter_real_orders_sent,production_broker_verified,real_broker_connected,live_order_route_present,execution_grade_quote_available,broker_spread_measured,slippage_measured,human_release_review_complete,dry_run_order_ready,live_order_qualified,live_order_submission_enabled,real_order_sent,real_capital_permission,blocker_codes,qualification_state&order=id.desc&limit=1"
  );
  const q=snapshots[0]||null;

  if(!q){
    return {
      ok:true,version:VERSION,generated_at:new Date().toISOString(),
      state:"WAITING_FOR_QUALIFICATION_SNAPSHOT",dry_run_order:null,
      qualification:{dry_run_order_ready:false,live_order_qualified:false,blocker_count:0,blocker_codes:[]},
      governance:{live_trading_enabled:false,live_order_eligible:false,order_submission_enabled:false,
        real_order_sent:false,broker_adapter_state:"NOT_CONNECTED",automatic_real_capital:false,
        real_capital_permission:"0R"}
    };
  }

  const blockers=Array.isArray(q.blocker_codes)?q.blocker_codes:[];
  const hardGates=[
    {code:"RISK_GEOMETRY",label:"Risk geometry",passed:q.risk_geometry_valid===true,scope:"DRY_RUN"},
    {code:"ADAPTER_SIMULATION",label:"Adapter simulation",passed:q.adapter_lab_pass===true,scope:"DRY_RUN"},
    {code:"MATURE_SAMPLE",label:"Research sample ≥ 30",passed:q.mature_research_sample===true,scope:"LIVE"},
    {code:"PRODUCTION_BROKER",label:"Production broker verified",passed:q.production_broker_verified===true,scope:"LIVE"},
    {code:"REAL_BROKER_CONNECTION",label:"Real broker connected",passed:q.real_broker_connected===true,scope:"LIVE"},
    {code:"LIVE_ROUTE",label:"Live order route",passed:q.live_order_route_present===true,scope:"LIVE"},
    {code:"EXECUTION_QUOTE",label:"Execution-grade quote",passed:q.execution_grade_quote_available===true,scope:"LIVE"},
    {code:"SPREAD",label:"Measured spread",passed:q.broker_spread_measured===true,scope:"LIVE"},
    {code:"SLIPPAGE",label:"Measured slippage",passed:q.slippage_measured===true,scope:"LIVE"},
    {code:"HUMAN_RELEASE",label:"Human release review",passed:q.human_release_review_complete===true,scope:"LIVE"}
  ];

  return {
    ok:true,version:VERSION,generated_at:new Date().toISOString(),state:q.qualification_state,
    snapshot_id:Number(q.id),
    dry_run_order:{
      client_order_id:q.dry_run_client_order_id,
      portfolio_decision_id:Number(q.portfolio_decision_id),
      intent_id:Number(q.intent_id),
      strategy_code:q.strategy_code,side:q.side,source_market_time:q.source_market_time,
      reference_entry:Number(q.reference_entry),stop_price:Number(q.stop_price),
      target_price:Number(q.target_price),risk_points:Number(q.risk_points),
      reference_rr:Number(q.reference_rr),requested_paper_r:Number(q.requested_paper_r),
      executable_quote:false,broker_order_id:null,route:"DRY_RUN_ONLY"
    },
    qualification:{
      dry_run_order_ready:q.dry_run_order_ready===true,
      live_order_qualified:q.live_order_qualified===true,
      blocker_count:blockers.length,blocker_codes:blockers,
      resolved_research_sample:Number(q.resolved_research_sample||0),
      mature_sample_required:Number(q.mature_sample_required||30),
      hard_gates:hardGates
    },
    safety:{
      adapter_real_orders_sent:Number(q.adapter_real_orders_sent||0),
      live_order_submission_enabled:q.live_order_submission_enabled===true,
      real_order_sent:q.real_order_sent===true,
      production_broker_verified:q.production_broker_verified===true,
      real_broker_connected:q.real_broker_connected===true,
      live_order_route_present:q.live_order_route_present===true
    },
    methodology:{
      reference_entry_is_historical_shadow_intent:true,
      reference_entry_is_not_executable_quote:true,
      dry_run_order_is_not_broker_order:true,
      simulated_adapter_pass_is_not_production_broker_verification:true,
      no_real_fill_claimed:true,no_real_money_pnl_claimed:true
    },
    governance:{
      live_trading_enabled:false,live_order_eligible:false,order_submission_enabled:false,
      real_order_sent:false,broker_adapter_state:"NOT_CONNECTED",automatic_real_capital:false,
      human_control_required_for_any_future_live_release:true,real_capital_permission:"0R"
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
      ok:false,version:VERSION,state:"FAIL_CLOSED",
      qualification:{dry_run_order_ready:false,live_order_qualified:false,blocker_count:null,blocker_codes:[]},
      governance:{live_trading_enabled:false,live_order_eligible:false,order_submission_enabled:false,
        real_order_sent:false,broker_adapter_state:"NOT_CONNECTED",automatic_real_capital:false,
        human_control_required_for_any_future_live_release:true,real_capital_permission:"0R"}
    },{status:503,headers:{...CORS,"Cache-Control":"no-store"}});
  }
});