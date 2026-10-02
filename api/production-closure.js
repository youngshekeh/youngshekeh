import { getVercelOidcToken } from '@vercel/oidc';

const SUPABASE_FUNCTIONS='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1';
const DEPENDENCY_TIMEOUT_MS=6000;
const PRESSURE_CONTROL_VERSION='v176.1';

const PUBLIC_ENDPOINTS={
  desk:'public-gold-execution-desk',
  governor:'public-gold-opportunity-governor',
  reality:'public-gold-execution-reality',
  brokerLab:'public-gold-broker-adapter-lab',
  sandbox:'broker-sandbox-receipt-intake',
  sandboxBridge:'broker-sandbox-bridge-intake',
  sandboxBridgeHealth:'broker-sandbox-bridge-health',
  liveXauusd:'broker-live-market-intake'
};

const PRIVATE_ENDPOINTS={
  admission:'runtime-v159-latest-experiment-admission',
  handoff:'runtime-v165-safe-alternative-admission-handoff'
};

function unique(values){
  return [...new Set(values.filter(Boolean).map(String))];
}

async function fetchJson(url,headers={},timeout=DEPENDENCY_TIMEOUT_MS){
  const started=Date.now();
  try{
    const response=await fetch(url,{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-V166-PRODUCTION-CLOSURE/1.0',...headers},
      cache:'no-store',
      signal:AbortSignal.timeout(timeout)
    });
    const body=await response.json().catch(()=>null);
    return {
      ok:response.ok&&body?.ok!==false,
      status:response.status,
      latency_ms:Date.now()-started,
      body
    };
  }catch(error){
    return {
      ok:false,
      status:0,
      latency_ms:Date.now()-started,
      body:null,
      error:String(error).slice(0,180)
    };
  }
}

function failClosed(res,status,error,detail){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Engine','V166');
  res.setHeader('X-TFA-Pressure-Control','V176.1');
  res.setHeader('X-TFA-Bridge','V184');
  res.setHeader('X-TFA-Bridge-Health','V185');
  res.setHeader('X-TFA-Live-XAUUSD','V186');
  res.setHeader('X-TFA-Sandbox','V183');
  return res.status(status).json({
    ok:false,
    version:'v166-production-closure-gate-v1',
    state:'FAIL_CLOSED',
    error,
    detail:detail?String(detail).slice(0,180):undefined,
    closure:{
      platform_research_ready:false,
      autonomous_paper_ready:false,
      scheduler_review_ready:false,
      live_execution_ready:false
    },
    governance:{
      action_permitted:'WAIT',
      capital_permission:'0R',
      live_order_routing:false,
      order_submission_enabled:false,
      automatic_real_capital:false,
      automatic_rescheduling:false,
      automatic_rollback:false,
      human_release_required:true
    }
  });
}

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return failClosed(res,405,'method_not_allowed');
  }

  let oidcToken='';
  try{oidcToken=await getVercelOidcToken();}catch{}
  if(!oidcToken)return failClosed(res,503,'vercel_workload_identity_unavailable');

  const privateHeaders={Authorization:`Bearer ${oidcToken}`};

  const [deskR,governorR,realityR,brokerLabR,sandboxR,sandboxBridgeR,sandboxBridgeHealthR,liveXauusdR,admissionR,handoffR]=await Promise.all([
    fetchJson(`${SUPABASE_FUNCTIONS}/${PUBLIC_ENDPOINTS.desk}`),
    fetchJson(`${SUPABASE_FUNCTIONS}/${PUBLIC_ENDPOINTS.governor}`),
    fetchJson(`${SUPABASE_FUNCTIONS}/${PUBLIC_ENDPOINTS.reality}`),
    fetchJson(`${SUPABASE_FUNCTIONS}/${PUBLIC_ENDPOINTS.brokerLab}`),
    fetchJson(`${SUPABASE_FUNCTIONS}/${PUBLIC_ENDPOINTS.sandbox}`),
    fetchJson(`${SUPABASE_FUNCTIONS}/${PUBLIC_ENDPOINTS.sandboxBridge}`),
    fetchJson(`${SUPABASE_FUNCTIONS}/${PUBLIC_ENDPOINTS.sandboxBridgeHealth}`),
    fetchJson(`${SUPABASE_FUNCTIONS}/${PUBLIC_ENDPOINTS.liveXauusd}`),
    fetchJson(`${SUPABASE_FUNCTIONS}/${PRIVATE_ENDPOINTS.admission}`,privateHeaders),
    fetchJson(`${SUPABASE_FUNCTIONS}/${PRIVATE_ENDPOINTS.handoff}`,privateHeaders)
  ]);

  const desk=deskR.body||{};
  const governor=governorR.body||{};
  const reality=realityR.body||{};
  const brokerLab=brokerLabR.body||{};
  const sandbox=sandboxR.body||{};
  const sandboxBridge=sandboxBridgeR.body||{};
  const sandboxBridgeHealth=sandboxBridgeHealthR.body||{};
  const liveXauusd=liveXauusdR.body||{};
  const admission=admissionR.body||{};
  const handoff=handoffR.body||{};

  const dependencyHealth={
    gold_execution_desk:deskR.ok,
    opportunity_governor:governorR.ok,
    execution_reality:realityR.ok,
    broker_adapter_lab:brokerLabR.ok,
    scheduler_admission:admissionR.ok,
    safe_alternative_handoff:handoffR.ok,
    live_xauusd_market_data:liveXauusdR.ok
  };

  const allDependenciesHealthy=Object.values(dependencyHealth).every(Boolean);

  const market=desk?.market||{};
  const marketObserved=deskR.ok&&Number.isFinite(Number(market?.price));
  const marketDataUsable=marketObserved&&market?.hard_stale!==true;
  const executionGradeQuote=market?.execution_quote_allowed===true&&market?.delayed_feed!==true;
  const researchReady=marketDataUsable&&desk?.execution?.system_capital_permission==='0R';

  const paperReady=
    governorR.ok&&
    governor?.governance?.autonomous_paper_allocation===true&&
    governor?.decision?.autonomous_mode==='PAPER_ONLY'&&
    governor?.governance?.live_trading_enabled===false&&
    governor?.governance?.order_submission_enabled===false&&
    governor?.governance?.real_capital_permission==='0R';

  const schedulerReady=
    admissionR.ok&&handoffR.ok&&
    admission?.state==='READY_FOR_NEXT_HUMAN_REVIEW'&&
    admission?.admission?.admitted===true&&
    Number(admission?.admission?.gates_passed||0)===Number(admission?.admission?.gate_count||0)&&
    handoff?.state==='HANDOFF_CLEAR_FOR_HUMAN_REVIEW'&&
    handoff?.revalidation?.clear===true&&
    handoff?.selected_candidate?.apply===false&&
    handoff?.governance?.human_review_required===true;

  const productionPrereqs=governor?.production_prerequisites||{};
  const productionPrereqValues=Object.values(productionPrereqs);
  const productionPrereqsAllPresent=
    productionPrereqValues.length>0&&productionPrereqValues.every(Boolean);

  const liveExecutionReady=
    governorR.ok&&realityR.ok&&brokerLabR.ok&&
    governor?.decision?.manual_live_review_eligible===true&&
    productionPrereqsAllPresent&&
    reality?.governance?.live_trading_enabled===false&&
    reality?.governance?.order_submission_enabled===false;

  const researchSample=Number(reality?.research?.resolved_sample||0);
  const matureSampleRequired=Number(reality?.research?.mature_research_sample||30);

  const blockers=unique([
    ...(!allDependenciesHealthy?['DEPENDENCY_HEALTH_INCOMPLETE']:[]),
    ...(!marketDataUsable?['MARKET_DATA_NOT_USABLE']:[]),
    ...(market?.delayed_feed===true?['MARKET_FEED_DELAYED']:[]),
    ...(!executionGradeQuote?['EXECUTION_GRADE_QUOTE_UNAVAILABLE']:[]),
    ...(researchSample<matureSampleRequired?['MATURE_SAMPLE_BELOW_'+matureSampleRequired]:[]),
    ...(Array.isArray(governor?.blocker_codes)?governor.blocker_codes:[]),
    ...(!schedulerReady?['SCHEDULER_HUMAN_REVIEW_GATE_NOT_CLEAR']:[]),
    ...(!liveExecutionReady?['LIVE_EXECUTION_RELEASE_NOT_READY']:[])
  ]);

  let state='FINISHING_BLOCKERS_PRESENT';
  if(researchReady&&paperReady&&!liveExecutionReady){
    state='RESEARCH_AND_PAPER_PRODUCTION_READY_LIVE_EXECUTION_LOCKED';
  }else if(researchReady&&!paperReady){
    state='RESEARCH_PRODUCTION_READY_PAPER_OR_EXECUTION_BLOCKED';
  }else if(researchReady&&paperReady&&liveExecutionReady){
    state='READY_FOR_SEPARATE_HUMAN_LIVE_RELEASE_REVIEW';
  }

  const selected=handoff?.selected_candidate||null;

  res.setHeader('Cache-Control',allDependenciesHealthy
    ?'public, max-age=0, s-maxage=5, must-revalidate'
    :'no-store');
  res.setHeader('X-TFA-Runtime','PUBLIC-SHELL-PRIVATE-BRAIN');
  res.setHeader('X-TFA-Auth','VERCEL_OIDC');
  res.setHeader('X-TFA-Engine','V166');
  res.setHeader('X-TFA-Pressure-Control','V176.1');
  if(!allDependenciesHealthy)res.setHeader('Retry-After','5');

  return res.status(allDependenciesHealthy?200:503).json({
    ok:allDependenciesHealthy,
    version:'v166-production-closure-gate-v1',
    generated_at:new Date().toISOString(),
    state,
    closure:{
      platform_research_ready:researchReady,
      autonomous_paper_ready:paperReady,
      scheduler_review_ready:schedulerReady,
      live_execution_ready:liveExecutionReady,
      real_money_launch_complete:false,
      note:liveExecutionReady
        ?'Evidence may be sufficient for a separate human-controlled release review. This endpoint never enables live trading.'
        :'The research/paper product can operate while real-money execution remains fail-closed.'
    },
    live_market:{
      symbol:'GC=F / XAUUSD execution requires broker quote',
      price:Number.isFinite(Number(market?.price))?Number(market.price):null,
      market_time:market?.market_time??null,
      market_status:market?.market_status??'UNKNOWN',
      engine_state:market?.engine_state??'UNKNOWN',
      delayed_feed:market?.delayed_feed===true,
      hard_stale:market?.hard_stale===true,
      quote_age_minutes:market?.quote_age_minutes??null,
      execution_quote_allowed:executionGradeQuote,
      desk_state:desk?.desk_state??'UNKNOWN',
      daily_bias:desk?.structure?.daily_bias??'UNKNOWN',
      daily_structure:desk?.structure?.daily_structure??'UNKNOWN',
      state_phase:desk?.structure?.state_phase??'UNKNOWN',
      path_state:desk?.structure?.path_state??'UNKNOWN',
      system_action:'WAIT',
      system_capital_permission:'0R'
    },
    research_evidence:{
      resolved_shadow_sample:researchSample,
      mature_sample_required:matureSampleRequired,
      sample_state:reality?.research?.sample_state??'UNKNOWN',
      execution_evidence_state:reality?.research?.execution_evidence_state??'UNKNOWN',
      public_statistics:reality?.research?.public_statistics??null,
      broker_adapter_state:reality?.execution_gate?.broker_adapter_state??'NOT_CONNECTED',
      infrastructure_passed:Number(reality?.execution_gate?.infrastructure_passed||0),
      infrastructure_total:Number(reality?.execution_gate?.infrastructure_total||0),
      broker_lab_state:brokerLab?.state??'UNKNOWN',
      production_broker_readiness:brokerLab?.production_boundary?.production_broker_readiness??'NOT_TESTED'
    },
    sandbox_execution:{
      available:sandboxR.ok,
      state:sandbox?.state??'UNAVAILABLE',
      thresholds:sandbox?.thresholds??null,
      evidence:sandbox?.evidence??null,
      sandbox_gates:sandbox?.sandbox_gates??null,
      production_boundary:sandbox?.production_boundary??null,
      governance:{
        action_permitted:'WAIT',
        capital_permission:'0R',
        live_order_submission_enabled:false,
        production_broker_verified:false,
        sandbox_evidence_can_unlock_capital:false
      }
    },
    sandbox_bridge:{
      available:sandboxBridgeR.ok,
      state:sandboxBridge?.state??'UNAVAILABLE',
      active_bridge_count:Number(sandboxBridge?.active_bridge_count||0),
      authenticated_requests:Number(sandboxBridge?.authenticated_requests||0),
      last_used_at:sandboxBridge?.last_used_at??null,
      production_boundary:sandboxBridge?.production_boundary??null,
      governance:{
        action_permitted:'WAIT',
        capital_permission:'0R',
        live_order_submission_enabled:false,
        production_capable:false,
        bridge_can_unlock_capital:false
      }
    },
    sandbox_bridge_health:{
      available:sandboxBridgeHealthR.ok,
      state:sandboxBridgeHealth?.state??'UNAVAILABLE',
      counts:sandboxBridgeHealth?.counts??null,
      expected:sandboxBridgeHealth?.expected??null,
      last_heartbeat_at:sandboxBridgeHealth?.last_heartbeat_at??null,
      clients:Array.isArray(sandboxBridgeHealth?.clients)?sandboxBridgeHealth.clients:[],
      production_boundary:sandboxBridgeHealth?.production_boundary??null,
      governance:{
        action_permitted:'WAIT',
        capital_permission:'0R',
        live_order_submission_enabled:false,
        production_capable:false,
        health_can_unlock_capital:false
      }
    },
    live_xauusd:{
      available:liveXauusdR.ok,
      state:liveXauusd?.state??'UNAVAILABLE',
      quote:liveXauusd?.quote??null,
      quality:liveXauusd?.quality??null,
      source:liveXauusd?.source??null,
      governance:{
        action_permitted:'WAIT',
        capital_permission:'0R',
        market_data_only:true,
        machine_execution_allowed:false,
        live_order_submission_enabled:false
      }
    },
    scheduler:{
      state:admission?.state??'UNKNOWN',
      gates_passed:Number(admission?.admission?.gates_passed||0),
      gate_count:Number(admission?.admission?.gate_count||0),
      handoff_state:handoff?.state??'UNKNOWN',
      route:handoff?.route??'NONE',
      candidate:selected?{
        jobname:selected.jobname??null,
        current_schedule:selected.current_schedule??null,
        recommended_schedule:selected.recommended_schedule??null,
        current_peer_triggers:selected.current_peer_triggers??null,
        proposed_peer_triggers:selected.proposed_peer_triggers??null,
        peer_trigger_delta:selected.peer_trigger_delta??null,
        controlled_overlap_count:selected.controlled_overlap_count??null,
        exact_live_schedule_match:selected.exact_live_schedule_match===true,
        apply:false,
        human_review_required:true
      }:null,
      automatic_rescheduling:false,
      automatic_rollback:false
    },
    execution_release:{
      production_prerequisites:productionPrereqs,
      blockers,
      blocker_count:blockers.length,
      live_execution_ready:liveExecutionReady,
      live_order_submission_enabled:false,
      real_order_sent:false,
      human_release_required:true
    },
    dependencies:dependencyHealth,
    pressure_control:{
      version:PRESSURE_CONTROL_VERSION,
      dependency_timeout_ms:DEPENDENCY_TIMEOUT_MS,
      healthy_response_cache_seconds:5,
      degraded_response_cache:false,
      qa_retry_recommended:false,
      live_order_permission_unchanged:true
    },
    governance:{
      action_permitted:'WAIT',
      capital_permission:'0R',
      live_order_routing:false,
      order_submission_enabled:false,
      automatic_real_capital:false,
      automatic_rescheduling:false,
      automatic_rollback:false,
      automatic_policy_promotion:false,
      human_release_required:true,
      v166_can_unlock_capital:false
    },
    truth_label:'PRODUCTION_CLOSURE_GATE_NOT_TRADING_PERMISSION'
  });
}
