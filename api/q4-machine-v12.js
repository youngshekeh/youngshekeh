const ORIGIN='https://thefatheranalytics.com';

async function read(path,timeout=14000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(ORIGIN+path,{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-Q4-V12/1.0'},
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

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Machine','Q4-MT5-RELAY-BOOTSTRAP-V12');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }

  const [v11,readiness,relay,ledger,activation]=await Promise.all([
    read('/api/q4-machine-v11',16000),
    read('/api/gold-bridge-readiness-v195'),
    read('/api/gold-relay-observability-v199'),
    read('/api/gold-relay-event-ledger-v202'),
    read('/api/gold-activation-orchestrator-v204',16000)
  ]);

  const sourceHealth={
    v11:v11?.ok===true,
    readiness_v195:readiness?.ok===true,
    observability_v199:relay?.ok===true,
    event_ledger_v202:ledger?.ok===true,
    activation_v204:activation?.ok===true
  };

  const bridgeEnrolled=readiness?.gates?.bridge_enrolled?.pass===true;
  const authReached=relay?.bridge?.authentication_reached===true;
  const firstTickSeen=relay?.relay?.first_tick_seen===true;
  const streaming=relay?.relay?.streaming===true;
  const bridgeAgeSeconds=finite(relay?.bridge?.age_seconds);
  const stalledCredential=
    bridgeEnrolled &&
    !authReached &&
    bridgeAgeSeconds!==null &&
    bridgeAgeSeconds>=900;

  const ledgerVerified=
    clean(ledger?.state)==='HASH_CHAIN_VERIFIED' &&
    finite(ledger?.counts?.chain_failures)===0;

  const activationPhase=finite(activation?.phase?.number);
  const activationTotal=finite(activation?.phase?.total);
  const activationProgress=finite(activation?.commissioning_progress_pct);

  let state='NO_BRIDGE_ENROLLED';
  if(bridgeEnrolled&&!authReached)state='CREDENTIAL_ISSUED_RELAY_NOT_STARTED';
  if(authReached&&!firstTickSeen)state='AUTHENTICATED_WAITING_FIRST_TICK';
  if(firstTickSeen&&!streaming)state='FIRST_TICK_ACCEPTED_PROBATION';
  if(streaming)state='RELAY_STREAMING';

  let operatorPath='CREATE_READ_ONLY_BRIDGE';
  if(bridgeEnrolled&&!authReached)operatorPath='RUN_V205_OR_ROTATE_LOST_KEY';
  if(authReached&&!firstTickSeen)operatorPath='RUN_V205_SMOKE_TEST_OR_DIAGNOSE_TICK_REJECTION';
  if(firstTickSeen&&!streaming)operatorPath='KEEP_V205_RUNNING_THROUGH_PROBATION';
  if(streaming)operatorPath='NO_BOOTSTRAP_ACTION_REQUIRED';

  const paths=[];
  if(bridgeEnrolled&&!authReached){
    paths.push({
      code:'KEY_AVAILABLE',
      when:'You still have the one-time bridge key from the Owner panel session that created this bridge.',
      action:'On the Windows MT5 host, keep MetaTrader 5 open and logged in, set the three V205 environment variables, then run the public V205 launcher.',
      launcher_url:'https://thefatheranalytics.com/downloads/mt5-live-market-launcher-v205.ps1',
      doctor_url:'https://thefatheranalytics.com/downloads/mt5-live-market-doctor.py',
      relay_url:'https://thefatheranalytics.com/downloads/mt5-live-market-bridge.py'
    });
    paths.push({
      code:'KEY_LOST',
      when:'The one-time bridge key is no longer available.',
      action:'Open the MFA-protected Owner panel, revoke the active live-market bridge, create a new read-only bridge, copy the new one-time key, and run V205. The old key is intentionally not recoverable.',
      owner_path:'/owner/',
      secret_recovery_available:false
    });
  }

  const gates=[
    {key:'bridge_enrolled',passed:bridgeEnrolled,evidence:String(readiness?.public_counts?.active_bridges??0)+' active bridge(s)'},
    {key:'intake_authentication',passed:authReached,evidence:String(relay?.bridge?.total_authenticated_requests??0)+' authenticated request(s)'},
    {key:'first_tick_accepted',passed:firstTickSeen,evidence:String(relay?.relay?.accepted_ticks_examined??0)+' accepted tick(s) examined'},
    {key:'sustained_stream',passed:streaming,evidence:String(relay?.relay?.ticks_60s??0)+' ticks/60s'},
    {key:'audit_chain_verified',passed:ledgerVerified,evidence:clean(ledger?.state)},
    {key:'v11_market_reference_complete',passed:v11?.broker_reference?.quote_ready===true,evidence:clean(v11?.broker_reference?.grade)}
  ];

  const primary=gates.find(g=>!g.passed)??null;

  return res.status(200).json({
    ok:true,
    version:'q4-machine-v12',
    generated_at:new Date().toISOString(),
    bootstrap:{
      state,
      operator_path:operatorPath,
      stalled_credential:stalledCredential,
      bridge_age_seconds:bridgeAgeSeconds,
      activation_phase:activationPhase,
      activation_total:activationTotal,
      commissioning_progress_pct:activationProgress,
      next_step_code:activation?.next_step_code??readiness?.next_step_code??relay?.next_step_code??null,
      operator_next_action:activation?.operator_next_action??null,
      machine_next_action:activation?.machine_next_action??null,
      paths
    },
    gates:{
      passed_count:gates.filter(g=>g.passed).length,
      total_count:gates.length,
      items:gates,
      primary_blocker:primary
    },
    relay_observability:{
      state:relay?.state??'SOURCE_UNAVAILABLE',
      authentication_reached:authReached,
      authenticated_requests:finite(relay?.bridge?.total_authenticated_requests),
      first_tick_seen:firstTickSeen,
      accepted_ticks_examined:finite(relay?.relay?.accepted_ticks_examined),
      ticks_60s:finite(relay?.relay?.ticks_60s),
      streaming,
      terminal_connected:relay?.relay?.terminal_connected===true,
      relay_version:relay?.relay?.relay_version??null,
      mt5_package_version:relay?.relay?.mt5_package_version??null,
      os_family:relay?.relay?.os_family??null
    },
    audit:{
      ledger_verified:ledgerVerified,
      event_count:finite(ledger?.counts?.events),
      chain_failures:finite(ledger?.counts?.chain_failures),
      latest_event_at:ledger?.latest_event_at??null,
      current_relay_state:ledger?.current_relay?.state??null
    },
    public_artifacts:{
      launcher_version:'V205',
      launcher_url:'https://thefatheranalytics.com/downloads/mt5-live-market-launcher-v205.ps1',
      doctor_version:'V201',
      doctor_url:'https://thefatheranalytics.com/downloads/mt5-live-market-doctor.py',
      relay_version:'V186',
      relay_url:'https://thefatheranalytics.com/downloads/mt5-live-market-bridge.py',
      owner_control_path:'/owner/'
    },
    secret_boundary:{
      bridge_key_public:false,
      bridge_key_recoverable:false,
      bridge_id_public:false,
      owner_identity_public:false,
      account_number_public:false,
      rotation_requires_owner_mfa:true
    },
    bootstrap_firewall:{
      launcher_market_data_only:true,
      launcher_has_order_path:false,
      bootstrap_progress_is_not_trade_signal:true,
      successful_tick_is_not_execution_permission:true,
      no_capital_promotion:true,
      no_orders:true,
      capital_permission:'0R'
    },
    source_health:{
      available_count:Object.values(sourceHealth).filter(Boolean).length,
      total_count:Object.keys(sourceHealth).length,
      sources:sourceHealth
    },
    next_action:primary?{
      gate:primary.key,
      evidence:primary.evidence,
      operator_path:operatorPath
    }:{
      gate:'NO_BOOTSTRAP_BLOCKER',
      evidence:'Relay bootstrap gates are complete. Downstream governance remains separate.',
      operator_path
    },
    decision_compression:{
      what_changed:'V12 classified the relay bootstrap state as '+state+'.',
      what_matters_now:stalledCredential
        ?'A live-market bridge is enrolled but has never authenticated. Run V205 if the one-time key is available; otherwise rotate the credential in the Owner panel.'
        :primary
          ?primary.key+' is the first incomplete bootstrap gate.'
          :'Relay bootstrap is complete; execution authority remains separate.',
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
