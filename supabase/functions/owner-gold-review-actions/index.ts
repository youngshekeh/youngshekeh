import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPA=Deno.env.get("SUPABASE_URL")!;
const CLASSIFIER="v125.3-event-aware-v2";
const VERSION="v130-owner-gold-review-actions-v3";
const DECISIONS=new Set([
  "EVIDENCE_SUPPORTIVE",
  "EVIDENCE_CONTRADICTORY",
  "EVIDENCE_INCONCLUSIVE",
  "DEFERRED"
]);

function serverKey(){
  const bundle=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(bundle){try{const p=JSON.parse(bundle);if(p?.default)return p.default}catch{}}
  const k=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!k)throw new Error("server_key_unavailable");
  return k;
}
function cors(origin:string|null){
  const allowed=new Set([
    "https://thefatheranalytics.com",
    "https://www.thefatheranalytics.com",
    "https://the-father-analytics.vercel.app",
    "https://the-father-analytics-the-father.vercel.app",
    "https://mpcelmjiycjpdyyflisn.supabase.co"
  ]);
  const o=origin&&allowed.has(origin)?origin:"https://thefatheranalytics.com";
  return {
    "Access-Control-Allow-Origin":o,
    "Vary":"Origin",
    "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Content-Type":"application/json",
    "Cache-Control":"no-store"
  };
}
function decodePayload(token:string){
  try{
    const p=token.split(".")[1];
    const s=p.replace(/-/g,"+").replace(/_/g,"/");
    const pad=s+"=".repeat((4-s.length%4)%4);
    return JSON.parse(atob(pad));
  }catch{return {}}
}
async function jsonFetch(url:string,init:RequestInit={}){
  const r=await fetch(url,{...init,signal:AbortSignal.timeout(12000),cache:"no-store"});
  const text=await r.text();
  let data:any={};
  try{data=text?JSON.parse(text):{}}catch{data={message:text}}
  return {r,data};
}
async function restRows(service:string,table:string,params:Record<string,string>){
  const u=new URL(`${SUPA}/rest/v1/${table}`);
  for(const[k,v]of Object.entries(params))u.searchParams.set(k,v);
  const {r,data}=await jsonFetch(u.toString(),{
    headers:{apikey:service,Authorization:`Bearer ${service}`,Accept:"application/json"}
  });
  if(!r.ok)throw new Error(`${table}_${r.status}`);
  return Array.isArray(data)?data:[];
}
async function getUser(token:string,service:string){
  const {r,data}=await jsonFetch(`${SUPA}/auth/v1/user`,{
    headers:{apikey:service,Authorization:`Bearer ${token}`,Accept:"application/json"}
  });
  return r.ok?data:null;
}
async function sha256Hex(value:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
function publicReview(x:any){
  return {
    id:x.id,
    review_request_id:x.review_request_id,
    event_at:x.event_at,
    event_type:x.event_type,
    decision:x.decision,
    reviewer_role:x.reviewer_role??null,
    classifier_version:x.classifier_version??null,
    evidence_sha256:x.evidence_sha256
  };
}

Deno.serve(async(req:Request)=>{
  const headers=cors(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(req.method!=="POST")return new Response(JSON.stringify({ok:false,error:"method_not_allowed"}),{status:405,headers});

  try{
    const auth=req.headers.get("authorization")||"";
    const token=auth.replace(/^Bearer\s+/i,"").trim();
    if(!token)return new Response(JSON.stringify({ok:false,error:"missing_token"}),{status:401,headers});

    const service=serverKey();
    const user=await getUser(token,service);
    if(!user?.id)return new Response(JSON.stringify({ok:false,error:"invalid_session"}),{status:401,headers});

    const owners=await restRows(service,"owner_users",{
      select:"role,active",
      user_id:`eq.${user.id}`,
      active:"eq.true",
      limit:"1"
    });
    const owner=owners?.[0];
    if(!owner)return new Response(JSON.stringify({ok:false,error:"owner_only"}),{status:403,headers});

    const jwt=decodePayload(token);
    if(jwt?.aal!=="aal2"){
      return new Response(JSON.stringify({
        ok:false,error:"aal2_required",owner:true,aal:jwt?.aal||"aal1",
        governance:{human_review_requires_mfa:true,automatic_orders:false,capital_permission:"0R"}
      }),{status:403,headers});
    }

    const input=await req.json().catch(()=>({}));
    const action=String(input?.action||"queue");

    if(action==="queue"){
      const requests=await restRows(service,"gold_trigger_review_requests",{
        select:"id,transition_id,snapshot_id,market_time,event_class,transition_code,signal_key,direction,review_stage,source_state,source_price,request_sha256,classifier_version,requested_at",
        classifier_version:`eq.${CLASSIFIER}`,
        order:"requested_at.desc",
        limit:"100"
      });
      const reviews=await restRows(service,"gold_human_review_events",{
        select:"id,review_request_id,event_at,event_type,decision,reviewer_role,classifier_version,evidence_sha256",
        classifier_version:`eq.${CLASSIFIER}`,
        order:"event_at.desc",
        limit:"200"
      });
      const [anchors,reviewOutcomes,intelligence,priorities]=await Promise.all([
        restRows(service,"gold_human_review_anchors",{
          select:"id,review_event_id,anchor_delay_seconds,created_at",
          reviewer_user_id:`eq.${user.id}`,
          classifier_version:`eq.${CLASSIFIER}`,
          order:"id.desc",
          limit:"200"
        }),
        restRows(service,"gold_human_review_outcomes",{
          select:"id,horizon_minutes,human_alignment_state,human_alignment_score,resolved_at",
          reviewer_user_id:`eq.${user.id}`,
          classifier_version:`eq.${CLASSIFIER}`,
          order:"id.desc",
          limit:"1000"
        }),
        restRows(service,"gold_reviewer_intelligence_snapshots",{
          select:"id,evaluated_at,horizon_minutes,total_outcomes,scorable_count,aligned_count,contradicted_count,neutral_count,unscored_count,supportive_count,contradictory_count,human_alignment_rate_pct,human_wilson_lower_pct,baseline_signal_favorable_rate_pct,observed_value_add_pp,intelligence_state,statistics_publication_state,automatic_weight,automatic_promotion,capital_permission",
          reviewer_user_id:`eq.${user.id}`,
          classifier_version:`eq.${CLASSIFIER}`,
          order:"evaluated_at.desc",
          limit:"100"
        }),
        restRows(service,"gold_review_priority_assignments",{
          select:"review_request_id,scoring_version,severity,direction_score,event_class_score,severity_score,transition_score,priority_score,priority_band,performance_evidence_used,human_outcome_evidence_used,capital_permission",
          classifier_version:`eq.${CLASSIFIER}`,
          order:"priority_score.desc",
          limit:"500"
        })
      ]);

      const histories=new Map<number,any[]>();
      for(const ev of reviews){
        const id=Number(ev.review_request_id);
        if(!histories.has(id))histories.set(id,[]);
        histories.get(id)!.push(ev);
      }
      const priorityByRequest=new Map<number,any>();
      for(const p of priorities)priorityByRequest.set(Number(p.review_request_id),p);

      const directional=requests.filter((x:any)=>["LONG","SHORT"].includes(String(x.direction)));
      const queue=directional
        .map((x:any)=>{
          const history=histories.get(Number(x.id))||[];
          const priority=priorityByRequest.get(Number(x.id))||null;
          return {
            review_request_id:x.id,
            transition_id:x.transition_id,
            snapshot_id:x.snapshot_id,
            market_time:x.market_time,
            event_class:x.event_class,
            transition_code:x.transition_code,
            signal_key:x.signal_key,
            direction:x.direction,
            review_stage:x.review_stage,
            source_state:x.source_state,
            source_price:x.source_price,
            requested_at:x.requested_at,
            priority:priority ? {
              scoring_version:priority.scoring_version,
              severity:priority.severity,
              priority_score:Number(priority.priority_score||0),
              priority_band:priority.priority_band,
              components:{
                direction:Number(priority.direction_score||0),
                event_class:Number(priority.event_class_score||0),
                severity:Number(priority.severity_score||0),
                transition:Number(priority.transition_score||0)
              },
              performance_evidence_used:priority.performance_evidence_used===true,
              human_outcome_evidence_used:priority.human_outcome_evidence_used===true,
              capital_permission:priority.capital_permission||'0R'
            } : null,
            review_history_count:history.length,
            latest_review:history[0]?publicReview(history[0]):null
          };
        })
        .sort((a:any,b:any)=>{
          const ap=a.latest_review?1:0,bp=b.latest_review?1:0;
          if(ap!==bp)return ap-bp;
          const as=Number(a?.priority?.priority_score||0);
          const bs=Number(b?.priority?.priority_score||0);
          if(as!==bs)return bs-as;
          return Date.parse(String(b.requested_at))-Date.parse(String(a.requested_at));
        })
        .slice(0,30);

      const reviewedDirectional=new Set(
        reviews.map((x:any)=>Number(x.review_request_id))
          .filter((id:number)=>directional.some((r:any)=>Number(r.id)===id))
      ).size;

      const latestByHorizon=new Map<number,any>();
      for(const row of intelligence){
        const h=Number(row.horizon_minutes);
        if(!latestByHorizon.has(h))latestByHorizon.set(h,row);
      }
      const intelligenceHorizons=[15,30,60,120].map((h)=>{
        const x=latestByHorizon.get(h);
        const n=Number(x?.scorable_count||0);
        return {
          horizon_minutes:h,
          total_outcomes:Number(x?.total_outcomes||0),
          scorable_count:n,
          aligned_count:Number(x?.aligned_count||0),
          contradicted_count:Number(x?.contradicted_count||0),
          neutral_count:Number(x?.neutral_count||0),
          unscored_count:Number(x?.unscored_count||0),
          intelligence_state:x?.intelligence_state||'WAITING_FOR_SCORABLE_REVIEW',
          statistics_withheld:n<10,
          minimum_sample:10,
          descriptive_statistics:n>=10 ? {
            human_alignment_rate_pct:x?.human_alignment_rate_pct??null,
            human_wilson_lower_pct:x?.human_wilson_lower_pct??null,
            baseline_signal_favorable_rate_pct:x?.baseline_signal_favorable_rate_pct??null,
            observed_value_add_pp:x?.observed_value_add_pp??null
          } : null,
          automatic_weight:x?.automatic_weight??null,
          automatic_promotion:x?.automatic_promotion===true,
          capital_permission:x?.capital_permission||'0R'
        };
      });
      const maxScorable=intelligenceHorizons.reduce((m,x)=>Math.max(m,x.scorable_count),0);
      const reviewIntelligenceState=
        reviews.length===0 ? 'WAITING_FOR_HUMAN_REVIEW'
        : anchors.length===0 ? 'WAITING_FOR_POST_REVIEW_ANCHOR'
        : reviewOutcomes.length===0 ? 'WAITING_FOR_FUTURE_OUTCOMES'
        : maxScorable<10 ? 'WITHHELD_SAMPLE_TOO_SMALL'
        : maxScorable<30 ? 'EARLY_REVIEW_EVIDENCE'
        : 'MATURE_REVIEW_EVIDENCE';

      return new Response(JSON.stringify({
        ok:true,
        version:VERSION,
        generated_at:new Date().toISOString(),
        classifier_version:CLASSIFIER,
        owner_role:owner.role,
        aal:"aal2",
        review_priority:{
          state:priorities.length ? 'ROUTING_ACTIVE' : 'WAITING_FOR_PRIORITY_ASSIGNMENTS',
          scoring_version:'v130-rule-v1',
          assignments:priorities.length,
          pending_directional:Math.max(0,directional.length-reviewedDirectional),
          high_attention_pending:queue.filter((x:any)=>!x.latest_review&&x?.priority?.priority_band==='P1_HIGH_ATTENTION').length,
          methodology:{
            inputs:['EXPLICIT_DIRECTION','EVENT_CLASS','STATED_SEVERITY','TRANSITION_SPECIFICITY'],
            performance_evidence_used:false,
            human_outcome_evidence_used:false,
            reviewer_reputation_used:false,
            market_future_data_used:false,
            ranking_is_attention_routing_not_trade_signal:true
          },
          governance:{
            automatic_execution:false,
            automatic_promotion:false,
            review_priority_can_grant_capital:false,
            capital_permission:'0R'
          }
        },
        review_intelligence:{
          state:reviewIntelligenceState,
          post_review_anchors:anchors.length,
          resolved_review_outcomes:reviewOutcomes.length,
          max_scorable_sample:maxScorable,
          horizons:intelligenceHorizons,
          governance:{
            descriptive_only:true,
            automatic_weighting:false,
            automatic_promotion:false,
            human_review_can_grant_capital:false,
            capital_permission:'0R'
          }
        },
        counts:{
          current_candidates:requests.length,
          directional_candidates:directional.length,
          unclassified_candidates:requests.length-directional.length,
          reviewed_directional:reviewedDirectional,
          pending_directional:Math.max(0,directional.length-reviewedDirectional),
          human_review_events:reviews.length
        },
        queue,
        decision_options:[...DECISIONS],
        governance:{
          owner_only:true,
          aal2_required:true,
          append_only_reviews:true,
          review_is_evidence_judgment_not_trade_approval:true,
          human_review_can_grant_capital:false,
          automatic_orders:false,
          automatic_promotion:false,
          capital_permission:"0R"
        }
      }),{headers});
    }

    if(action==="record"){
      const requestId=Number(input?.review_request_id);
      const decision=String(input?.decision||"");
      const note=String(input?.note||"").trim().slice(0,500);
      if(!Number.isInteger(requestId)||requestId<=0){
        return new Response(JSON.stringify({ok:false,error:"invalid_review_request_id"}),{status:400,headers});
      }
      if(!DECISIONS.has(decision)){
        return new Response(JSON.stringify({ok:false,error:"invalid_decision"}),{status:400,headers});
      }

      const requests=await restRows(service,"gold_trigger_review_requests",{
        select:"id,transition_id,snapshot_id,market_time,event_class,transition_code,signal_key,direction,review_stage,source_state,source_price,request_sha256,classifier_version",
        id:`eq.${requestId}`,
        classifier_version:`eq.${CLASSIFIER}`,
        limit:"1"
      });
      const reviewRequest=requests?.[0];
      if(!reviewRequest){
        return new Response(JSON.stringify({ok:false,error:"review_request_not_found"}),{status:404,headers});
      }
      if(!["LONG","SHORT"].includes(String(reviewRequest.direction))){
        return new Response(JSON.stringify({ok:false,error:"unclassified_signal_not_reviewable"}),{status:409,headers});
      }

      const canonical=JSON.stringify({
        classifier_version:CLASSIFIER,
        review_request_id:reviewRequest.id,
        review_request_sha256:reviewRequest.request_sha256,
        reviewer_user_id:user.id,
        decision,
        note
      });
      const evidenceSha=await sha256Hex(canonical);

      const existing=await restRows(service,"gold_human_review_events",{
        select:"id,review_request_id,event_at,event_type,decision,reviewer_role,classifier_version,evidence_sha256",
        evidence_sha256:`eq.${evidenceSha}`,
        limit:"1"
      });
      if(existing?.[0]){
        return new Response(JSON.stringify({
          ok:true,version:VERSION,duplicate:true,event:publicReview(existing[0]),
          governance:{human_review_can_grant_capital:false,automatic_orders:false,capital_permission:"0R"}
        }),{headers});
      }

      const eventAt=new Date().toISOString();
      const payload={
        review_request_id:reviewRequest.id,
        event_at:eventAt,
        event_type:"HUMAN_EVIDENCE_REVIEW",
        reviewer_source:"OWNER_AAL2",
        reviewer_user_id:user.id,
        reviewer_role:String(owner.role||"owner"),
        classifier_version:CLASSIFIER,
        review_request_sha256:reviewRequest.request_sha256,
        decision,
        note:note||null,
        decision_context:{
          transition_id:reviewRequest.transition_id,
          snapshot_id:reviewRequest.snapshot_id,
          market_time:reviewRequest.market_time,
          event_class:reviewRequest.event_class,
          transition_code:reviewRequest.transition_code,
          signal_key:reviewRequest.signal_key,
          direction:reviewRequest.direction,
          review_stage:reviewRequest.review_stage,
          source_state:reviewRequest.source_state,
          source_price:reviewRequest.source_price
        },
        evidence_sha256:evidenceSha
      };

      const {r,data}=await jsonFetch(`${SUPA}/rest/v1/gold_human_review_events`,{
        method:"POST",
        headers:{
          apikey:service,
          Authorization:`Bearer ${service}`,
          "Content-Type":"application/json",
          Prefer:"return=representation"
        },
        body:JSON.stringify(payload)
      });
      if(!r.ok)throw new Error(`gold_human_review_events_insert_${r.status}`);
      const event=Array.isArray(data)?data[0]:data;

      return new Response(JSON.stringify({
        ok:true,
        version:VERSION,
        duplicate:false,
        event:publicReview(event),
        reviewed_signal:{
          signal_key:reviewRequest.signal_key,
          direction:reviewRequest.direction,
          review_stage:reviewRequest.review_stage
        },
        governance:{
          append_only:true,
          evidence_judgment_only:true,
          human_review_can_grant_capital:false,
          automatic_orders:false,
          automatic_promotion:false,
          capital_permission:"0R"
        }
      }),{headers});
    }

    return new Response(JSON.stringify({ok:false,error:"unknown_action"}),{status:400,headers});
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ok:false,error:"owner_review_unavailable",detail:String((e as any)?.message||e).slice(0,180)}),{status:500,headers});
  }
});