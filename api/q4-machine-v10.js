const SUPA='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1';

async function read(path,timeout=14000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(SUPA+'/'+path,{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-Q4-V10/1.0'},
      cache:'no-store',
      signal:controller.signal,
      redirect:'error'
    });
    const body=await response.json().catch(()=>null);
    return response.ok&&body&&typeof body==='object'&&!Array.isArray(body)?body:null;
  }catch{return null}finally{clearTimeout(timer)}
}

function finite(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function clean(value,fallback='WITHHELD'){return String(value??fallback)}
function yes(value){return value===true}
function round(value,digits=4){
  const n=finite(value);
  if(n===null)return null;
  const p=10**digits;
  return Math.round(n*p)/p;
}
function isoAgeSeconds(value){
  if(!value)return null;
  const t=Date.parse(String(value));
  if(!Number.isFinite(t))return null;
  return Math.max(0,Math.round((Date.now()-t)/1000));
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Machine','Q4-BROKER-REFERENCE-INTEGRITY-V10');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }

  const [live,reality,adapter,qualification]=await Promise.all([
    read('broker-live-market-intake'),
    read('public-gold-execution-reality'),
    read('public-gold-broker-adapter-lab'),
    read('public-gold-execution-qualification')
  ]);

  const sourceHealth={
    live_market_intake:live?.ok===true,
    execution_reality:reality?.ok===true,
    adapter_lab:adapter?.ok===true,
    execution_qualification:qualification?.ok===true
  };

  const quote=live?.quote??null;
  const bid=finite(quote?.bid);
  const ask=finite(quote?.ask);
  const last=finite(quote?.last);
  const observedAt=quote?.observed_at??quote?.terminal_tick_time??quote?.created_at??null;
  const ageSeconds=isoAgeSeconds(observedAt);
  const spreadPoints=bid!==null&&ask!==null&&ask>=bid?round(ask-bid,6):null;
  const mid=bid!==null&&ask!==null?round((bid+ask)/2,6):null;
  const spreadBps=spreadPoints!==null&&mid&&mid>0?round((spreadPoints/mid)*10000,4):null;

  const liveConnected=
    sourceHealth.live_market_intake&&
    live?.source?.kind==='MT5_READ_ONLY_BROKER'&&
    yes(live?.source?.connected);

  const quoteShapeValid=
    bid!==null&&
    ask!==null&&
    ask>=bid&&
    (last===null||last>0);

  const freshnessFlag=yes(live?.quality?.fresh);
  const recentEnough=ageSeconds!==null?ageSeconds<=15:freshnessFlag;
  const tickActivity=(finite(live?.quality?.tick_count_60s)??0)>0;
  const brokerReferenceReady=
    liveConnected&&quoteShapeValid&&freshnessFlag&&recentEnough&&tickActivity;

  let referenceGrade='NO_BROKER_REFERENCE';
  if(sourceHealth.live_market_intake&&liveConnected&&!brokerReferenceReady){
    referenceGrade='BROKER_CONNECTED_REFERENCE_NOT_FRESH';
  }
  if(brokerReferenceReady){
    referenceGrade='READ_ONLY_BROKER_MARKET_REFERENCE_VERIFIED';
  }

  const infra=Array.isArray(reality?.execution_gate?.infrastructure)
    ?reality.execution_gate.infrastructure:[];
  const infrastructurePassed=infra.filter(x=>x?.passed===true).map(x=>String(x?.name??'UNKNOWN'));
  const infrastructureMissing=infra.filter(x=>x?.passed!==true).map(x=>String(x?.name??'UNKNOWN'));

  const simulationPass=
    clean(adapter?.state)==='PASS_SIMULATION_ONLY'&&
    finite(adapter?.lab?.tests_passed)===finite(adapter?.lab?.tests_total)&&
    finite(adapter?.lab?.real_orders_sent)===0;

  const productionBrokerVerified=yes(qualification?.safety?.production_broker_verified);
  const realBrokerConnected=yes(qualification?.safety?.real_broker_connected);
  const liveRoutePresent=yes(qualification?.safety?.live_order_route_present);
  const liveQualified=yes(qualification?.qualification?.live_order_qualified);

  const measuredSpreadClaim =
    brokerReferenceReady&&spreadPoints!==null
      ?'OBSERVED_QUOTE_SPREAD_ONLY'
      :'WITHHELD';

  const executionEvidenceGrade =
    productionBrokerVerified&&
    realBrokerConnected&&
    liveRoutePresent&&
    liveQualified&&
    infrastructureMissing.length===0
      ?'EXECUTION_INFRASTRUCTURE_REVIEWABLE'
      :'NOT_EXECUTION_GRADE';

  const checks=[
    {key:'mt5_read_only_source',passed:liveConnected,evidence:clean(live?.source?.kind,'SOURCE_UNAVAILABLE')},
    {key:'broker_quote_shape_valid',passed:quoteShapeValid,evidence:quoteShapeValid?'VALID_BID_ASK':'NO_VALID_BID_ASK'},
    {key:'quote_fresh',passed:freshnessFlag&&recentEnough,evidence:clean(live?.state,'SOURCE_UNAVAILABLE')},
    {key:'recent_tick_activity',passed:tickActivity,evidence:String(finite(live?.quality?.tick_count_60s)??0)+' ticks/60s'},
    {key:'production_broker_verified',passed:productionBrokerVerified,evidence:String(productionBrokerVerified)},
    {key:'real_broker_connected',passed:realBrokerConnected,evidence:String(realBrokerConnected)},
    {key:'live_route_present',passed:liveRoutePresent,evidence:String(liveRoutePresent)},
    {key:'execution_infrastructure_complete',passed:infrastructureMissing.length===0,evidence:infrastructureMissing.length?infrastructureMissing.join(', '):'COMPLETE'}
  ];

  let state='WAITING_FOR_REAL_TICK';
  if(Object.values(sourceHealth).some(v=>!v))state='SOURCE_GATED';
  else if(liveConnected&&!brokerReferenceReady)state='BROKER_CONNECTED_WAITING_FRESH_REFERENCE';
  else if(brokerReferenceReady&&executionEvidenceGrade==='NOT_EXECUTION_GRADE')state='BROKER_MARKET_REFERENCE_READY_EXECUTION_LOCKED';
  else if(brokerReferenceReady&&executionEvidenceGrade==='EXECUTION_INFRASTRUCTURE_REVIEWABLE')state='EXECUTION_INFRASTRUCTURE_REVIEW_REQUIRED';

  const blockers=checks.filter(x=>!x.passed);

  return res.status(200).json({
    ok:true,
    version:'q4-machine-v10',
    generated_at:new Date().toISOString(),
    broker_reference:{
      state,
      reference_grade:referenceGrade,
      symbol:live?.symbol??'XAUUSD',
      source_kind:live?.source?.kind??null,
      source_connected:liveConnected,
      quote_present:quote!==null,
      quote_shape_valid:quoteShapeValid,
      freshness_flag:freshnessFlag,
      observed_at:observedAt,
      age_seconds:ageSeconds,
      tick_count_60s:finite(live?.quality?.tick_count_60s),
      tick_count_5m:finite(live?.quality?.tick_count_5m),
      bid,
      ask,
      last,
      mid,
      observed_spread_points:spreadPoints,
      observed_spread_bps:spreadBps,
      spread_claim:measuredSpreadClaim,
      market_data_only:true
    },
    verification:{
      checks,
      passed_count:checks.filter(x=>x.passed).length,
      total_count:checks.length,
      blockers,
      primary_blocker:blockers[0]??null
    },
    simulation_boundary:{
      adapter_lab_state:adapter?.state??'SOURCE_UNAVAILABLE',
      simulation_tests_passed:finite(adapter?.lab?.tests_passed),
      simulation_tests_total:finite(adapter?.lab?.tests_total),
      simulation_pass:simulationPass,
      real_orders_sent:finite(adapter?.lab?.real_orders_sent),
      simulation_success_counts_as_broker_verification:false,
      simulation_success_counts_as_execution_evidence:false
    },
    execution_reality:{
      state:reality?.state??'SOURCE_UNAVAILABLE',
      resolved_shadow_sample:finite(reality?.research?.resolved_sample),
      mature_research_sample:finite(reality?.research?.mature_research_sample),
      infrastructure_passed:infrastructurePassed,
      infrastructure_missing:infrastructureMissing,
      production_broker_verified:productionBrokerVerified,
      real_broker_connected:realBrokerConnected,
      live_order_route_present:liveRoutePresent,
      live_order_qualified:liveQualified,
      execution_evidence_grade:executionEvidenceGrade,
      broker_spread_measured:yes(reality?.methodology?.broker_spread_measured),
      slippage_measured:yes(reality?.methodology?.slippage_measured),
      delayed_reference_not_execution_quote:yes(reality?.methodology?.delayed_reference_not_execution_quote)
    },
    qualification_boundary:{
      dry_run_state:qualification?.state??'SOURCE_UNAVAILABLE',
      dry_run_order_ready:yes(qualification?.qualification?.dry_run_order_ready),
      dry_run_route:qualification?.dry_run_order?.route??null,
      dry_run_is_not_broker_order:yes(qualification?.methodology?.dry_run_order_is_not_broker_order),
      blocker_codes:Array.isArray(qualification?.qualification?.blocker_codes)
        ?qualification.qualification.blocker_codes:[],
      human_release_required:yes(qualification?.governance?.human_control_required_for_any_future_live_release)
    },
    source_health:{
      available_count:Object.values(sourceHealth).filter(Boolean).length,
      total_count:Object.keys(sourceHealth).length,
      sources:sourceHealth
    },
    reference_firewall:{
      delayed_price_counts_as_broker_reference:false,
      paper_quote_counts_as_broker_reference:false,
      simulation_counts_as_broker_verification:false,
      observed_spread_counts_as_realized_execution_cost:false,
      broker_market_reference_can_unlock_capital:false,
      execution_evidence_can_unlock_capital:false,
      automatic_orders:false,
      capital_permission:'0R'
    },
    next_action:blockers[0]?{
      gate:blockers[0].key,
      evidence:blockers[0].evidence
    }:{
      gate:'HUMAN_EXECUTION_INFRASTRUCTURE_REVIEW',
      evidence:'All V10 verification checks passed, but capital and order authority remain outside V10.'
    },
    decision_compression:{
      what_changed:'V10 classified the current broker reference as '+referenceGrade+'.',
      what_matters_now:blockers[0]
        ?blockers[0].key+' remains blocked: '+blockers[0].evidence+'.'
        :'Broker reference and infrastructure are reviewable, but not executable by V10.',
      action_permitted:'WAIT',
      capital_permission:'0R'
    },
    governance:{
      research_only:true,
      market_data_only:true,
      automatic_execution:false,
      action_permitted:'WAIT',
      capital_permission:'0R'
    }
  });
}
