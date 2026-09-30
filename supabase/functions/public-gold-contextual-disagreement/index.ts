import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type, apikey","Access-Control-Allow-Methods":"GET, OPTIONS"};
const VERSION="v129-gold-contextual-disagreement-v1";
const CLASSIFIER="v125.3-event-aware-v2";
const TTL=20_000;
let cache:any=null,cachedAt=0,inflight:Promise<any>|null=null;
function secretKey(){const b=Deno.env.get("SUPABASE_SECRET_KEYS");if(b){try{const p=JSON.parse(b);if(p?.default)return p.default}catch{}}const k=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";if(!k)throw new Error("server_key_unavailable");return k}
async function rows(base:string,key:string,path:string){const r=await fetch(base+"/rest/v1/"+path,{headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error(`postgrest_${r.status}`);const body=await r.json();return Array.isArray(body)?body:[]}
async function build(){
  const base=Deno.env.get("SUPABASE_URL")||"https://mpcelmjiycjpdyyflisn.supabase.co",key=secretKey();
  const [events,cohorts]=await Promise.all([
    rows(base,key,`gold_disagreement_context_events?select=id,horizon_minutes,event_class,transition_code,signal_key,direction,human_stance,comparison_state,human_advantage_score,market_status,session_state,daily_bias,daily_structure,state_phase,path_state,desk_state,long_state,short_state,delayed_feed&classifier_version=eq.${CLASSIFIER}&order=id.asc&limit=2000`),
    rows(base,key,`gold_disagreement_context_cohort_snapshots?select=id,evaluated_at,context_dimension,context_value,horizon_minutes,scorable_disagreements,human_aligned_count,machine_aligned_count,human_alignment_rate_pct,human_wilson_lower_pct,evidence_state,statistics_publication_state,automatic_context_weight,automatic_promotion,capital_permission,source_context_max_id&classifier_version=eq.${CLASSIFIER}&order=evaluated_at.desc&limit=2000`)
  ]);
  const latest=new Map<string,any>();
  for(const x of cohorts){const k=`${x.context_dimension}|${x.context_value}|${x.horizon_minutes}`;if(!latest.has(k))latest.set(k,x)}
  const c=[...latest.values()].map((x:any)=>{const n=Number(x.scorable_disagreements||0),publish=n>=10;return {context_dimension:x.context_dimension,context_value:x.context_value,horizon_minutes:Number(x.horizon_minutes),scorable_disagreements:n,evidence_state:x.evidence_state,statistics_withheld:!publish,minimum_public_sample:10,public_statistics:publish?{human_alignment_rate_pct:x.human_alignment_rate_pct,human_wilson_lower_pct:x.human_wilson_lower_pct,human_aligned_count:Number(x.human_aligned_count||0),machine_aligned_count:Number(x.machine_aligned_count||0)}:null,automatic_context_weight:x.automatic_context_weight,automatic_promotion:x.automatic_promotion===true,capital_permission:x.capital_permission}});
  const scorable=events.filter((x:any)=>x.human_stance==="DISAGREE_WITH_MACHINE"&&(x.human_advantage_score===1||x.human_advantage_score===-1)).length;
  const maxN=c.reduce((m:number,x:any)=>Math.max(m,x.scorable_disagreements||0),0);
  const names=["SESSION_STATE","DAILY_STRUCTURE","STATE_PHASE","DESK_STATE","SIGNAL_FAMILY"];
  const dimensions=names.map(name=>{const a=c.filter((x:any)=>x.context_dimension===name);return {context_dimension:name,cohort_count:a.length,max_scorable_sample:a.reduce((m:number,x:any)=>Math.max(m,x.scorable_disagreements||0),0),public_cohort_count:a.filter((x:any)=>!x.statistics_withheld).length}});
  let state="WAITING_FOR_HUMAN_REVIEW";
  if(events.length>0&&scorable===0)state="NO_SCORABLE_DISAGREEMENT_CONTEXT";
  else if(scorable>0&&maxN<10)state="WITHHELD_SAMPLE_TOO_SMALL";
  else if(maxN>=10&&maxN<30)state="EARLY_CONTEXT_EVIDENCE";
  else if(maxN>=30)state="MATURE_CONTEXT_EVIDENCE";
  return {ok:true,version:VERSION,generated_at:new Date().toISOString(),classifier_version:CLASSIFIER,state,pipeline:{context_events:events.length,scorable_context_events:scorable,cohort_cells:c.length,max_cohort_sample:maxN},dimensions,cohorts:c.sort((a:any,b:any)=>b.scorable_disagreements-a.scorable_disagreements).slice(0,50),methodology:{context_frozen_from_post_review_anchor_snapshot:true,outcome_context_not_reconstructed_after_resolution:true,dimensions:names,explicit_disagreement_only_for_cohort_scoring:true,endpoint_alignment_only:true,trade_pnl_claimed:false,intrabar_sequence_not_inferred:true,reviewer_identity_public:false,reviewer_notes_public:false,minimum_public_sample:10,mature_sample:30,tiny_sample_statistics_withheld:true},governance:{read_only:true,automatic_context_weighting:false,automatic_human_override:false,automatic_machine_override:false,automatic_promotion:false,automatic_orders:false,capital_permission:"0R"}};
}
async function current(){if(cache&&Date.now()-cachedAt<TTL)return cache;if(inflight)return inflight;inflight=build().then(x=>{cache=x;cachedAt=Date.now();return x}).finally(()=>{inflight=null});return inflight}
Deno.serve(async(req:Request)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});if(req.method!=="GET")return Response.json({ok:false,error:"method_not_allowed"},{status:405,headers:CORS});try{return Response.json(await current(),{headers:{...CORS,"Cache-Control":"public, max-age=10, s-maxage=20, stale-while-revalidate=30"}})}catch(error){console.error(error);return Response.json({ok:false,version:VERSION,state:"UNAVAILABLE",governance:{automatic_context_weighting:false,automatic_human_override:false,automatic_machine_override:false,automatic_promotion:false,automatic_orders:false,capital_permission:"0R"}},{status:503,headers:{...CORS,"Cache-Control":"no-store"}})}});