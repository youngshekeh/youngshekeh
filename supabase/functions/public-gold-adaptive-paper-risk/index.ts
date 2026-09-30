import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type, apikey",
  "Access-Control-Allow-Methods":"GET, OPTIONS"
};
const VERSION="v137.1-adaptive-paper-risk-consensus-v1";
const TTL=12_000;
let cache:any=null,cachedAt=0,inflight:Promise<any>|null=null;

function serverKey(){
  const bundle=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(bundle){
    try{const p=JSON.parse(bundle); if(p?.default)return String(p.default);}catch{}
  }
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!legacy)throw new Error("server_key_unavailable");
  return legacy;
}
function publicKey(){
  const bundle=Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if(bundle){
    try{const p=JSON.parse(bundle); if(p?.default)return String(p.default);}catch{}
  }
  return Deno.env.get("SUPABASE_ANON_KEY")||"";
}
function callerAllowed(req:Request){
  const expected=publicKey();
  const supplied=req.headers.get("apikey")||"";
  return Boolean(expected&&supplied&&supplied===expected);
}
function headers(key:string){
  const h:Record<string,string>={
    apikey:key,Accept:"application/json","Content-Type":"application/json",
    "User-Agent":"THE-FATHER-ANALYTICS/137.0"
  };
  if(!key.startsWith("sb_secret_"))h.Authorization=`Bearer ${key}`;
  return h;
}
async function rpc(base:string,key:string,name:string){
  const r=await fetch(`${base}/rest/v1/rpc/${name}`,{
    method:"POST",headers:headers(key),body:"{}",cache:"no-store",
    signal:AbortSignal.timeout(9000)
  });
  const b=await r.json().catch(()=>null);
  if(!r.ok||!b?.ok)throw new Error(`${name}_${r.status}`);
  return b;
}
async function rows(base:string,key:string,path:string){
  const r=await fetch(`${base}/rest/v1/${path}`,{
    headers:headers(key),cache:"no-store",signal:AbortSignal.timeout(5000)
  });
  if(!r.ok)throw new Error(`rows_${r.status}`);
  const b=await r.json().catch(()=>[]);
  return Array.isArray(b)?b:[];
}
async function build(){
  const started=Date.now();
  const base=Deno.env.get("SUPABASE_URL")||"https://mpcelmjiycjpdyyflisn.supabase.co";
  const key=serverKey();

  const state=await rpc(base,key,"refresh_v137_gold_adaptive_paper_portfolio");
  const decisions=await rows(base,key,
    "gold_adaptive_paper_decisions?select=id,created_at,intent_id,decision,decision_reason,side,source_market_time,source_price,stop_price,target_price,reference_rr,allocated_paper_r&order=id.desc&limit=6"
  );
  const outcomes=await rows(base,key,
    "gold_adaptive_paper_outcomes?select=id,created_at,decision_id,intent_id,resolved_market_time,resolution_code,allocated_paper_r,gross_trade_r,portfolio_gross_r,cost_model_state,portfolio_net_r&order=id.desc&limit=6"
  );
  const open=decisions.find((d:any)=>d?.decision==="ALLOCATE"&&!outcomes.some((o:any)=>Number(o?.decision_id)===Number(d?.id)))||null;

  return {
    ok:true,
    version:VERSION,
    generated_at:new Date().toISOString(),
    state:state?.risk_state??"FAIL_CLOSED",
    next_paper_risk_r:Number(state?.next_paper_risk_r??0),
    challenger:{
      policy_version:state?.policy_version??"v137-adaptive-one-slot-v1",
      launched_at:state?.launched_at??null,
      total_decisions:Number(state?.total_decisions||0),
      allocated:Number(state?.allocated||0),
      skipped:Number(state?.skipped||0),
      open_allocations:Number(state?.open_allocations||0),
      resolved_events:Number(state?.resolved_events||0),
      cumulative_gross_r:state?.cumulative_gross_r??null,
      max_drawdown_r:state?.max_drawdown_r??null,
      loss_streak:Number(state?.loss_streak||0),
      current_open:open,
      recent_decisions:decisions,
      recent_outcomes:outcomes
    },
    risk_consensus:{
      snapshot_id:state?.consensus_snapshot_id??null,
      models_agree:state?.risk_models_agree===true,
      adaptive_model_r:state?.adaptive_model_r??null,
      independent_model_r:state?.independent_model_r??null,
      policy:"MINIMUM_ON_DISAGREEMENT"
    },
    controls:{
      max_concurrent_positions:Number(state?.max_concurrent_positions||1),
      resizes_existing_positions:false,
      retroactive_allocation:false,
      late_outcome_backfill_blocked:true,
      paper_only:true
    },
    governance:{
      live_trading_enabled:false,
      order_submission_enabled:false,
      broker_adapter_state:"NOT_CONNECTED",
      automatic_real_capital:false,
      real_capital_permission:"0R"
    },
    methodology:{
      challenger_not_control:true,
      control_policy:"V133_FIXED_1R",
      adaptive_policy:"V137_DRAWDOWN_SAMPLE_AWARE",
      gross_r_not_money_pnl:true,
      costs_required_for_net_r:true
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
      ok:false,version:VERSION,state:"FAIL_CLOSED",next_paper_risk_r:0,
      challenger:{total_decisions:0,allocated:0,skipped:0,open_allocations:0},
      governance:{live_trading_enabled:false,order_submission_enabled:false,broker_adapter_state:"NOT_CONNECTED",automatic_real_capital:false,real_capital_permission:"0R"}
    },{status:503,headers:{...CORS,"Cache-Control":"no-store"}});
  }
});
