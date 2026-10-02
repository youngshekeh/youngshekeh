const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
const t=v=>{const x=Date.parse(String(v||''));return Number.isFinite(x)?x:null};
const age=(nowMs,v)=>{const x=t(v);return x===null?null:Math.max(0,Math.round((nowMs-x)/1000));};

export function buildGoldRelayObservability({now=new Date(),bridges=[],ticks=[]}={}){
  const nowMs=now.getTime();
  const active=(Array.isArray(bridges)?bridges:[]).filter(x=>x?.revoked_at==null);
  const bridge=active[0]??null;
  const bridgeUses=n(bridge?.use_count)??0;
  const authReached=bridgeUses>0||!!bridge?.last_used_at;

  const rows=(Array.isArray(ticks)?ticks:[])
    .map(x=>({...x,_obs:t(x?.observed_at),_recv:t(x?.received_at),_seq:n(x?.sequence)}))
    .filter(x=>x._obs!==null&&x._recv!==null&&x._seq!==null)
    .sort((a,b)=>a._obs-b._obs);

  const first=rows[0]??null,latest=rows.at(-1)??null;
  const firstTickSeen=rows.length>0;
  const latestAge=latest?Math.max(0,Math.round((nowMs-latest._obs)/1000)):null;
  const recent60=rows.filter(x=>nowMs-x._obs<=60_000);
  const recent10m=rows.filter(x=>nowMs-x._obs<=600_000);
  const span60=recent60.length>=2?Math.round((recent60.at(-1)._obs-recent60[0]._obs)/1000):0;
  const streaming=latestAge!==null&&latestAge<=5&&recent60.length>=3&&span60>=5&&latest?.terminal_connected===true;
  const freshAny=latestAge!==null&&latestAge<=15;

  let maxGap10m=null;
  if(recent10m.length>=2){
    maxGap10m=0;
    for(let i=1;i<recent10m.length;i++)maxGap10m=Math.max(maxGap10m,Math.round((recent10m[i]._obs-recent10m[i-1]._obs)/1000));
  }
  const recoveredAfterGap=streaming&&maxGap10m!==null&&maxGap10m>=30;

  let state='NO_BRIDGE_ENROLLED',next='ENROLL_OWNER_AAL2_BRIDGE';
  if(bridge&&!authReached&&!firstTickSeen){state='CREDENTIAL_ISSUED_AWAITING_RELAY';next='RUN_MT5_RELAY_ON_WINDOWS';}
  else if(bridge&&authReached&&!firstTickSeen){state='AUTH_REACHED_AWAITING_ACCEPTED_TICK';next='INSPECT_RELAY_TICK_VALIDATION';}
  else if(firstTickSeen&&!streaming&&freshAny){state='FIRST_TICK_ACCEPTED_PROBATION';next='KEEP_RELAY_RUNNING_FOR_PROBATION';}
  else if(firstTickSeen&&!freshAny){state='RELAY_STALE';next='RESTORE_MT5_RELAY_HEARTBEAT';}
  else if(streaming){state='RELAY_STREAMING';next='PRESERVE_RELAY_HEARTBEAT';}

  return{
    ok:true,
    version:'v199-gold-relay-observability-v1',
    generated_at:now.toISOString(),
    symbol:'XAUUSD',
    state,
    next_step_code:next,
    bridge:{
      enrolled:!!bridge,
      age_seconds:bridge?age(nowMs,bridge.created_at):null,
      authentication_reached:authReached,
      total_authenticated_requests:bridgeUses,
      last_auth_activity_age_seconds:bridge?.last_used_at?age(nowMs,bridge.last_used_at):null
    },
    relay:{
      first_tick_seen:firstTickSeen,
      first_tick_at:first?.observed_at??null,
      latest_tick_at:latest?.observed_at??null,
      latest_tick_age_seconds:latestAge,
      accepted_ticks_examined:rows.length,
      ticks_60s:recent60.length,
      span_60s_seconds:span60,
      terminal_connected:latest?.terminal_connected===true,
      relay_version:latest?.relay_version??null,
      mt5_package_version:latest?.mt5_package_version??null,
      os_family:latest?.os_family??null,
      streaming,
      max_gap_10m_seconds:maxGap10m,
      recovery_after_gap_detected:recoveredAfterGap
    },
    milestones:{
      credential_issued:!!bridge,
      intake_authentication_seen:authReached,
      first_accepted_tick:firstTickSeen,
      sustained_stream:streaming
    },
    privacy:{
      bridge_id_public:false,
      bridge_key_public:false,
      tick_sequence_public:false,
      owner_identity_public:false,
      account_number_public:false
    },
    governance:{
      observability_not_trade_permission:true,
      relay_health_not_market_signal:true,
      market_data_only:true,
      automatic_execution:false,
      machine_execution_allowed:false,
      live_order_submission_enabled:false,
      action_permitted:'WAIT',
      capital_permission:'0R'
    }
  };
}
