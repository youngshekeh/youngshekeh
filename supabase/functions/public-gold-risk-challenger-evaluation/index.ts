import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type, apikey",
  "Access-Control-Allow-Methods":"GET, OPTIONS"
};
const VERSION="v138-prospective-risk-challenger-evaluation-v1";
const TTL=12_000;
let cache:any=null,cachedAt=0,inflight:Promise<any>|null=null;

function serverKey(){
  const bundle=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(bundle){try{const p=JSON.parse(bundle);if(p?.default)return String(p.default)}catch{}}
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!legacy)throw new Error("server_key_unavailable");
  return legacy;
}
function publicKey(){
  const bundle=Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if(bundle){try{const p=JSON.parse(bundle);if(p?.default)return String(p.default)}catch{}}
  return Deno.env.get("SUPABASE_ANON_KEY")||"";
}
function callerAllowed(req:Request){
  const expected=publicKey(),supplied=req.headers.get("apikey")||"";
  return Boolean(expected&&supplied&&supplied===expected);
}
function headers(key:string){
  const h:Record<string,string>={
    apikey:key,Accept:"application/json","Content-Type":"application/json",
    "User-Agent":"THE-FATHER-ANALYTICS/138.0"
  };
  if(!key.startsWith("sb_secret_"))h.Authorization=`Bearer ${key}`;
  return h;
}
async function rpc(base:string,key:string,name:string){
  const r=await fetch(`${base}/rest/v1/rpc/${name}`,{
    method:"POST",headers:headers(key),body:"{}",cache:"no-store",
    signal:AbortSignal.timeout(9000)
  });
  const body=await r.json().catch(()=>null);
  if(!r.ok||!body?.ok)throw new Error(`${name}_${r.status}`);
  return body;
}
async function rows(base:string,key:string,path:string){
  const r=await fetch(`${base}/rest/v1/${path}`,{
    headers:headers(key),cache:"no-store",signal:AbortSignal.timeout(5000)
  });
  if(!r.ok)throw new Error(`rows_${r.status}`);
  const body=await r.json().catch(()=>[]);
  return Array.isArray(body)?body:[];
}
async function build(){
  const started=Date.now();
  const base=Deno.env.get("SUPABASE_URL")||"https://mpcelmjiycjpdyyflisn.supabase.co";
  const key=serverKey();

  const evaluation=await rpc(base,key,"refresh_v138_gold_risk_challenger_evaluation");
  const recent=await rows(base,key,
    "gold_risk_challenger_matched_outcomes?select=id,intent_id,side,resolved_market_time,resolution_code,control_allocated_r,challenger_allocated_r,underlying_trade_gross_r,control_portfolio_gross_r,challenger_portfolio_gross_r,challenger_minus_control_gross_r,outcome_consistent&order=id.desc&limit=6"
  );

  const cohort=evaluation?.cohort??{};
  const release=evaluation?.release??{};
  const governance=evaluation?.governance??{};
  const stats=evaluation?.matched_statistics??null;
  const remaining=Math.max(0,Number(release?.public_sample_floor||10)-Number(cohort?.matched_resolved||0));

  return {
    ok:true,
    version:VERSION,
    generated_at:new Date().toISOString(),
    state:evaluation?.state??"FAIL_CLOSED",
    cohort:{
      control_allocations_post_launch:Number(cohort?.control_allocations_post_launch||0),
      challenger_allocations_post_launch:Number(cohort?.challenger_allocations_post_launch||0),
      matched_allocations:Number(cohort?.matched_allocations||0),
      matched_resolved:Number(cohort?.matched_resolved||0),
      matched_open:Number(cohort?.matched_open||0),
      control_only_allocations:Number(cohort?.control_only_allocations||0),
      challenger_only_allocations:Number(cohort?.challenger_only_allocations||0)
    },
    release:{
      public_sample_floor:Number(release?.public_sample_floor||10),
      mature_sample_floor:Number(release?.mature_sample_floor||30),
      statistics_withheld:release?.statistics_withheld!==false,
      resolved_until_public_statistics:remaining,
      human_review_eligible:release?.human_review_eligible===true
    },
    matched_statistics:release?.statistics_withheld===false?stats:null,
    recent_matches:recent,
    interpretation:{
      verdict:"WITHHELD",
      reason:release?.statistics_withheld!==false
        ?"Matched prospective sample is below the public release floor."
        :"Statistics are descriptive evidence only; no automatic policy winner is selected."
    },
    governance:{
      comparison_scope:governance?.comparison_scope??"MATCHED_PROSPECTIVE_ALLOCATIONS_ONLY",
      automatic_winner_selection:false,
      automatic_policy_promotion:false,
      future_performance_selection:false,
      live_trading_enabled:false,
      order_submission_enabled:false,
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
  if(!callerAllowed(req))return Response.json({ok:false,error:"unauthorized"},{status:401,headers:{...CORS,"Cache-Control":"no-store"}});
  if(req.method!=="GET")return Response.json({ok:false,error:"method_not_allowed"},{status:405,headers:CORS});
  try{
    return Response.json(await current(),{
      headers:{...CORS,"Cache-Control":"public, max-age=4, s-maxage=12, stale-while-revalidate=20"}
    });
  }catch(error){
    console.error(error);
    return Response.json({
      ok:false,version:VERSION,state:"FAIL_CLOSED",
      cohort:{matched_allocations:0,matched_resolved:0,matched_open:0},
      release:{statistics_withheld:true,public_sample_floor:10,mature_sample_floor:30},
      matched_statistics:null,
      interpretation:{verdict:"WITHHELD",reason:"Evaluation channel unavailable."},
      governance:{comparison_scope:"MATCHED_PROSPECTIVE_ALLOCATIONS_ONLY",automatic_winner_selection:false,
        automatic_policy_promotion:false,future_performance_selection:false,
        live_trading_enabled:false,order_submission_enabled:false,real_capital_permission:"0R"}
    },{status:503,headers:{...CORS,"Cache-Control":"no-store"}});
  }
});