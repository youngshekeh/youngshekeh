import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type, apikey",
  "Access-Control-Allow-Methods":"GET, OPTIONS"
};
const VERSION="v134-gold-broker-adapter-lab-v1";
const TTL=20_000;
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
async function build(){
  const base=Deno.env.get("SUPABASE_URL")||"https://mpcelmjiycjpdyyflisn.supabase.co";
  const key=secretKey();
  const [runs,results,events]=await Promise.all([
    rows(base,key,"gold_broker_adapter_lab_runs?select=id,started_at,suite_version,adapter_mode,quote_source,real_broker_connected,live_order_route_present,live_order_submission_enabled,kill_switch_default_on&order=id.desc&limit=20"),
    rows(base,key,"gold_broker_adapter_lab_results?select=id,run_id,evaluated_at,dry_run_lifecycle_pass,idempotency_pass,reconciliation_pass,kill_switch_pass,live_route_denial_pass,unauthorized_submit_blocked,real_orders_sent,orphan_event_count,result_state,production_broker_readiness&order=id.desc&limit=20"),
    rows(base,key,"gold_broker_adapter_lab_events?select=id,run_id,event_seq,scenario_code,event_type,state,real_order_sent&order=id.desc&limit=200")
  ]);
  const latestRun=runs[0]||null;
  const latestResult=results.find((x:any)=>Number(x.run_id)===Number(latestRun?.id))||results[0]||null;
  const latestEvents=latestRun
    ? events.filter((x:any)=>Number(x.run_id)===Number(latestRun.id)).sort((a:any,b:any)=>Number(a.event_seq)-Number(b.event_seq))
    : [];

  const tests=[
    {code:"DRY_RUN_LIFECYCLE",label:"Dry-run lifecycle",passed:latestResult?.dry_run_lifecycle_pass===true},
    {code:"IDEMPOTENCY",label:"Idempotency",passed:latestResult?.idempotency_pass===true},
    {code:"RECONCILIATION",label:"Reconciliation",passed:latestResult?.reconciliation_pass===true},
    {code:"KILL_SWITCH",label:"Kill switch",passed:latestResult?.kill_switch_pass===true},
    {code:"LIVE_ROUTE_DENIAL",label:"Live-route denial",passed:latestResult?.live_route_denial_pass===true},
    {code:"AUTHZ_DENIAL",label:"Unauthorized submit denial",passed:latestResult?.unauthorized_submit_blocked===true}
  ];
  const passed=tests.filter(x=>x.passed).length;

  return {
    ok:true,
    version:VERSION,
    generated_at:new Date().toISOString(),
    state:latestResult?.result_state??"WAITING_FOR_SELFTEST",
    lab:{
      run_id:latestRun?.id??null,
      started_at:latestRun?.started_at??null,
      adapter_mode:latestRun?.adapter_mode??"SIMULATED_ONLY",
      quote_source:latestRun?.quote_source??"DETERMINISTIC_TEST_VECTOR",
      tests_passed:passed,
      tests_total:tests.length,
      tests,
      event_count:latestEvents.length,
      real_orders_sent:Number(latestResult?.real_orders_sent||0),
      orphan_event_count:Number(latestResult?.orphan_event_count||0)
    },
    production_boundary:{
      production_broker_readiness:latestResult?.production_broker_readiness??"NOT_TESTED",
      real_broker_connected:latestRun?.real_broker_connected===true,
      live_order_route_present:latestRun?.live_order_route_present===true,
      live_order_submission_enabled:latestRun?.live_order_submission_enabled===true,
      simulation_success_does_not_count_as_broker_verification:true
    },
    recent_events:latestEvents.map((x:any)=>({
      seq:Number(x.event_seq),
      scenario_code:x.scenario_code,
      event_type:x.event_type,
      state:x.state,
      real_order_sent:x.real_order_sent===true
    })),
    methodology:{
      deterministic_test_vectors_only:true,
      no_live_market_quote_used:true,
      no_broker_api_called:true,
      reconciliation_is_simulated_adapter_reconciliation:true,
      kill_switch_is_simulated_adapter_kill_switch:true,
      production_order_reconciliation_not_claimed:true,
      production_kill_switch_not_claimed:true,
      real_money_pnl_claimed:false
    },
    governance:{
      lab_only:true,
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
      headers:{...CORS,"Cache-Control":"public, max-age=10, s-maxage=20, stale-while-revalidate=30"}
    });
  }catch(error){
    console.error(error);
    return Response.json({
      ok:false,version:VERSION,state:"UNAVAILABLE",
      governance:{
        lab_only:true,live_trading_enabled:false,live_order_eligible:false,
        order_submission_enabled:false,broker_adapter_state:"NOT_CONNECTED",
        automatic_real_capital:false,real_capital_permission:"0R"
      }
    },{status:503,headers:{...CORS,"Cache-Control":"no-store"}});
  }
});