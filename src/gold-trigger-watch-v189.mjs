function n(v){if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null;}
const r=(v,d=2)=>{const x=n(v);return x==null?null:Number(x.toFixed(d));};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

function zonedClock(date,timeZone){
  const p=new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);
  const get=t=>p.find(x=>x.type===t)?.value||'';
  const h=Number(get('hour')),m=Number(get('minute'));
  return{weekday:get('weekday'),minute_of_day:h*60+m,label:`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`};
}
function weekday(c){return !['Sat','Sun'].includes(c.weekday);}
function nextWindow(now,def){
  const start=def.start,end=def.end;
  const current=zonedClock(now,def.timeZone);
  if(weekday(current)&&current.minute_of_day>=start-30&&current.minute_of_day<end){
    const phase=current.minute_of_day<start?'PREP':'ACTIVE';
    const minutes=phase==='PREP'?start-current.minute_of_day:0;
    return{key:def.key,label:def.label,time_zone:def.timeZone,phase,minutes_to_start:minutes,start_at:null};
  }
  for(let add=5;add<=5*24*60*4;add+=5){
    const d=new Date(now.getTime()+add*60_000),c=zonedClock(d,def.timeZone);
    if(weekday(c)&&c.minute_of_day>=start&&c.minute_of_day<start+5){
      return{key:def.key,label:def.label,time_zone:def.timeZone,phase:'UPCOMING',minutes_to_start:add,start_at:d.toISOString()};
    }
  }
  return{key:def.key,label:def.label,time_zone:def.timeZone,phase:'UNAVAILABLE',minutes_to_start:null,start_at:null};
}
export function nextSignalWindow(now=new Date()){
  const defs=[
    {key:'ASIA',label:'Tokyo 08:00',timeZone:'Asia/Tokyo',start:8*60,end:10*60},
    {key:'LONDON',label:'London 08:00',timeZone:'Europe/London',start:8*60,end:10*60+30},
    {key:'NEW_YORK',label:'COMEX 08:20',timeZone:'America/New_York',start:8*60+20,end:10*60+30}
  ];
  const all=defs.map(d=>nextWindow(now,d));
  const active=all.find(x=>x.phase==='ACTIVE')||null;
  const prep=all.find(x=>x.phase==='PREP')||null;
  const upcoming=all.filter(x=>x.phase==='UPCOMING'&&x.minutes_to_start!=null).sort((a,b)=>a.minutes_to_start-b.minutes_to_start)[0]||null;
  return{current:active||prep||null,next:active||prep||upcoming,all};
}
function zoneDistance(price,zone){
  const p=n(price),lo=n(zone?.low),hi=n(zone?.high);
  if(p==null||lo==null||hi==null)return null;
  const a=Math.min(lo,hi),b=Math.max(lo,hi);
  if(p>=a&&p<=b)return{state:'INSIDE',distance:0,edge:null};
  if(p<a)return{state:'BELOW',distance:r(a-p,2),edge:a};
  return{state:'ABOVE',distance:r(p-b,2),edge:b};
}
function priorityRank(s){return({ACTIVE_REVIEW:0,ARMED:1,PREP:2,WATCH:3,BLOCKED:4,INFO:5}[s]??9);}
export function buildGoldTriggerWatch({now=new Date(),lifecycle={}}={}){
  const live=lifecycle?.anchor?.state==='BROKER_LIVE';
  const price=n(lifecycle?.anchor?.price);
  const nextWindowInfo=nextSignalWindow(now);
  const sd=lifecycle?.signal_day??{};
  const st=lifecycle?.signal_time??{};
  const dna=lifecycle?.day_dna??{};
  const life=lifecycle?.lifecycle??{};
  const ss=lifecycle?.structural_state??{};
  const mtf=lifecycle?.multi_timeframe??{};
  const daily=(Array.isArray(mtf?.zones)?mtf.zones:[]).find(z=>z?.timeframe==='DAILY')||null;
  const weekly=(Array.isArray(mtf?.zones)?mtf.zones:[]).find(z=>z?.timeframe==='WEEKLY')||null;
  const nearestUp=lifecycle?.session_liquidity?.nearest_above??null;
  const nearestDown=lifecycle?.session_liquidity?.nearest_below??null;
  const triggers=[];

  triggers.push({
    id:'LIVE_XAUUSD_BRIDGE',
    state:live?'INFO':'BLOCKED',
    condition:live?'FRESH_BROKER_ANCHOR_PRESENT':'CONNECT_V186_READ_ONLY_MT5',
    detail:live?`Broker XAUUSD anchor is fresh at ${r(price,2)}.`:'Fresh broker XAUUSD is required before any timing or proximity trigger can be live-qualified.',
    live_required:true,satisfied:live
  });

  const next=nextWindowInfo.next;
  triggers.push({
    id:'NEXT_SIGNAL_WINDOW',
    state:next?.phase==='ACTIVE'?'ACTIVE_REVIEW':next?.phase==='PREP'?'PREP':'WATCH',
    condition:next?.phase==='ACTIVE'?`${next.key}_WINDOW_ACTIVE`:next?.phase==='PREP'?`${next.key}_WINDOW_PREP`:`${next?.key??'UNKNOWN'}_NEXT`,
    detail:next?.phase==='ACTIVE'?`${next.label} signal window is active.`:next?.phase==='PREP'
      ?`${next.label} begins in about ${next.minutes_to_start} minutes.`
      :next?.minutes_to_start==null?'Next signal window unavailable.':`${next.label} begins in about ${next.minutes_to_start} minutes.`,
    live_required:false,satisfied:next?.phase==='ACTIVE'
  });

  const dailyLower=zoneDistance(price,daily?.lower_zone);
  const weeklyLower=zoneDistance(price,weekly?.lower_zone);
  for(const [id,label,z] of [['DAILY_LOWER_ZONE','Daily',dailyLower],['WEEKLY_LOWER_ZONE','Weekly',weeklyLower]]){
    const near=z?.distance!=null&&z.distance<=5;
    triggers.push({
      id,state:!live?'BLOCKED':z?.state==='INSIDE'?'ACTIVE_REVIEW':near?'ARMED':'WATCH',
      condition:z?.state==='INSIDE'?`${label.toUpperCase()}_LOWER_ZONE_TOUCH`:near?`${label.toUpperCase()}_LOWER_ZONE_APPROACH`:`${label.toUpperCase()}_LOWER_ZONE_WATCH`,
      detail:z==null?`${label} zone unavailable.`:z.state==='INSIDE'?`Price is inside the ${label.toLowerCase()} lower tradeable zone.`:
        `Distance to ${label.toLowerCase()} lower-zone edge: ${z.distance}.`,
      live_required:true,satisfied:live&&z?.state==='INSIDE'
    });
  }

  const candidates=[nearestUp,nearestDown].filter(Boolean).sort((a,b)=>Math.abs(Number(a.distance))-Math.abs(Number(b.distance)));
  const nearest=candidates[0]||null;
  const nearestDistance=nearest?Math.abs(Number(nearest.distance)):null;
  triggers.push({
    id:'SESSION_LIQUIDITY_PROXIMITY',
    state:!live?'BLOCKED':nearestDistance!=null&&nearestDistance<=3?'ACTIVE_REVIEW':nearestDistance!=null&&nearestDistance<=8?'ARMED':'WATCH',
    condition:nearest?`${nearest.session}_${nearest.kind}_PROXIMITY`:'SESSION_LIQUIDITY_UNAVAILABLE',
    detail:nearest?`${nearest.session} ${String(nearest.kind).replaceAll('_',' ')} at ${r(nearest.price,2)} · distance ${r(nearestDistance,2)}.`:'No session-liquidity level is currently available.',
    live_required:true,satisfied:live&&nearestDistance!=null&&nearestDistance<=3
  });

  const acceptance=String(ss?.acceptance||'UNKNOWN');
  const reclaimTentative=/RECLAIM_TENTATIVE/.test(acceptance);
  const resolved=/REJECTION_ACCEPTED|ACCEPTANCE_CONFIRMED|RECLAIM_ACCEPTED/.test(acceptance);
  triggers.push({
    id:'LIQUIDITY_TRANSITION',
    state:reclaimTentative?'ARMED':resolved?'ACTIVE_REVIEW':'WATCH',
    condition:reclaimTentative?'RECLAIM_CONFIRMATION_PENDING':resolved?'TRANSITION_RESOLVED':'WAIT_FOR_RAID_RECLAIM_ACCEPTANCE',
    detail:`${ss?.phase??'PHASE_UNKNOWN'} · ${acceptance} · ${ss?.extension_state??'EXTENSION_UNKNOWN'}.`,
    live_required:false,satisfied:resolved
  });

  const failed=String(st?.event?.dominant_state||'').startsWith('FAILED_BREAKOUT_');
  triggers.push({
    id:'BREAKOUT_FAILURE_REVIEW',
    state:failed?'ARMED':'WATCH',
    condition:failed?String(st.event.dominant_state):'NO_CONFIRMED_BREAKOUT_FAILURE',
    detail:failed?`${st.event.dominant_state} · direction candidate ${st?.direction_candidate??'NEUTRAL'} · quality ${st.event.quality_score??'n/a'}.`:'No confirmed breakout failure is active.',
    live_required:false,satisfied:failed
  });

  const signalDay=sd?.state==='SIGNAL_DAY_CONFIRMED';
  const signalTime=st?.state==='ACTIVE_SIGNAL_TIME';
  const reviewReady=signalDay&&signalTime&&live&&triggers.some(t=>t.id==='LIQUIDITY_TRANSITION'&&t.satisfied);
  const state=reviewReady?'HUMAN_REVIEW_READY'
    :!live?'WAITING_FOR_LIVE_XAUUSD'
    :signalDay&&!signalTime?'WAITING_FOR_SIGNAL_TIME'
    :signalDay?'WATCHING_LIFECYCLE':'NORMAL_DAY';

  triggers.sort((a,b)=>priorityRank(a.state)-priorityRank(b.state));
  return{
    ok:true,version:'v189-gold-trigger-watch-v1',generated_at:now.toISOString(),symbol:'XAUUSD',
    state,
    anchor:{price:r(price,2),state:lifecycle?.anchor?.state??'UNAVAILABLE'},
    next_signal_window:nextWindowInfo,
    context:{
      signal_day:sd?.state??'UNKNOWN',signal_day_score:n(sd?.score),
      signal_time:st?.state??'UNKNOWN',direction_candidate:st?.direction_candidate??'NEUTRAL',
      lifecycle_stage:life?.stage??'UNKNOWN',day_state:dna?.day_state??'UNKNOWN',
      liquidity_phase:ss?.phase??'UNKNOWN',acceptance:ss?.acceptance??'UNKNOWN'
    },
    triggers,
    review_gate:{
      ready:reviewReady,
      requirements:{
        signal_day_confirmed:signalDay,
        signal_time_active:signalTime,
        fresh_broker_xauusd:live,
        liquidity_transition_resolved:triggers.some(t=>t.id==='LIQUIDITY_TRANSITION'&&t.satisfied)
      },
      meaning:'Human review readiness only. It is not order permission.'
    },
    decision_compression:{
      what_changed:`${life?.stage??'UNKNOWN'} · ${st?.direction_candidate??'NEUTRAL'}`,
      what_matters:reviewReady?'All V189 review prerequisites are present; inspect evidence manually.':
        !live?'Attach V186 read-only MT5 to live-qualify proximity and timing triggers.':
        !signalTime?'Wait for the next qualified signal window.':'Wait for liquidity transition confirmation.',
      action_permitted:'WAIT',capital_permission:'0R'
    },
    governance:{
      trigger_watch_not_probability:true,alerts_are_review_prompts_only:true,
      no_automatic_orders:true,automatic_execution:false,machine_execution_allowed:false,
      live_order_submission_enabled:false,action_permitted:'WAIT',capital_permission:'0R'
    }
  };
}
