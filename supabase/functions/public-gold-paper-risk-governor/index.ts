import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type, apikey",
  "Access-Control-Allow-Methods":"GET, OPTIONS"
};
const VERSION="v137-adaptive-paper-risk-governor-v1";
const TTL=12_000;
let cache:any=null,cachedAt=0,inflight:Promise<any>|null=null;

function secretKey(){
  const bundle=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(bundle){try{const parsed=JSON.parse(bundle);if(parsed?.default)return String(parsed.default)}catch{}}
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!legacy)throw new Error("server_key_unavailable");
  return legacy;
}
function publishableKey(){
  const bundle=Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if(bundle){try{const parsed=JSON.parse(bundle);if(parsed?.default)return String(parsed.default)}catch{}}
  return Deno.env.get("SUPABASE_ANON_KEY")||"";
}
function callerAllowed(req:Request){
  const expected=publishableKey(),supplied=req.headers.get("apikey")||"";
  return Boolean(expected&&supplied&&supplied===expected);
}
function serverHeaders(key:string){
  const headers:Record<string,string>={
    apikey:key,Accept:"application/json","Content-Type":"application/json",
    "User-Agent":"THE-FATHER-ANALYTICS/137.0"
  };
  if(!key.startsWith("sb_secret_"))headers.Authorization=`Bearer ${key}`;
  return headers;
}
async function rpc(base:string,key:string,name:string){
  const response=await fetch(`${base}/rest/v1/rpc/${name}`,{
    method:"POST",headers:serverHeaders(key),body:"{}",cache:"no-store",
    signal:AbortSignal.timeout(8000)
  });
  const body=await response.json().catch(()=>null);
  if(!response.ok||!body?.ok)throw new Error(`${name}_${response.status}`);
  return body;
}
async function recentAllocated(base:string,key:string){
  const path="gold_shadow_portfolio_decisions?select=id,intent_id,side,allocated_risk_r,shadow_risk_budget_r,risk_governor_version,risk_governor_snapshot_id,source_market_time&decision=eq.ALLOCATE&order=id.desc&limit=12";
  const response=await fetch(`${base}/rest/v1/${path}`,{
    headers:serverHeaders(key),cache:"no-store",signal:AbortSignal.timeout(5000)
  });
  if(!response.ok)throw new Error(`portfolio_rows_${response.status}`);
  const rows=await response.json().catch(()=>[]);
  return Array.isArray(rows)?rows:[];
}
async function build(){
  const started=Date.now();
  const base=Deno.env.get("SUPABASE_URL")||"https://mpcelmjiycjpdyyflisn.supabase.co";
  const key=secretKey();
  const state=await rpc(base,key,"refresh_v137_gold_paper_risk_governor");
  const decisions=await recentAllocated(base,key);
  const latestAllocated=decisions.find((x:any)=>Number(x?.allocated_risk_r||0)>0)||null;
  const nextRisk=Number(state?.recommended_next_paper_r||0);
  const reductionPct=Number.isFinite(nextRisk)?Math.max(0,Math.round((1-nextRisk)*100)):null;

  return {
    ok:true,version:VERSION,generated_at:new Date().toISOString(),state:state?.state??"FAIL_CLOSED",
    risk:{
      recommended_next_paper_r:nextRisk,baseline_paper_r:1,reduction_from_baseline_pct:reductionPct,
      max_concurrent_positions:Number(state?.max_concurrent_positions||1),
      pyramiding_allowed:state?.pyramiding_allowed===true,
      simultaneous_long_short_allowed:state?.simultaneous_long_short_allowed===true,
      applies_to:"NEXT_ELIGIBLE_FREE_SLOT"
    },
    evidence:{
      sample_band:state?.sample_band??"WITHHELD",
      resolved_paper_trades:Number(state?.resolved_paper_trades||0),
      cumulative_gross_r:Number(state?.cumulative_gross_r||0),
      current_drawdown_r:Number(state?.current_drawdown_r||0),
      max_drawdown_r:Number(state?.max_drawdown_r||0),
      win_streak:Number(state?.win_streak||0),
      loss_streak:Number(state?.loss_streak||0),
      reason_codes:Array.isArray(state?.reason_codes)?state.reason_codes:[]
    },
    current_position:latestAllocated?{
      decision_id:Number(latestAllocated.id),intent_id:Number(latestAllocated.intent_id),
      side:latestAllocated.side,allocated_risk_r:Number(latestAllocated.allocated_risk_r||0),
      risk_governor_version:latestAllocated.risk_governor_version??null,
      risk_governor_snapshot_id:latestAllocated.risk_governor_snapshot_id==null?null:Number(latestAllocated.risk_governor_snapshot_id),
      predates_v137:latestAllocated.risk_governor_snapshot_id==null
    }:null,
    control:{
      future_allocations_are_v137_governed:true,
      existing_allocations_are_never_rewritten:true,
      current_open_position_risk_is_not_retroactively_changed:true,
      one_slot_only:true,live_execution_affected:false
    },
    governance:{
      paper_only:true,live_trading_enabled:false,live_order_eligible:false,
      order_submission_enabled:false,automatic_real_capital:false,real_capital_permission:"0R"
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
    return Response.json(await current(),{headers:{...CORS,"Cache-Control":"public, max-age=4, s-maxage=12, stale-while-revalidate=20"}});
  }catch(error){
    console.error(error);
    return Response.json({
      ok:false,version:VERSION,state:"FAIL_CLOSED",
      risk:{recommended_next_paper_r:0,baseline_paper_r:1,reduction_from_baseline_pct:100,max_concurrent_positions:1,pyramiding_allowed:false,simultaneous_long_short_allowed:false,applies_to:"NONE"},
      governance:{paper_only:true,live_trading_enabled:false,live_order_eligible:false,order_submission_enabled:false,automatic_real_capital:false,real_capital_permission:"0R"}
    },{status:503,headers:{...CORS,"Cache-Control":"no-store"}});
  }
});