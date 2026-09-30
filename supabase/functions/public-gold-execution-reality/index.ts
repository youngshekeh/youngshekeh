import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type, apikey",
  "Access-Control-Allow-Methods":"GET, OPTIONS"
};
const VERSION="v133-gold-execution-reality-v1";
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
function num(v:any){const n=Number(v);return Number.isFinite(n)?n:null}
function round(v:any,d=3){const n=num(v);return n==null?null:Number(n.toFixed(d))}
async function build(){
  const base=Deno.env.get("SUPABASE_URL")||"https://mpcelmjiycjpdyyflisn.supabase.co";
  const key=secretKey();

  const [readiness,stress,outcomes]=await Promise.all([
    rows(base,key,"gold_execution_readiness_snapshots?select=id,evaluated_at,scope_key,strategy_code,resolved_sample,source_outcome_max_id,avg_gross_r,avg_net_r_low_stress,avg_net_r_moderate_stress,avg_net_r_high_stress,high_stress_positive_count,high_stress_positive_rate_pct,high_stress_total_r,sample_state,execution_evidence_state,broker_adapter_state,execution_grade_quote_available,broker_spread_measured,slippage_measured,order_reconciliation_tested,kill_switch_tested,live_trading_enabled,automatic_real_capital,real_capital_permission,blocker_codes&order=evaluated_at.desc,id.desc&limit=200"),
    rows(base,key,"gold_shadow_cost_stress?select=id,outcome_id,intent_id,strategy_code,scenario_code,stress_cost_r,stress_net_r,actual_broker_cost_claim&order=id.desc&limit=2000"),
    rows(base,key,"gold_shadow_trade_outcomes?select=id,intent_id,resolution_code,gross_r&order=id.asc&limit=2000")
  ]);

  const latestByScope=new Map<string,any>();
  for(const x of readiness){
    if(!latestByScope.has(String(x.scope_key)))latestByScope.set(String(x.scope_key),x);
  }
  const overall=latestByScope.get("ALL")||null;
  const strategies=[...latestByScope.values()]
    .filter((x:any)=>String(x.scope_key)!=="ALL")
    .map((x:any)=>({
      scope_key:x.scope_key,
      strategy_code:x.strategy_code,
      resolved_sample:Number(x.resolved_sample||0),
      sample_state:x.sample_state,
      execution_evidence_state:x.execution_evidence_state,
      statistics_withheld:Number(x.resolved_sample||0)<10,
      public_statistics:Number(x.resolved_sample||0)>=10?{
        avg_gross_r:round(x.avg_gross_r),
        avg_high_friction_stress_r:round(x.avg_net_r_high_stress),
        high_stress_positive_rate_pct:round(x.high_stress_positive_rate_pct,2)
      }:null
    }));

  const n=Number(overall?.resolved_sample||0);
  const matureResearch=n>=30;
  const publish=n>=10;
  const blockers=Array.isArray(overall?.blocker_codes)?overall.blocker_codes:[];
  const hardInfrastructure=[
    ["BROKER ADAPTER",overall?.broker_adapter_state==="CONNECTED"],
    ["EXECUTION QUOTE",overall?.execution_grade_quote_available===true],
    ["SPREAD MEASURED",overall?.broker_spread_measured===true],
    ["SLIPPAGE MEASURED",overall?.slippage_measured===true],
    ["RECONCILIATION",overall?.order_reconciliation_tested===true],
    ["KILL SWITCH",overall?.kill_switch_tested===true]
  ].map(([name,passed])=>({name,passed:Boolean(passed)}));

  let state="LOCKED";
  if(!overall)state="WAITING_FOR_READINESS_SNAPSHOT";
  else if(!matureResearch)state="LOCKED · RESEARCH SAMPLE";
  else if(num(overall?.avg_net_r_high_stress)==null||Number(overall.avg_net_r_high_stress)<=0)state="LOCKED · STRESS EDGE";
  else if(hardInfrastructure.some(x=>!x.passed))state="LOCKED · EXECUTION INFRASTRUCTURE";
  else state="HUMAN_RELEASE_REVIEW_REQUIRED";

  return {
    ok:true,
    version:VERSION,
    generated_at:new Date().toISOString(),
    state,
    research:{
      resolved_sample:n,
      minimum_public_sample:10,
      mature_research_sample:30,
      sample_state:overall?.sample_state??"WAITING",
      execution_evidence_state:overall?.execution_evidence_state??"WAITING",
      statistics_withheld:!publish,
      public_statistics:publish?{
        average_gross_r:round(overall?.avg_gross_r),
        average_low_friction_stress_r:round(overall?.avg_net_r_low_stress),
        average_moderate_friction_stress_r:round(overall?.avg_net_r_moderate_stress),
        average_high_friction_stress_r:round(overall?.avg_net_r_high_stress),
        high_stress_positive_count:Number(overall?.high_stress_positive_count||0),
        high_stress_positive_rate_pct:round(overall?.high_stress_positive_rate_pct,2),
        high_stress_total_r:round(overall?.high_stress_total_r)
      }:null,
      strategies
    },
    friction_stress:{
      actual_broker_cost_claim:false,
      basis:"RISK_NORMALIZED_FRICTION_STRESS_NOT_BROKER_MEASUREMENT",
      scenarios:[
        {code:"LOW_FRICTION_STRESS",cost_r:0.02},
        {code:"MODERATE_FRICTION_STRESS",cost_r:0.05},
        {code:"HIGH_FRICTION_STRESS",cost_r:0.10}
      ],
      stress_rows:stress.length
    },
    execution_gate:{
      blocker_codes:blockers,
      blocker_count:blockers.length,
      infrastructure:hardInfrastructure,
      infrastructure_passed:hardInfrastructure.filter(x=>x.passed).length,
      infrastructure_total:hardInfrastructure.length,
      broker_adapter_state:overall?.broker_adapter_state??"NOT_CONNECTED",
      human_release_review_required:true
    },
    methodology:{
      shadow_outcomes_used:outcomes.length,
      friction_values_are_stress_scenarios_not_measured_costs:true,
      broker_spread_measured:false,
      slippage_measured:false,
      trade_pnl_claimed:false,
      delayed_reference_not_execution_quote:true,
      sample_maturity_does_not_grant_live_trading:true,
      positive_shadow_evidence_does_not_grant_live_trading:true
    },
    governance:{
      shadow_only:true,
      live_trading_enabled:false,
      live_order_eligible:false,
      order_submission_enabled:false,
      automatic_real_capital:false,
      broker_adapter_state:overall?.broker_adapter_state??"NOT_CONNECTED",
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
        order_submission_enabled:false,automatic_real_capital:false,
        broker_adapter_state:"NOT_CONNECTED",real_capital_permission:"0R"
      }
    },{status:503,headers:{...CORS,"Cache-Control":"no-store"}});
  }
});