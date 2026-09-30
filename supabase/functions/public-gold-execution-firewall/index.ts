import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type, apikey",
  "Access-Control-Allow-Methods":"GET, OPTIONS"
};
const VERSION="v136.1-execution-qualification-firewall-v1";
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

function publishableKey(){
  const bundle=Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if(bundle){
    try{
      const parsed=JSON.parse(bundle);
      if(parsed?.default)return String(parsed.default);
    }catch{}
  }
  return Deno.env.get("SUPABASE_ANON_KEY")||"";
}

function callerAllowed(req:Request){
  const expected=publishableKey();
  const supplied=req.headers.get("apikey")||"";
  return Boolean(expected&&supplied&&supplied===expected);
}

function serverHeaders(key:string){
  const headers:Record<string,string>={
    apikey:key,
    Accept:"application/json",
    "Content-Type":"application/json",
    "User-Agent":"THE-FATHER-ANALYTICS/136.1"
  };
  if(!key.startsWith("sb_secret_"))headers.Authorization=`Bearer ${key}`;
  return headers;
}

async function rpc(base:string,key:string,name:string){
  const response=await fetch(`${base}/rest/v1/rpc/${name}`,{
    method:"POST",
    headers:serverHeaders(key),
    body:"{}",
    cache:"no-store",
    signal:AbortSignal.timeout(8000)
  });
  const body=await response.json().catch(()=>null);
  if(!response.ok||!body?.ok)throw new Error(`${name}_${response.status}`);
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

function lacks(blockers:string[],code:string){
  return !blockers.includes(code);
}

async function build(){
  const started=Date.now();
  const base=Deno.env.get("SUPABASE_URL")||"https://mpcelmjiycjpdyyflisn.supabase.co";
  const key=secretKey();

  const [envelope,qualification,paper]=await Promise.all([
    rpc(base,key,"refresh_v136_gold_execution_firewall"),
    rpc(base,key,"refresh_v136_gold_execution_qualification"),
    rpc(base,key,"refresh_v136_gold_paper_portfolio_ledger")
  ]);
  const history=await recent(base,key);

  const rawOrder=envelope?.current_order_intent??null;
  const blockers=Array.isArray(qualification?.blocker_codes)
    ? qualification.blocker_codes.map((x:any)=>String(x))
    : [];

  const order=rawOrder?{
    id:rawOrder.id,
    client_order_id:qualification?.dry_run_client_order_id??rawOrder.client_order_id,
    source_portfolio_decision_id:qualification?.portfolio_decision_id??rawOrder.source_portfolio_decision_id,
    source_intent_id:qualification?.intent_id??rawOrder.source_intent_id,
    source_transition_id:rawOrder.source_transition_id,
    symbol:rawOrder.symbol??"XAUUSD",
    side:qualification?.side??rawOrder.side,
    strategy_code:rawOrder.strategy_code,
    reference_market_time:rawOrder.reference_market_time,
    reference_entry:qualification?.reference_entry??rawOrder.reference_entry,
    reference_stop:qualification?.stop_price??rawOrder.reference_stop,
    reference_target:qualification?.target_price??rawOrder.reference_target,
    reference_rr:qualification?.reference_rr??rawOrder.reference_rr,
    requested_r:qualification?.requested_paper_r??rawOrder.requested_r,
    quote_class:rawOrder.quote_class,
    idempotency_key:rawOrder.idempotency_key,
    kill_switch_default_on:rawOrder.kill_switch_on===true,
    submission_state:qualification?.qualification_state??rawOrder.submission_state,
    submission_permitted:false,
    real_order_sent:false,
    blocker_codes:blockers
  }:null;

  const checks=[
    {code:"PAPER_SOURCE",label:"PAPER SOURCE",passed:Boolean(qualification?.portfolio_decision_id)},
    {code:"RISK_GEOMETRY",label:"RISK GEOMETRY",passed:qualification?.risk_geometry_valid===true},
    {code:"MATURE_SAMPLE",label:"RESEARCH SAMPLE",passed:qualification?.mature_research_sample===true},
    {code:"ADAPTER_LAB",label:"ADAPTER LAB",passed:qualification?.adapter_lab_pass===true},
    {code:"KILL_SWITCH_TEST",label:"KILL SWITCH TEST",passed:lacks(blockers,"KILL_SWITCH_NOT_TESTED")},
    {code:"RECONCILIATION_TEST",label:"ORDER RECONCILIATION",passed:lacks(blockers,"ORDER_RECONCILIATION_NOT_TESTED")},
    {code:"PRODUCTION_BROKER",label:"PRODUCTION BROKER",passed:qualification?.production_broker_verified===true},
    {code:"REAL_BROKER",label:"REAL BROKER",passed:qualification?.real_broker_connected===true},
    {code:"LIVE_ROUTE",label:"LIVE ORDER ROUTE",passed:qualification?.live_order_route_present===true},
    {code:"EXECUTION_QUOTE",label:"EXECUTION-GRADE QUOTE",passed:qualification?.execution_grade_quote_available===true},
    {code:"SPREAD",label:"MEASURED SPREAD",passed:qualification?.broker_spread_measured===true},
    {code:"SLIPPAGE",label:"MEASURED SLIPPAGE",passed:qualification?.slippage_measured===true},
    {code:"HUMAN_RELEASE",label:"HUMAN RELEASE",passed:qualification?.human_release_review_complete===true},
    {code:"LIVE_QUALIFIED",label:"LIVE QUALIFICATION",passed:qualification?.live_order_qualified===true}
  ];

  const latestPaper=paper?.latest??null;

  return {
    ok:true,
    version:VERSION,
    generated_at:new Date().toISOString(),
    state:qualification?.state??envelope?.state??"FAIL_CLOSED",
    order,
    qualification:{
      version:qualification?.version??null,
      checks,
      passed:checks.filter(x=>x.passed).length,
      total:checks.length,
      resolved_research_sample:Number(qualification?.resolved_research_sample||0),
      mature_sample_required:Number(qualification?.mature_sample_required||30),
      dry_run_order_ready:qualification?.dry_run_order_ready===true,
      live_order_qualified:false,
      live_blockers:blockers.length,
      blocker_codes:blockers,
      live_submission_permitted:false
    },
    paper_portfolio:{
      version:paper?.version??null,
      resolved_events:Number(paper?.resolved_events||0),
      cumulative_gross_r:latestPaper?.cumulative_gross_r??null,
      equity_index:latestPaper?.equity_index??null,
      drawdown_r:latestPaper?.drawdown_r??null,
      max_drawdown_r:latestPaper?.max_drawdown_r??null,
      win_streak:latestPaper?.win_streak??0,
      loss_streak:latestPaper?.loss_streak??0,
      money_pnl_claimed:false
    },
    ledger:{
      total_order_intents:Number(envelope?.total_order_intents||0),
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
      real_orders_sent:Number(qualification?.real_order_sent===true?1:0)+Number(envelope?.real_orders_sent||0),
      real_capital_permission:"0R"
    },
    methodology:{
      source:"V133_ONE_SLOT_PAPER_PORTFOLIO",
      qualification_source:"V136_EXECUTION_QUALIFICATION_FIREWALL",
      performance_source:"V136_PAPER_PORTFOLIO_LEDGER",
      delayed_reference_is_not_execution_quote:true,
      order_envelope_is_dry_run_only:true,
      deterministic_idempotency:true,
      immutable_ledger:true,
      no_live_broker_call:true,
      no_order_transmission:true,
      money_pnl_claimed:false
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
  if(!callerAllowed(req))return Response.json({ok:false,error:"unauthorized"},{status:401,headers:{...CORS,"Cache-Control":"no-store"}});
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
      qualification:{checks:[],passed:0,total:14,live_blockers:14,live_submission_permitted:false},
      paper_portfolio:{resolved_events:0,cumulative_gross_r:null,equity_index:null,drawdown_r:null,max_drawdown_r:null,win_streak:0,loss_streak:0,money_pnl_claimed:false},
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
