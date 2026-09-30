import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type, apikey",
  "Access-Control-Allow-Methods":"GET, OPTIONS"
};
const VERSION="v127-gold-review-intelligence-v1";
const CLASSIFIER="v125.3-event-aware-v2";
const TTL=20_000;
let cache:any=null,cachedAt=0,inflight:Promise<any>|null=null;

function secretKey(){
  const bundle=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(bundle){try{const p=JSON.parse(bundle);if(p?.default)return p.default}catch{}}
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!legacy)throw new Error("server_key_unavailable");
  return legacy;
}
async function getRows(base:string,key:string,path:string){
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
  const [reviews,anchors,outcomes]=await Promise.all([
    getRows(base,key,`gold_human_review_events?select=id,review_request_id,event_at,decision,classifier_version&event_type=eq.HUMAN_EVIDENCE_REVIEW&classifier_version=eq.${CLASSIFIER}&order=id.asc&limit=500`),
    getRows(base,key,`gold_human_review_anchors?select=id,review_event_id,decision,direction,anchor_delay_seconds,classifier_version&classifier_version=eq.${CLASSIFIER}&order=id.asc&limit=500`),
    getRows(base,key,`gold_human_review_outcomes?select=id,anchor_id,review_event_id,decision,direction,horizon_minutes,baseline_signal_state,human_alignment_state,human_alignment_score,classifier_version&classifier_version=eq.${CLASSIFIER}&order=id.asc&limit=2000`)
  ]);

  const horizons=[15,30,60,120].map((h)=>{
    const rows=outcomes.filter((x:any)=>Number(x.horizon_minutes)===h);
    const scorable=rows.filter((x:any)=>x.human_alignment_score===0||x.human_alignment_score===1);
    const aligned=scorable.filter((x:any)=>x.human_alignment_score===1).length;
    const baseline=scorable.filter((x:any)=>x.baseline_signal_state==="FAVORABLE_ENDPOINT").length;
    const publish=scorable.length>=10;
    const rate=scorable.length?aligned/scorable.length:null;
    const baseRate=scorable.length?baseline/scorable.length:null;
    return {
      horizon_minutes:h,
      total_outcomes:rows.length,
      scorable_count:scorable.length,
      aligned_count:aligned,
      contradicted_count:scorable.length-aligned,
      neutral_count:rows.filter((x:any)=>x.human_alignment_state==="NEUTRAL_ENDPOINT").length,
      unscored_count:rows.filter((x:any)=>x.human_alignment_state==="UNSCORED_BY_DESIGN").length,
      statistics_withheld:!publish,
      minimum_public_sample:10,
      public_statistics:publish ? {
        human_alignment_rate_pct:Number((rate!*100).toFixed(2)),
        baseline_signal_favorable_rate_pct:Number((baseRate!*100).toFixed(2)),
        observed_value_add_pp:Number(((rate!-baseRate!)*100).toFixed(2))
      } : null
    };
  });

  const maxScorable=horizons.reduce((m,x)=>Math.max(m,x.scorable_count),0);
  let state="WAITING_FOR_HUMAN_REVIEW";
  if(reviews.length>0&&anchors.length===0)state="WAITING_FOR_POST_REVIEW_ANCHOR";
  else if(anchors.length>0&&outcomes.length===0)state="WAITING_FOR_FUTURE_OUTCOMES";
  else if(maxScorable>0&&maxScorable<10)state="WITHHELD_SAMPLE_TOO_SMALL";
  else if(maxScorable>=10&&maxScorable<30)state="EARLY_REVIEW_EVIDENCE";
  else if(maxScorable>=30)state="MATURE_REVIEW_EVIDENCE";

  const delays=anchors.map((x:any)=>Number(x.anchor_delay_seconds)).filter(Number.isFinite);
  return {
    ok:true,
    version:VERSION,
    generated_at:new Date().toISOString(),
    classifier_version:CLASSIFIER,
    state,
    pipeline:{
      human_review_events:reviews.length,
      post_review_anchors:anchors.length,
      resolved_review_outcomes:outcomes.length,
      max_scorable_sample:maxScorable,
      average_anchor_delay_seconds:delays.length
        ? Number((delays.reduce((a:number,b:number)=>a+b,0)/delays.length).toFixed(2))
        : null
    },
    horizons,
    methodology:{
      post_review_server_capture_anchor:true,
      future_windows_start_from_post_review_anchor:true,
      market_time_based:true,
      two_minute_snapshot_observed:true,
      endpoint_alignment_only:true,
      trade_pnl_claimed:false,
      intrabar_sequence_not_inferred:true,
      inconclusive_and_deferred_unscored:true,
      minimum_public_sample:10,
      mature_sample:30,
      tiny_sample_statistics_withheld:true,
      reviewer_identity_public:false,
      reviewer_notes_public:false
    },
    governance:{
      read_only:true,
      human_review_required_for_human_evidence:true,
      automatic_weighting:false,
      automatic_promotion:false,
      automatic_orders:false,
      human_review_can_grant_capital:false,
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
      governance:{automatic_weighting:false,automatic_promotion:false,automatic_orders:false,human_review_can_grant_capital:false,capital_permission:"0R"}
    },{status:503,headers:{...CORS,"Cache-Control":"no-store"}});
  }
});