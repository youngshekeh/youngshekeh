import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type, apikey",
  "Access-Control-Allow-Methods":"GET, OPTIONS"
};
const VERSION="v130-gold-review-priority-v1";
const CLASSIFIER="v125.3-event-aware-v2";
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
    cache:"no-store",
    signal:AbortSignal.timeout(5000)
  });
  if(!r.ok)throw new Error(`postgrest_${r.status}`);
  const body=await r.json();
  return Array.isArray(body)?body:[];
}
async function build(){
  const base=Deno.env.get("SUPABASE_URL")||"https://mpcelmjiycjpdyyflisn.supabase.co";
  const key=serverKey();
  const [assignments,reviews]=await Promise.all([
    rows(base,key,`gold_review_priority_assignments?select=review_request_id,priority_band,priority_score,event_class,transition_code,severity,scoring_version,performance_evidence_used,human_outcome_evidence_used,automatic_execution,automatic_promotion,capital_permission&classifier_version=eq.${CLASSIFIER}&order=priority_score.desc&limit=500`),
    rows(base,key,`gold_human_review_events?select=review_request_id,event_type&event_type=eq.HUMAN_EVIDENCE_REVIEW&classifier_version=eq.${CLASSIFIER}&limit=1000`)
  ]);
  const reviewed=new Set(reviews.map((x:any)=>Number(x.review_request_id)));
  const pending=assignments.filter((x:any)=>!reviewed.has(Number(x.review_request_id)));
  const bands=["P1_HIGH_ATTENTION","P2_PRIORITY","P3_STANDARD","P4_BACKGROUND"].map((band)=>{
    const all=assignments.filter((x:any)=>x.priority_band===band);
    const open=pending.filter((x:any)=>x.priority_band===band);
    return {priority_band:band,total_assignments:all.length,pending_reviews:open.length};
  });
  const scores=pending.map((x:any)=>Number(x.priority_score)).filter(Number.isFinite);
  return {
    ok:true,
    version:VERSION,
    generated_at:new Date().toISOString(),
    classifier_version:CLASSIFIER,
    state:pending.length?"ROUTING_ACTIVE":"WAITING_FOR_DIRECTIONAL_REVIEW_CANDIDATE",
    pipeline:{
      assignments:assignments.length,
      pending_directional_reviews:pending.length,
      reviewed_directional:assignments.length-pending.length,
      high_attention_pending:pending.filter((x:any)=>x.priority_band==="P1_HIGH_ATTENTION").length,
      top_pending_score:scores.length?Math.max(...scores):null
    },
    bands,
    methodology:{
      scoring_version:"v130-rule-v1",
      inputs:["EXPLICIT_DIRECTION","EVENT_CLASS","STATED_SEVERITY","TRANSITION_SPECIFICITY"],
      performance_evidence_used:false,
      human_outcome_evidence_used:false,
      reviewer_reputation_used:false,
      market_future_data_used:false,
      ranking_is_attention_routing_not_trade_signal:true,
      request_ids_public:false
    },
    governance:{
      read_only:true,
      automatic_execution:false,
      automatic_promotion:false,
      review_priority_can_grant_capital:false,
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
      governance:{automatic_execution:false,automatic_promotion:false,review_priority_can_grant_capital:false,capital_permission:"0R"}
    },{status:503,headers:{...CORS,"Cache-Control":"no-store"}});
  }
});