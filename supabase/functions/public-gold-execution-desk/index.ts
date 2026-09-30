import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type, authorization, apikey",
  "Access-Control-Allow-Methods":"GET, OPTIONS"
};
const BASE="https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1";
const VERSION="v120-gold-live-execution-desk-v3-permission-semantics";
const TTL=20_000;
let cache:any=null,cachedAt=0,inflight:Promise<any>|null=null;

async function get(path:string,timeout=7000){
  const started=Date.now();
  try{
    const r=await fetch(`${BASE}/${path}`,{
      headers:{Accept:"application/json","User-Agent":"THE-FATHER-ANALYTICS/117.0"},
      signal:AbortSignal.timeout(timeout),
      cache:"no-store"
    });
    const body=await r.json().catch(()=>null);
    return {ok:r.ok&&body?.ok!==false,status:r.status,latency_ms:Date.now()-started,body};
  }catch(error){
    return {ok:false,status:0,latency_ms:Date.now()-started,body:null,error:String(error).slice(0,140)};
  }
}
function n(v:any){if(v===null||v===undefined||v==="")return null;const x=Number(v);return Number.isFinite(x)?x:null}
function round(v:any,d=2){const x=n(v);return x==null?null:Number(x.toFixed(d))}
function asset(body:any,key:string){return Array.isArray(body?.assets)?body.assets.find((x:any)=>x?.key===key):null}
function tf(body:any,key:string,frame:string){return asset(body,key)?.timeframes?.find?.((x:any)=>x?.timeframe===frame)||null}
function rr(direction:"long"|"short",entry:any,invalidation:any,target:any){
  const e=n(entry),i=n(invalidation),t=n(target);
  if(e==null||i==null||t==null)return null;
  const risk=direction==="long"?e-i:i-e;
  const reward=direction==="long"?t-e:e-t;
  if(!(risk>0)||!(reward>0))return null;
  return round(reward/risk,2);
}
function between(x:any,a:any,b:any){const v=n(x),lo=n(a),hi=n(b);return v!=null&&lo!=null&&hi!=null&&v>=Math.min(lo,hi)&&v<=Math.max(lo,hi)}
function statusText(v:any){return String(v??"UNKNOWN").toUpperCase()}
function zonedClock(now:Date,timeZone:string){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone,hour:"2-digit",minute:"2-digit",hour12:false,weekday:"short"}).formatToParts(now);
  const get=(t:string)=>parts.find(p=>p.type===t)?.value||"";
  const hour=Number(get("hour")),minute=Number(get("minute"));
  return {day:get("weekday"),hour,minute,minuteOfDay:hour*60+minute,label:`${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`};
}
function goldSessionClock(now=new Date()){
  const london=zonedClock(now,"Europe/London");
  const ny=zonedClock(now,"America/New_York");
  const weekday=(d:string)=>!["Sat","Sun"].includes(d);
  const londonActive=weekday(london.day)&&london.minuteOfDay>=8*60&&london.minuteOfDay<16*60;
  const nyActive=weekday(ny.day)&&ny.minuteOfDay>=8*60+20&&ny.minuteOfDay<13*60+30;
  const activeSessions:string[]=[];
  if(londonActive)activeSessions.push("LONDON_FRAMEWORK");
  if(nyActive)activeSessions.push("NEW_YORK_COMEX");

  if(nyActive){
    const forming=ny.minuteOfDay<8*60+50;
    return {
      state:forming?"NY_OPENING_RANGE_FORMING":"NEW_YORK_ACTIVE",
      primary_session:"NEW_YORK_COMEX",
      active_sessions:activeSessions,
      direction:"UNCONFIRMED",
      quality:null,
      ib_state:ny.minuteOfDay<9*60+20?"NY_INITIAL_BALANCE_FORMING":"NY_INITIAL_BALANCE_TIME_COMPLETE",
      anchor:"COMEX 08:20 New York · framework OR 30m",
      london_time:london.label,
      new_york_time:ny.label
    };
  }
  if(londonActive){
    const forming=london.minuteOfDay<8*60+30;
    return {
      state:forming?"LONDON_OPENING_RANGE_FORMING":"LONDON_ACTIVE",
      primary_session:"LONDON_FRAMEWORK",
      active_sessions:activeSessions,
      direction:"UNCONFIRMED",
      quality:null,
      ib_state:london.minuteOfDay<9*60?"LONDON_INITIAL_BALANCE_FORMING":"LONDON_INITIAL_BALANCE_TIME_COMPLETE",
      anchor:"London framework 08:00 local · OR 30m · not a centralized exchange open",
      london_time:london.label,
      new_york_time:ny.label
    };
  }

  const weekend=!weekday(london.day)&&!weekday(ny.day);
  return {
    state:weekend?"WEEKEND":"OUTSIDE_PRIMARY_REVIEW_WINDOW",
    primary_session:"NONE",
    active_sessions:activeSessions,
    direction:"NEUTRAL",
    quality:null,
    ib_state:weekend?"WEEKEND":"OUTSIDE_PRIMARY_REVIEW_WINDOW",
    anchor:"Primary manual-review windows: London framework 08:00–16:00 local; COMEX New York 08:20–13:30 local",
    london_time:london.label,
    new_york_time:ny.label
  };
}

async function build(){
  const [live,zones,bias]=await Promise.all([
    get("public-gold-live-api",9000),
    get("public-market-zones",7000),
    get("public-daily-bias",7000)
  ]);

  const l=live.body||{};
  const zDaily=tf(zones.body,"gold","daily")||{};
  const zWeekly=tf(zones.body,"gold","weekly")||{};
  const b=asset(bias.body,"gold")||{};
  const o=goldSessionClock();
  const engine=l?.engine||{};
  const futures=l?.feed?.gold_futures||l?.feed?.gold||{};
  const price=n(futures?.price);
  const marketStatus=statusText(l?.market_status);
  const delayed=engine?.delayed_feed===true||marketStatus==="DELAYED_LIVE";
  const hardStale=engine?.stale_data===true||["STALE","UNAVAILABLE","UNKNOWN"].includes(marketStatus);
  const executionQuoteAllowed=marketStatus==="LIVE_BETA"&&!delayed&&!hardStale;
  const brokerFeedRequired=!executionQuoteAllowed;

  const prevHigh=n(zDaily?.reference?.high);
  const prevLow=n(zDaily?.reference?.low);
  const prevMid=n(zDaily?.reference?.midpoint);
  const priorRange=n(zDaily?.reference?.range);
  const currentHigh=n(zDaily?.current_period?.high);
  const currentLow=n(zDaily?.current_period?.low);
  const weeklyLower=n(zWeekly?.tradeable_zones?.lower_liquidity);
  const buffer=priorRange==null?null:Math.max(1,priorRange*0.05);
  const longZoneLow=prevHigh;
  const longZoneHigh=prevHigh!=null&&buffer!=null?prevHigh+buffer:null;
  const shortConfirm=prevHigh!=null&&buffer!=null?prevHigh-buffer:null;

  const longPrimaryRR=rr("long",prevHigh,currentLow,currentHigh);
  const longExtensionRR=rr("long",prevHigh,currentLow,weeklyLower);
  const shortPrimaryRR=rr("short",prevHigh,currentHigh,currentLow);
  const shortExtensionRR=rr("short",prevHigh,currentHigh,prevLow);

  const dailyStructure=statusText(b?.daily_structure);
  const dailyBias=statusText(b?.daily_bias);
  const openingState=statusText(o?.state);
  const signalStatus="LIVE_DESK";
  const sourceFreshness=statusText(b?.source_freshness);
  const priceAbovePrevHigh=price!=null&&prevHigh!=null&&price>prevHigh;
  const longStructure=dailyStructure.includes("UPSIDE_BREAKOUT_HELD");
  const shortStructure=dailyStructure.includes("FAILED")||dailyStructure.includes("DOWNSIDE");
  const longInZone=between(price,longZoneLow,longZoneHigh);
  const shortTriggered=price!=null&&shortConfirm!=null&&price<shortConfirm;

  const longReasons:string[]=[];
  if(!longStructure)longReasons.push("UPSIDE_STRUCTURE_NOT_HELD");
  if(!longInZone)longReasons.push(priceAbovePrevHigh?"PRICE_ABOVE_RETEST_ZONE":"PRICE_BELOW_BREAKOUT_LEVEL");
  if((longExtensionRR??0)<2)longReasons.push("EXTENSION_RR_BELOW_2");
  if(!["LONDON_ACTIVE","NEW_YORK_ACTIVE"].includes(openingState))longReasons.push("PRIMARY_SESSION_REVIEW_WINDOW_NOT_READY");
  if(hardStale)longReasons.push("MARKET_SPINE_STALE");
  if(brokerFeedRequired)longReasons.push("BROKER_EXECUTION_FEED_REQUIRED");
  if(dailyBias==="NEUTRAL")longReasons.push("DAILY_BIAS_NEUTRAL");

  const shortReasons:string[]=[];
  if(!shortStructure)shortReasons.push("FAILED_BREAKOUT_NOT_CONFIRMED");
  if(!shortTriggered)shortReasons.push("PRICE_HAS_NOT_ACCEPTED_BACK_BELOW_FAILURE_THRESHOLD");
  if((shortPrimaryRR??0)<1.5)shortReasons.push("PRIMARY_RR_BELOW_1_5");
  if(!["LONDON_ACTIVE","NEW_YORK_ACTIVE"].includes(openingState))shortReasons.push("PRIMARY_SESSION_REVIEW_WINDOW_NOT_READY");
  if(hardStale)shortReasons.push("MARKET_SPINE_STALE");
  if(brokerFeedRequired)shortReasons.push("BROKER_EXECUTION_FEED_REQUIRED");

  const longEligible=longReasons.filter(x=>!["BROKER_EXECUTION_FEED_REQUIRED"].includes(x)).length===0;
  const shortEligible=shortReasons.filter(x=>!["BROKER_EXECUTION_FEED_REQUIRED"].includes(x)).length===0;

  let deskState="WAIT";
  if(hardStale)deskState="WAIT_DATA";
  else if(longEligible)deskState="LONG_MANUAL_REVIEW";
  else if(shortEligible)deskState="SHORT_MANUAL_REVIEW";
  else if(longStructure&&priceAbovePrevHigh)deskState="WATCH_LONG_RETEST";
  else if(priceAbovePrevHigh)deskState="WATCH_BREAKOUT";
  else deskState="WAIT_FOR_CONFIRMATION";

  const researchAction=statusText(engine?.action||"WAIT");
  const researchRiskSuggestion=String(engine?.capital_permission||"0R");
  const systemAction="WAIT";
  const systemPermission="0R";

  return {
    ok:true,
    version:VERSION,
    generated_at:new Date().toISOString(),
    desk_state:deskState,
    market:{
      symbol:"GC=F",
      basis:"COMEX Gold futures structural engine",
      market_status:marketStatus,
      engine_state:statusText(engine?.state),
      price:round(price,2),
      market_time:futures?.market_time??null,
      delayed_feed:delayed,
      hard_stale:hardStale,
      broker_execution_feed_required:brokerFeedRequired,
      execution_quote_allowed:executionQuoteAllowed,
      quote_age_minutes:round(engine?.oldest_key_quote_age_minutes,1),
      us10y_context_stale:engine?.yield_context_stale===true,
      us10y_quote_age_minutes:round(engine?.us10y_quote_age_minutes,1)
    },
    session:{
      opening_state:openingState,
      primary_session:o?.primary_session??"NONE",
      active_sessions:o?.active_sessions??[],
      opening_direction:statusText(o?.direction),
      opening_quality_score:n(o?.quality),
      initial_balance_state:statusText(o?.ib_state),
      framework_anchor:o?.anchor??null,
      london_time:o?.london_time??null,
      new_york_time:o?.new_york_time??null
    },
    structure:{
      daily_bias:dailyBias,
      daily_structure:dailyStructure,
      state_phase:statusText(b?.state_phase),
      path_state:statusText(b?.path_state),
      source_freshness:sourceFreshness,
      previous_day:{high:prevHigh,mid:prevMid,low:prevLow,range:priorRange},
      current_day:{high:currentHigh,low:currentLow},
      weekly_lower_liquidity:weeklyLower,
      current_location:zDaily?.location??null,
      current_position_pct:n(zDaily?.position_pct)
    },
    scenarios:{
      long_continuation:{
        state:longEligible?"MANUAL_REVIEW_ELIGIBLE":longStructure&&priceAbovePrevHigh?"WATCH_RETEST":"NOT_CONFIRMED",
        trigger:"Hold/retest above prior-day high after acceptance; do not chase extension.",
        retest_zone:{low:round(longZoneLow,2),high:round(longZoneHigh,2)},
        structural_invalidation:round(currentLow,2),
        primary_target:round(currentHigh,2),
        extension_target:round(weeklyLower,2),
        rr_at_prior_high:{primary:longPrimaryRR,extension:longExtensionRR},
        reasons:longReasons
      },
      failed_break_short:{
        state:shortEligible?"MANUAL_REVIEW_ELIGIBLE":"NOT_CONFIRMED",
        trigger:"Upside breakout fails, then price accepts back below the failure threshold.",
        failure_threshold:round(shortConfirm,2),
        reference_entry:round(prevHigh,2),
        structural_invalidation:round(currentHigh,2),
        primary_target:round(currentLow,2),
        extension_target:round(prevLow,2),
        rr_at_prior_high:{primary:shortPrimaryRR,extension:shortExtensionRR},
        reasons:shortReasons
      }
    },
    execution:{
      system_action:systemAction,
      system_capital_permission:systemPermission,
      research_action:researchAction,
      research_risk_suggestion:researchRiskSuggestion,
      research_sizing_is_not_capital_permission:true,
      live_engine_may_auto_execute:false,
      manual_review_required:true,
      current_setup_executable_by_machine:false,
      broker_feed_rule:"Use broker XAUUSD/GC bid-ask for any real order. This desk's delayed structural feed is not an execution quote.",
      chasing_rule:"Do not enter solely because price is beyond a breakout level. Require retest/acceptance or failed-break confirmation.",
      capital_firewall:{system_permission:systemPermission},
      legacy_compiler:{state:"REMOVED_FROM_HOT_PATH",reason:"The legacy F1/S1 compiler reads historical capture lanes and is not allowed to block the V117 live structural desk."}
    },
    current_read:{
      status:signalStatus,
      action_permitted:String(b?.action_permitted??"WAIT"),
      capital_permission:String(b?.capital_permission??"0R"),
      note:deskState==="WATCH_LONG_RETEST"
        ?"Upside structure is holding above the prior-day high, but current price is extended beyond the retest zone. Wait for a retest or a new accepted structure."
        :deskState==="SHORT_MANUAL_REVIEW"
          ?"A failed-break short has met structural review conditions. Confirm on the broker feed before any manual order."
          :"No machine-authorized trade is active."
    },
    upstream_health:{
      gold_live:{ok:live.ok,status:live.status,latency_ms:live.latency_ms},
      zones:{ok:zones.ok,status:zones.status,latency_ms:zones.latency_ms},
      bias:{ok:bias.ok,status:bias.status,latency_ms:bias.latency_ms},
      session_clock:{ok:true,status:200,latency_ms:0,source:"LOCAL_MULTI_SESSION_CLOCK"}
    },
    governance:{
      research_beta:true,
      research_sizing_separated_from_executable_permission:true,
      no_automatic_orders:true,
      delayed_feed_never_used_as_execution_quote:true,
      manual_review_required:true,
      system_permission_is_hard_ceiling:true,
      permission_can_never_be_promoted_by_this_endpoint:true
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
      headers:{...CORS,"Cache-Control":"public, max-age=10, s-maxage=20, stale-while-revalidate=30","X-TFA-Engine":"V117-GOLD-DESK"}
    });
  }catch(error){
    console.error(error);
    return Response.json({
      ok:false,version:VERSION,state:"UNAVAILABLE",generated_at:new Date().toISOString(),
      execution:{system_action:"WAIT",system_capital_permission:"0R",live_engine_may_auto_execute:false}
    },{status:503,headers:{...CORS,"Cache-Control":"no-store"}});
  }
});