import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type, apikey",
  "Access-Control-Allow-Methods":"GET, OPTIONS"
};
const VERSION="v136-execution-order-firewall-v1";
const TTL=12_000;
let cache:any=null,cachedAt=0,inflight:Promise<any>|null=null;

function secretKey(){
  const bundle=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(bundle){
    try{
      const parsed=JSON.parse(bundle);
      if(parsed?.default)return String(parsed.default);
    }catch{}
  }
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!legacy)throw new Error("server_key_unavailable");
  return legacy;
}

function serverHeaders(key:string){
  const headers:Record<string,string>={
    apikey:key,
    Accept:"application/json",
    "Content-Type":"application/json",
    "User-Agent":"THE-FATHER-ANALYTICS/136.0"
  };
  if(!key.startsWith("sb_secret_"))headers.Authorization=`Bearer ${key}`;
  return headers;
}

async function rpc(base:string,key:string){
  const response=await fetch(`${base}/rest/v1/rpc/refresh_v136_gold_execution_firewall`,{
    method:"POST",
    headers:serverHeaders(key),
    body:"{}",
    cache:"no-store",
    signal:AbortSignal.timeout(8000)
  });
  const body=await response.json().catch(()=>null);
  if(!response.ok||!body?.ok)throw new Error(`firewall_rpc_${response.status}`);
  return body;
}

async function recent(base:string,key:string){
  const fields=[
    "id","created_at","source_portfolio_decision_id","source_intent_id",
    "source_transition_id","symbol","side","strategy_code","reference_market_time",
    "reference_entry","reference_stop","reference_target","reference_rr","requested_r",
    "risk_geometry_valid","risk_within_limit","quote_class","client_order_id",
    "idempotency_key","kill_switch_on","submission_state","submission_permitted",
    "real_order_sent","blocker_codes"
  ].join(",");
  const path=`gold_execution_order_intents?select=${fields}&firewall_version=eq.v136-execution-order-firewall-v1&order=id.desc&limit=5`;
  const response=await fetch(`${base}/rest/v1/${path}`,{
    headers:serverHeaders(key),
    cache:"no-store",
    signal:AbortSignal.timeout(5000)
  });
  if(!response.ok)throw new Error(`firewall_rows_${response.status}`);
  const body=await response.json().catch(()=>[]);
  return Array.isArray(body)?body:[];
}

async function build(){
  const started=Date.now();
  const base=Deno.env.get("SUPABASE_URL")||"https://mpcelmjiycjpdyyflisn.supabase.co";
  const key=secretKey();
  const state=await rpc(base,key);
  const history=await recent(base,key);
  const current=state?.current_order_intent??null;
  const firewall=state?.firewall??{};
  const blockers=Array.isArray(current?.blocker_codes)?current.blocker_codes:[];

  const checks=[
    {code:"PAPER_SOURCE",label:"PAPER SOURCE",passed:firewall?.paper_source_valid===true},
    {code:"RISK_GEOMETRY",label:"RISK GEOMETRY",passed:firewall?.risk_geometry_valid===true},
    {code:"RISK_LIMIT",label:"RISK ≤ 1R",passed:firewall?.risk_within_one_r===true},
    {code:"IDEMPOTENCY",label:"IDEMPOTENCY KEY",passed:firewall?.idempotency_key_present===true},
    {code:"KILL_SWITCH",label:"KILL SWITCH",passed:firewall?.kill_switch_on===true},
    {code:"REAL_BROKER",label:"REAL BROKER",passed:firewall?.real_broker_connected===true},
    {code:"LIVE_ROUTE",label:"LIVE ORDER ROUTE",passed:firewall?.live_order_route_present===true},
    {code:"EXECUTION_QUOTE",label:"EXECUTION-GRADE QUOTE",passed:firewall?.execution_grade_quote===true},
    {code:"SPREAD",label:"MEASURED SPREAD",passed:firewall?.measured_spread_available===true},
    {code:"SLIPPAGE",label:"MEASURED SLIPPAGE",passed:firewall?.measured_slippage_available===true},
    {code:"HUMAN_RELEASE",label:"HUMAN RELEASE",passed:firewall?.human_release_complete===true},
    {code:"SUBMISSION",label:"LIVE SUBMISSION",passed:firewall?.submission_permitted===true}
  ];

  return {
    ok:true,
    version:VERSION,
    generated_at:new Date().toISOString(),
    state:state?.state??"FAIL_CLOSED",
    order:current?{
      id:current.id,
      client_order_id:current.client_order_id,
      source_portfolio_decision_id:current.source_portfolio_decision_id,
      source_intent_id:current.source_intent_id,
      source_transition_id:current.source_transition_id,
      symbol:current.symbol??"XAUUSD",
      side:current.side,
      strategy_code:current.strategy_code,
      reference_market_time:current.reference_market_time,
      reference_entry:current.reference_entry,
      reference_stop:current.reference_stop,
      reference_target:current.reference_target,
      reference_rr:current.reference_rr,
      requested_r:current.requested_r,
      quote_class:current.quote_class,
      idempotency_key:current.idempotency_key,
      kill_switch_on:current.kill_switch_on===true,
      submission_state:current.submission_state,
      submission_permitted:false,
      real_order_sent:false,
      blocker_codes:blockers
    }:null,
    qualification:{
      checks,
      passed:checks.filter(x=>x.passed).length,
      total:checks.length,
      live_blockers:blockers.length,
      live_submission_permitted:false
    },
    ledger:{
      total_order_intents:Number(state?.total_order_intents||0),
      recent_intents:history.map((x:any)=>({
        id:x.id,
        created_at:x.created_at,
        client_order_id:x.client_order_id,
        side:x.side,
        strategy_code:x.strategy_code,
        requested_r:x.requested_r,
        quote_class:x.quote_class,
        submission_state:x.submission_state,
        real_order_sent:x.real_order_sent===true
      }))
    },
    governance:{
      dry_run_only:true,
      kill_switch_default_on:true,
      live_trading_enabled:false,
      live_order_eligible:false,
      order_submission_enabled:false,
      broker_adapter_state:"NOT_CONNECTED",
      automatic_real_capital:false,
      human_control_required_for_any_future_live_release:true,
      real_orders_sent:Number(state?.real_orders_sent||0),
      real_capital_permission:"0R"
    },
    methodology:{
      source:"V133_ONE_SLOT_PAPER_PORTFOLIO",
      delayed_reference_is_not_execution_quote:true,
      order_envelope_is_dry_run_only:true,
      deterministic_idempotency:true,
      immutable_ledger:true,
      no_live_broker_call:true,
      no_order_transmission:true
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
      headers:{...CORS,"Cache-Control":"public, max-age=4, s-maxage=12, stale-while-revalidate=20"}
    });
  }catch(error){
    console.error(error);
    return Response.json({
      ok:false,
      version:VERSION,
      state:"FAIL_CLOSED",
      order:null,
      qualification:{checks:[],passed:0,total:12,live_blockers:12,live_submission_permitted:false},
      governance:{
        dry_run_only:true,
        kill_switch_default_on:true,
        live_trading_enabled:false,
        live_order_eligible:false,
        order_submission_enabled:false,
        broker_adapter_state:"NOT_CONNECTED",
        automatic_real_capital:false,
        human_control_required_for_any_future_live_release:true,
        real_orders_sent:0,
        real_capital_permission:"0R"
      }
    },{status:503,headers:{...CORS,"Cache-Control":"no-store"}});
  }
});
