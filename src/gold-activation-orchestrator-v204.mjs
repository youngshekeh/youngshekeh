const finite=v=>Number.isFinite(Number(v));
const age=v=>v==null||!finite(v)?null:Math.max(0,Math.round(Number(v)));

export function buildGoldActivationOrchestrator({now=new Date(),readiness={},quality={},anchor={},relay={},ledger={}}={}){
  const upstream={
    readiness:readiness?.ok===true,
    quality:quality?.ok===true,
    anchor:anchor?.ok===true,
    relay:relay?.ok===true,
    ledger:ledger?.ok===true
  };
  const upstreamOk=Object.values(upstream).every(Boolean);
  const bridgeEnrolled=readiness?.gates?.bridge_enrolled?.pass===true||relay?.bridge?.enrolled===true;
  const authReached=relay?.bridge?.authentication_reached===true;
  const firstTick=relay?.relay?.first_tick_seen===true;
  const qualityPass=quality?.state==='LIVE_FEED_QUALITY_PASS';
  const anchorCertified=anchor?.state==='LIVE_ANCHOR_CERTIFIED'&&anchor?.anchor?.certified===true;
  const sustainedStream=relay?.relay?.streaming===true;
  const ledgerVerified=ledger?.state==='HASH_CHAIN_VERIFIED'&&Number(ledger?.counts?.chain_failures||0)===0;

  const gates={
    bridge_enrolled:{pass:bridgeEnrolled,label:'Bridge enrolled'},
    intake_authentication:{pass:authReached,label:'Intake authentication'},
    first_tick_accepted:{pass:firstTick,label:'First tick accepted'},
    feed_quality:{pass:qualityPass,label:'V196 feed quality'},
    live_anchor:{pass:anchorCertified,label:'V197 live anchor'},
    sustained_stream:{pass:sustainedStream,label:'Sustained relay stream'}
  };
  const passed=Object.values(gates).filter(g=>g.pass).length;
  const total=Object.keys(gates).length;

  let state='DATA_DEGRADED',phaseNumber=0,nextStep='RESTORE_UPSTREAMS';
  let operator='Restore the unavailable commissioning upstream before trusting activation state.';
  let machine='Hold all promotion. Continue fail-closed observation only.';
  if(upstreamOk){
    if(!bridgeEnrolled){
      state='ENROLLMENT_REQUIRED'; phaseNumber=0; nextStep='ENROLL_OWNER_AAL2_BRIDGE';
      operator='Open Owner Command with AAL2 and create one read-only XAUUSD bridge credential.';
      machine='Wait for a verified bridge enrollment. Do not infer live connectivity.';
    }else if(!authReached){
      state='RELAY_NOT_STARTED'; phaseNumber=1; nextStep='RUN_V201_THEN_V200_ON_WINDOWS';
      operator='Run the V201 doctor on the Windows MT5 host, then execute the V200 one-shot smoke test.';
      machine='Watch V199 for intake authentication. Do not promote a live price before first accepted tick.';
    }else if(!firstTick){
      state='AUTHENTICATED_WAITING_FIRST_TICK'; phaseNumber=2; nextStep='RESOLVE_FIRST_TICK_ACCEPTANCE';
      operator='Keep MT5 open, verify XAUUSD symbol selection, and retry the V200 one-shot tick.';
      machine='Observe authenticated intake without treating authentication itself as market data.';
    }else if(!qualityPass){
      state='FEED_QUALITY_PROBATION'; phaseNumber=3; nextStep='SUSTAIN_FRESH_ORDERED_TICKS';
      operator='Keep the read-only relay running until V196 confirms freshness, cadence, sequence and transport quality.';
      machine='Accumulate only authenticated ticks and keep the live anchor blocked during probation.';
    }else if(!anchorCertified){
      state='LIVE_ANCHOR_PENDING'; phaseNumber=4; nextStep='WAIT_FOR_V197_CERTIFICATION';
      operator='Preserve the clean feed while the live-anchor guard confirms the broker anchor.';
      machine='Keep V194/V197 promotion gates closed until the certified anchor contract passes.';
    }else if(!sustainedStream){
      state='STREAM_STABILITY_PENDING'; phaseNumber=5; nextStep='SUSTAIN_RELAY_STREAM';
      operator='Keep the relay continuously running so V199 can verify sustained streaming.';
      machine='Preserve the certified anchor but keep commissioning incomplete until stream stability is observed.';
    }else{
      state='LIVE_DATA_PATH_READY'; phaseNumber=6; nextStep='PRESERVE_FEED_AND_DOWNSTREAM_GATES';
      operator='Keep MT5 and the read-only relay running. Downstream review and capital gates remain independent.';
      machine='Use the certified XAUUSD anchor as market-data context only. Execution remains locked.';
    }
  }

  const bridgeAge=age(relay?.bridge?.age_seconds);
  const authAge=age(relay?.bridge?.last_auth_activity_age_seconds);
  const tickAge=age(relay?.relay?.latest_tick_age_seconds);
  let stall={active:false,code:'NONE',detail:'No activation stall detected.'};
  if(upstreamOk&&bridgeEnrolled&&!authReached&&bridgeAge!=null&&bridgeAge>=900){
    stall={active:true,code:'LOCAL_RELAY_START_OVERDUE',detail:'Bridge credential has been enrolled for at least 15 minutes without any authenticated relay request.'};
  }else if(upstreamOk&&authReached&&!firstTick&&authAge!=null&&authAge>=120){
    stall={active:true,code:'AUTH_REACHED_NO_ACCEPTED_TICK',detail:'Relay authentication reached intake, but no accepted XAUUSD tick followed within two minutes.'};
  }else if(upstreamOk&&firstTick&&tickAge!=null&&tickAge>=15){
    stall={active:true,code:'LIVE_TICK_STALE',detail:'A live tick was seen, but the latest accepted tick is now at least 15 seconds old.'};
  }else if(upstreamOk&&firstTick&&!qualityPass&&Number(relay?.relay?.accepted_ticks_examined||0)>=3){
    stall={active:true,code:'QUALITY_GATES_NOT_PASSING',detail:'Multiple ticks arrived, but V196 feed-quality certification is still not passing.'};
  }

  const blockers=[];
  if(!upstreamOk)blockers.push('COMMISSIONING_UPSTREAM_DEGRADED');
  for(const [key,g] of Object.entries(gates))if(!g.pass)blockers.push(String(key).toUpperCase()+'_REQUIRED');
  if(!ledgerVerified)blockers.push('RELAY_LEDGER_NOT_VERIFIED');
  if(stall.active)blockers.unshift(stall.code);

  return{
    ok:upstreamOk,
    version:'v204-gold-activation-orchestrator-v1',
    generated_at:now.toISOString(),
    symbol:'XAUUSD',
    state,
    phase:{number:phaseNumber,total,passed_gates:passed,label:state},
    commissioning_progress_pct:Math.round((passed/total)*100),
    gates,
    stall,
    next_step_code:nextStep,
    operator_next_action:operator,
    machine_next_action:machine,
    relay_summary:{
      bridge_age_seconds:bridgeAge,
      authenticated_requests:Number(relay?.bridge?.total_authenticated_requests||0),
      accepted_ticks:Number(relay?.relay?.accepted_ticks_examined||0),
      latest_tick_age_seconds:tickAge,
      relay_version:relay?.relay?.relay_version??null,
      mt5_package_version:relay?.relay?.mt5_package_version??null,
      os_family:relay?.relay?.os_family??null
    },
    audit:{
      ledger_verified:ledgerVerified,
      ledger_state:ledger?.state??'UNAVAILABLE',
      event_count:Number(ledger?.counts?.events||0),
      chain_failures:Number(ledger?.counts?.chain_failures||0),
      latest_event_at:ledger?.latest_event_at??null
    },
    upstream,
    blockers:[...new Set(blockers)],
    decision_compression:{
      what_changed:state==='LIVE_DATA_PATH_READY'?'The read-only XAUUSD data path passed all six commissioning gates.':'Live XAUUSD commissioning is at '+state+'.',
      what_matters:stall.active?stall.code:nextStep,
      action_permitted:'WAIT',
      capital_permission:'0R'
    },
    privacy:{
      bridge_ids_public:false,
      bridge_keys_public:false,
      tick_sequences_public:false,
      owner_identity_public:false,
      account_numbers_public:false
    },
    governance:{
      commissioning_progress_not_probability:true,
      activation_state_not_trade_signal:true,
      live_data_ready_not_execution_permission:true,
      market_data_only:true,
      automatic_execution:false,
      machine_execution_allowed:false,
      live_order_submission_enabled:false,
      action_permitted:'WAIT',
      capital_permission:'0R'
    }
  };
}
