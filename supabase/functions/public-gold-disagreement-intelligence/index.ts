import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type, apikey",
  "Access-Control-Allow-Methods":"GET, OPTIONS"
};
const VERSION="v128-gold-disagreement-intelligence-v1";
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
  const [reviews,outcomes,events]=await Promise.all([
    getRows(base,key,`gold_human_review_events?select=id&event_type=eq.HUMAN_EVIDENCE_REVIEW&classifier_version=eq.${CLASSIFIER}&limit=500`),
    getRows(base,key,`gold_human_review_outcomes?select=id,horizon_minutes&classifier_version=eq.${CLASSIFIER}&limit=2000`),
    getRows(base,key,`gold_human_machine_disagreement_events?select=id,horizon_minutes,human_stance,comparison_state,human_advantage_score&classifier_version=eq.${CLASSIFIER}&order=id.asc&limit=2000`)
  ]);

  const horizons=[15,30,60,120].map((h)=>{
    const rows=events.filter((x:any)=>Number(x.horizon_minutes)===h);
    const agree=rows.filter((x:any)=>x.human_stance==="AGREE_WITH_MACHINE");
    const disagree=rows.filter((x:any)=>x.human_stance==="DISAGREE_WITH_MACHINE");
    const nonDirectional=rows.filter((x:any)=>["INCONCLUSIVE","DEFERRED","UNCLASSIFIED"].includes(String(x.human_stance)));
    const scorable=disagree.filter((x:any)=>x.human_advantage_score===1||x.human_advantage_score===-1);
    const humanWins=scorable.filter((x:any)=>x.human_advantage_score===1).length;
    const machineWins=scorable.filter((x:any)=>x.human_advantage_score===-1).length;
    const agreementScorable=agree.filter((x:any)=>[
      "AGREEMENT_ALIGNED_WITH_ENDPOINT",
      "AGREEMENT_CONTRADICTED_BY_ENDPOINT"
    ].includes(String(x.comparison_state)));
    const agreementAligned=agreementScorable.filter((x:any)=>x.comparison_state==="AGREEMENT_ALIGNED_WITH_ENDPOINT").length;
    const publishDisagreement=scorable.length>=10;
    const publishAgreement=agreementScorable.length>=10;
    return {
      horizon_minutes:h,
      total_events:rows.length,
      agreement_count:agree.length,
      disagreement_count:disagree.length,
      non_directional_count:nonDirectional.length,
      scorable_disagreements:scorable.length,
      human_aligned_in_disagreement:humanWins,
      machine_aligned_in_disagreement:machineWins,
      disagreement_statistics_withheld:!publishDisagreement,
      agreement_statistics_withheld:!publishAgreement,
      minimum_public_sample:10,
      public_disagreement_statistics:publishDisagreement ? {
        human_alignment_rate_pct:Number(((humanWins/scorable.length)*100).toFixed(2)),
        machine_alignment_rate_pct:Number(((machineWins/scorable.length)*100).toFixed(2))
      } : null,
      public_agreement_statistics:publishAgreement ? {
        agreement_endpoint_alignment_rate_pct:Number(((agreementAligned/agreementScorable.length)*100).toFixed(2))
      } : null
    };
  });

  const maxDisagreement=horizons.reduce((m,x)=>Math.max(m,x.scorable_disagreements),0);
  let state="WAITING_FOR_HUMAN_REVIEW";
  if(reviews.length>0&&outcomes.length===0)state="WAITING_FOR_FUTURE_OUTCOMES";
  else if(events.length>0&&maxDisagreement===0)state="NO_SCORABLE_DISAGREEMENT_SAMPLE";
  else if(maxDisagreement>0&&maxDisagreement<10)state="WITHHELD_SAMPLE_TOO_SMALL";
  else if(maxDisagreement>=10&&maxDisagreement<30)state="EARLY_DISAGREEMENT_EVIDENCE";
  else if(maxDisagreement>=30)state="MATURE_DISAGREEMENT_EVIDENCE";

  return {
    ok:true,
    version:VERSION,
    generated_at:new Date().toISOString(),
    classifier_version:CLASSIFIER,
    state,
    pipeline:{
      human_review_events:reviews.length,
      review_outcomes:outcomes.length,
      disagreement_events:events.length,
      max_scorable_disagreement_sample:maxDisagreement
    },
    horizons,
    methodology:{
      derived_only_from_resolved_v127_post_review_outcomes:true,
      disagreement_requires_explicit_human_contradiction:true,
      supportive_review_is_agreement_not_independent_prediction:true,
      inconclusive_and_deferred_not_scored:true,
      endpoint_alignment_only:true,
      trade_pnl_claimed:false,
      intrabar_sequence_not_inferred:true,
      reviewer_identity_public:false,
      reviewer_notes_public:false,
      minimum_public_sample:10,
      mature_sample:30,
      tiny_sample_statistics_withheld:true
    },
    governance:{
      read_only:true,
      automatic_human_override:false,
      automatic_machine_override:false,
      automatic_weighting:false,
      automatic_promotion:false,
      automatic_orders:false,
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
      governance:{automatic_human_override:false,automatic_machine_override:false,automatic_weighting:false,automatic_promotion:false,automatic_orders:false,capital_permission:"0R"}
    },{status:503,headers:{...CORS,"Cache-Control":"no-store"}});
  }
});