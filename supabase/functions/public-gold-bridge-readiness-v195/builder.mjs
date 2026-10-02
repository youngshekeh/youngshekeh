const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
const age=(now,v)=>{const t=Date.parse(String(v||''));return Number.isFinite(t)?Math.max(0,Math.round((now.getTime()-t)/1000)):null};

export function buildGoldBridgeReadiness({now=new Date(),bridges=[],live={}}={}){
  const rows=Array.isArray(bridges)?bridges:[];
  const active=rows.filter(x=>x?.revoked_at==null);
  const used=active.filter(x=>n(x?.use_count)>0||x?.last_used_at);
  const latestUsed=used.map(x=>x?.last_used_at).filter(Boolean).sort().at(-1)??null;
  const lastActivityAge=age(now,latestUsed);
  const liveFresh=live?.ok===true&&live?.state==='BROKER_LIVE'&&live?.quality?.fresh===true&&n(live?.quote?.mid)!==null;
  const liveConnected=live?.source?.connected===true||live?.state==='BROKER_LIVE';
  const firstTickSeen=used.length>0;
  const enrolled=active.length>0;

  let state='NO_BRIDGE_ENROLLED';
  let next='ENROLL_OWNER_AAL2_BRIDGE';
  if(enrolled&&!firstTickSeen){state='BRIDGE_ENROLLED_WAITING_FIRST_TICK';next='RUN_MT5_RELAY_ON_WINDOWS';}
  else if(firstTickSeen&&!liveFresh){state=liveConnected?'BROKER_QUOTE_STALE':'BRIDGE_ACTIVITY_WITHOUT_FRESH_QUOTE';next='RESTORE_FRESH_MT5_TICKS';}
  else if(liveFresh){state='BROKER_LIVE';next='NONE';}

  const gates={
    bridge_enrolled:{pass:enrolled,count:active.length},
    first_tick_received:{pass:firstTickSeen,last_activity_at:latestUsed,activity_age_seconds:lastActivityAge},
    quote_fresh:{pass:liveFresh,quote_age_seconds:n(live?.quote?.age_seconds)??n(live?.quality?.quote_age_seconds)},
    broker_live:{pass:liveFresh&&liveConnected}
  };

  return {
    ok:true,
    version:'v195-gold-bridge-readiness-v1',
    generated_at:now.toISOString(),
    symbol:'XAUUSD',
    state,
    gates,
    next_step_code:next,
    public_counts:{active_bridges:active.length,bridges_with_activity:used.length},
    live_market:{
      state:live?.state??'UNAVAILABLE',
      connected:liveConnected,
      fresh:liveFresh,
      trade_mode:liveFresh?(live?.quote?.trade_mode??live?.trade_mode??null):null,
      mid:liveFresh?n(live?.quote?.mid):null
    },
    privacy:{
      bridge_ids_public:false,
      bridge_keys_public:false,
      owner_identity_public:false,
      account_number_public:false
    },
    governance:{
      market_data_only:true,
      commissioning_not_trade_permission:true,
      automatic_execution:false,
      machine_execution_allowed:false,
      live_order_submission_enabled:false,
      action_permitted:'WAIT',
      capital_permission:'0R'
    }
  };
}
