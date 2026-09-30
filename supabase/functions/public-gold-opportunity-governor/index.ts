import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type, apikey",
  "Access-Control-Allow-Methods":"GET, OPTIONS"
};
const VERSION="v135-gold-opportunity-governor-v1";
const BASE="https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1";
const TTL=15_000;
let cache:any=null,cachedAt=0,inflight:Promise<any>|null=null;

async function get(name:string){
  const r=await fetch(`${BASE}/${name}`,{
    headers:{Accept:"application/json","User-Agent":"THE-FATHER-ANALYTICS/135.0"},
    cache:"no-store",
    signal:AbortSignal.timeout(9000)
  });
  const body=await r.json().catch(()=>null);
  if(!r.ok||!body?.ok)throw new Error(`${name}_unavailable`);
  return body;
}
function n(v:any){const x=Number(v);return Number.isFinite(x)?x:null}
async function build(){
  const started=Date.now();
  const [portfolio,reality,lab]=await Promise.all([
    get("public-gold-shadow-portfolio-brain"),
    get("public-gold-execution-reality"),
    get("public-gold-broker-adapter-lab")
  ]);

  const pipeline=portfolio?.pipeline??{};
  const open=Array.isArray(portfolio?.open_positions)?portfolio.open_positions:[];
  const current=open[0]||null;
  const gate=reality?.execution_gate??{};
  const research=reality?.research??{};
  const labState=lab?.lab??{};
  const boundary=lab?.production_boundary??{};

  const resolvedSample=Number(research?.resolved_sample||0);
  const matureFloor=Number(research?.mature_research_sample||30);
  const blockerCount=Number(gate?.blocker_count||0);
  const infraPassed=Number(gate?.infrastructure_passed||0);
  const infraTotal=Number(gate?.infrastructure_total||6);
  const labPassed=Number(labState?.tests_passed||0);
  const labTotal=Number(labState?.tests_total||6);

  const shadowHealthy=
    portfolio?.governance?.shadow_only===true &&
    portfolio?.governance?.live_trading_enabled===false &&
    portfolio?.governance?.order_submission_enabled===false &&
    portfolio?.governance?.real_capital_permission==="0R";

  const labSafe=
    lab?.state==="PASS_SIMULATION_ONLY" &&
    labPassed===labTotal &&
    Number(labState?.real_orders_sent||0)===0 &&
    boundary?.real_broker_connected===false &&
    boundary?.live_order_route_present===false &&
    boundary?.live_order_submission_enabled===false;

  const executionLocked=
    reality?.governance?.live_trading_enabled===false &&
    reality?.governance?.order_submission_enabled===false &&
    reality?.governance?.real_capital_permission==="0R";

  const paperPermission=shadowHealthy&&labSafe&&executionLocked;
  let paperAction="PAPER_LOCKED";
  if(paperPermission&&current)paperAction="PAPER_HOLD_ACTIVE_SLOT";
  else if(paperPermission&&!current)paperAction="PAPER_WAIT_NEXT_ELIGIBLE_EVENT";

  const productionPrereqs={
    mature_research_sample:resolvedSample>=matureFloor,
    execution_blockers_zero:blockerCount===0,
    all_infrastructure_verified:infraTotal>0&&infraPassed===infraTotal,
    production_broker_verified:boundary?.production_broker_readiness==="VERIFIED",
    real_broker_connected:boundary?.real_broker_connected===true,
    live_order_route_present:boundary?.live_order_route_present===true,
    execution_grade_quote_available:false,
    measured_spread_available:false,
    measured_slippage_available:false,
    human_release_review_complete:false
  };
  const productionReady=Object.values(productionPrereqs).every(Boolean);

  const blockerCodes=[
    ...(Array.isArray(gate?.blocker_codes)?gate.blocker_codes:[]),
    ...(!productionPrereqs.production_broker_verified?["PRODUCTION_BROKER_NOT_VERIFIED"]:[]),
    ...(!productionPrereqs.execution_grade_quote_available?["EXECUTION_GRADE_QUOTE_UNAVAILABLE"]:[]),
    ...(!productionPrereqs.measured_spread_available?["MEASURED_SPREAD_UNAVAILABLE"]:[]),
    ...(!productionPrereqs.measured_slippage_available?["MEASURED_SLIPPAGE_UNAVAILABLE"]:[]),
    ...(!productionPrereqs.human_release_review_complete?["HUMAN_RELEASE_REVIEW_REQUIRED"]:[])
  ].filter((x,i,a)=>a.indexOf(x)===i);

  const state=!paperPermission
    ?"FAIL_CLOSED"
    :current
      ?"PAPER_SLOT_ACTIVE"
      :"PAPER_AUTONOMY_READY";

  return {
    ok:true,
    version:VERSION,
    generated_at:new Date().toISOString(),
    state,
    decision:{
      autonomous_mode:paperPermission?"PAPER_ONLY":"LOCKED",
      paper_action:paperAction,
      manual_live_review_eligible:productionReady,
      live_action:"LOCKED",
      reason:productionReady
        ?"All prerequisite evidence is present, but a separate human-controlled release boundary is still required."
        :`Live execution remains locked by ${blockerCodes.length} prerequisite blockers.`
    },
    paper_portfolio:{
      policy_version:portfolio?.policy?.version??null,
      max_concurrent_positions:Number(portfolio?.policy?.max_concurrent_positions||1),
      paper_risk_budget_r:n(portfolio?.policy?.shadow_risk_budget_r)??1,
      total_decisions:Number(pipeline?.total_decisions||0),
      allocated:Number(pipeline?.allocated||0),
      skipped_overlap:Number(pipeline?.skipped_overlap||0),
      open_allocations:Number(pipeline?.open_allocations||0),
      resolved_allocations:Number(pipeline?.resolved_allocations||0),
      current_position:current?{
        intent_id:current.intent_id,
        strategy_code:current.strategy_code,
        side:current.side,
        paper_risk_r:n(current.allocated_risk_r),
        entry_price:n(current.entry_price),
        delayed_mark:n(current.latest_delayed_mark),
        stop_price:n(current.stop_price),
        target_price:n(current.target_price),
        reference_rr:n(current.reference_rr),
        unrealized_paper_r:n(current.unrealized_portfolio_r),
        executable_quote:false
      }:null
    },
    evidence:{
      resolved_shadow_sample:resolvedSample,
      mature_sample_required:matureFloor,
      execution_reality_state:reality?.state??"UNKNOWN",
      execution_blockers:blockerCount,
      infrastructure_verified:infraPassed,
      infrastructure_total:infraTotal,
      broker_lab_state:lab?.state??"UNKNOWN",
      broker_lab_tests_passed:labPassed,
      broker_lab_tests_total:labTotal,
      production_broker_readiness:boundary?.production_broker_readiness??"NOT_TESTED"
    },
    production_prerequisites:productionPrereqs,
    blocker_codes:blockerCodes,
    governance:{
      autonomous_paper_allocation:paperPermission,
      live_trading_enabled:false,
      live_order_eligible:false,
      order_submission_enabled:false,
      broker_adapter_state:"NOT_CONNECTED",
      automatic_real_capital:false,
      human_control_required_for_any_future_live_release:true,
      real_capital_permission:"0R"
    },
    latency_ms:Date.now()-started
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
      decision:{autonomous_mode:"LOCKED",paper_action:"PAPER_LOCKED",manual_live_review_eligible:false,live_action:"LOCKED"},
      governance:{
        autonomous_paper_allocation:false,live_trading_enabled:false,live_order_eligible:false,
        order_submission_enabled:false,broker_adapter_state:"NOT_CONNECTED",
        automatic_real_capital:false,human_control_required_for_any_future_live_release:true,
        real_capital_permission:"0R"
      }
    },{status:503,headers:{...CORS,"Cache-Control":"no-store"}});
  }
});