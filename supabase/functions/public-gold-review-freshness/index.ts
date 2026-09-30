import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type, apikey",
  "Access-Control-Allow-Methods":"GET, OPTIONS"
};
const VERSION="v131-gold-review-freshness-v1";
const CLASSIFIER="v125.3-event-aware-v2";
const TARGETS:{[key:string]:number}={
  P1_HIGH_ATTENTION:30,
  P2_PRIORITY:60,
  P3_STANDARD:120,
  P4_BACKGROUND:240
};
const TTL=20_000;
let cache:any=null,cachedAt=0,inflight:Promise<any>|null=null;

function serverKey(){
  const bundle=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(bundle){try{const p=JSON.parse(bundle);if(p?.default)return p.default}catch{}}
  const k=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!k)throw new Error("server_key_unavailable");
  return k;
}
async function rows(base:string,key:string,path:string){
  const r=await fetch(base+"/rest/v1/"+path,{
    headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:"application/json"},
    cache:"no-store",signal:AbortSignal.timeout(5000)
  });
  if(!r.ok)throw new Error(`postgrest_${r.status}`);
  const body=await r.json();return Array.isArray(body)?body:[];
}
async function build(){
  const base=Deno.env.get("SUPABASE_URL")||"https://mpcelmjiycjpdyyflisn.supabase.co";
  const key=serverKey();
  const [assignments,reviews,latencies]=await Promise.all([
    rows(base,key,`gold_review_priority_assignments?select=review_request_id,requested_at,priority_band,priority_score,scoring_version&classifier_version=eq.${CLASSIFIER}&order=priority_score.desc&limit=500`),
    rows(base,key,`gold_human_review_events?select=review_request_id,event_type&event_type=eq.HUMAN_EVIDENCE_REVIEW&classifier_version=eq.${CLASSIFIER}&limit=1000`),
    rows(base,key,`gold_review_response_latency_events?select=id,priority_band,response_latency_seconds,reviewed_at&classifier_version=eq.${CLASSIFIER}&order=reviewed_at.desc&limit=1000`)
  ]);
  const now=Date.now();
  const reviewed=new Set(reviews.map((x:any)=>Number(x.review_request_id)));
  const pending=assignments.filter((x:any)=>!reviewed.has(Number(x.review_request_id))).map((x:any)=>{
    const target=TARGETS[String(x.priority_band)]??240;
    const age=Math.max(0,(now-Date.parse(String(x.requested_at)))/60000);
    return {...x,age_minutes:age,target_minutes:target,over_target:age>target};
  });
  const bands=Object.keys(TARGETS).map((band)=>{
    const list=pending.filter((x:any)=>x.priority_band===band);
    const ages=list.map((x:any)=>x.age_minutes);
    return {
      priority_band:band,
      target_minutes:TARGETS[band],
      pending:list.length,
      over_target:list.filter((x:any)=>x.over_target).length,
      oldest_pending_minutes:ages.length?Number(Math.max(...ages).toFixed(1)):null
    };
  });
  const p1=pending.filter((x:any)=>x.priority_band==="P1_HIGH_ATTENTION");
  const allAges=pending.map((x:any)=>x.age_minutes);
  const p1Ages=p1.map((x:any)=>x.age_minutes);
  const overTarget=pending.filter((x:any)=>x.over_target);
  const overP1=p1.filter((x:any)=>x.over_target);
  let state="WITHIN_OPERATIONAL_TARGETS";
  if(overP1.length>0)state="P1_OVER_TARGET";
  else if(overTarget.length>0)state="REVIEW_QUEUE_AGING";
  else if(!pending.length)state="NO_PENDING_DIRECTIONAL_REVIEWS";

  const latencyValues=latencies.map((x:any)=>Number(x.response_latency_seconds)/60).filter(Number.isFinite);
  const latencyPublic=latencyValues.length>=5 ? {
    sample_count:latencyValues.length,
    average_minutes:Number((latencyValues.reduce((a:number,b:number)=>a+b,0)/latencyValues.length).toFixed(1)),
    min_minutes:Number(Math.min(...latencyValues).toFixed(1)),
    max_minutes:Number(Math.max(...latencyValues).toFixed(1))
  } : null;

  return {
    ok:true,version:VERSION,generated_at:new Date().toISOString(),
    classifier_version:CLASSIFIER,state,
    pipeline:{
      assignments:assignments.length,
      pending_directional_reviews:pending.length,
      latency_events:latencies.length,
      over_target_total:overTarget.length,
      over_target_p1:overP1.length,
      oldest_pending_minutes:allAges.length?Number(Math.max(...allAges).toFixed(1)):null,
      oldest_p1_minutes:p1Ages.length?Number(Math.max(...p1Ages).toFixed(1)):null
    },
    bands,
    response_latency:{
      statistics_withheld:latencyValues.length<5,
      minimum_public_sample:5,
      public_statistics:latencyPublic
    },
    methodology:{
      target_type:"OPERATIONAL_ATTENTION_TARGET_NOT_MARKET_SIGNAL",
      targets_minutes:TARGETS,
      current_age_derived_from_requested_at:true,
      response_latency_derived_only_after_real_human_review:true,
      oldest_first_within_equal_priority:true,
      performance_evidence_used:false,
      reviewer_reputation_used:false,
      market_future_data_used:false
    },
    governance:{
      read_only:true,
      automatic_execution:false,
      automatic_promotion:false,
      review_freshness_can_grant_capital:false,
      capital_permission:"0R"
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
      governance:{automatic_execution:false,automatic_promotion:false,review_freshness_can_grant_capital:false,capital_permission:"0R"}
    },{status:503,headers:{...CORS,"Cache-Control":"no-store"}});
  }
});