function n(v){if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null;}
const r=(v,d=2)=>{const x=n(v);return x==null?null:Number(x.toFixed(d));};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

export function zonedClock(now,timeZone){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(now);
  const get=t=>parts.find(p=>p.type===t)?.value||'';
  const hour=Number(get('hour')),minute=Number(get('minute'));
  return{day:get('weekday'),hour,minute,minute_of_day:hour*60+minute,label:`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`};
}
function windowState(clock,start,end,prep=30){
  const weekday=!['Sat','Sun'].includes(clock.day);
  if(!weekday)return'CLOSED';
  if(clock.minute_of_day>=start&&clock.minute_of_day<end)return'ACTIVE';
  if(clock.minute_of_day>=start-prep&&clock.minute_of_day<start)return'PREP';
  if(clock.minute_of_day>=end&&clock.minute_of_day<end+60)return'POST';
  return'OFF';
}
export function signalWindows(now){
  const tokyo=zonedClock(now,'Asia/Tokyo');
  const london=zonedClock(now,'Europe/London');
  const ny=zonedClock(now,'America/New_York');
  const sessions=[
    {key:'ASIA',label:'Tokyo 08:00–10:00',clock:tokyo,state:windowState(tokyo,8*60,10*60)},
    {key:'LONDON',label:'London 08:00–10:30',clock:london,state:windowState(london,8*60,10*60+30)},
    {key:'NEW_YORK',label:'COMEX 08:20–10:30',clock:ny,state:windowState(ny,8*60+20,10*60+30)}
  ];
  const active=sessions.find(x=>x.state==='ACTIVE')||null;
  const prep=sessions.find(x=>x.state==='PREP')||null;
  return{sessions,active_window:active?.key??null,prep_window:prep?.key??null,
    clocks:{tokyo:tokyo.label,london:london.label,new_york:ny.label}};
}
function directionFrom(breakout,confluence){
  const d=String(breakout?.dominant_state||'').toUpperCase();
  if(d==='FAILED_BREAKOUT_UP')return'SHORT_REPAIR_BIAS';
  if(d==='FAILED_BREAKOUT_DOWN')return'LONG_REPAIR_BIAS';
  if(d.includes('BREAKOUT_UP')&&!d.includes('FAILED'))return'LONG_CONTINUATION_BIAS';
  if(d.includes('BREAKOUT_DOWN')&&!d.includes('FAILED'))return'SHORT_CONTINUATION_BIAS';
  const intraday=String(confluence?.intraday?.direction||'').toUpperCase();
  if(intraday.includes('UP'))return'LONG_REPAIR_BIAS';
  if(intraday.includes('DOWN'))return'SHORT_REPAIR_BIAS';
  return'NEUTRAL';
}
function signalDay(day,breakout,confluence){
  const ds=day?.day_state||{};
  let score=0;
  const reasons=[];
  if(ds.framework_signal_day===true){score+=40;reasons.push('FRAMEWORK_SIGNAL_DAY');}
  const range=n(ds.range_vs_adr??day?.range_model?.range_vs_adr);
  if(range!=null&&range>=1){score+=20;reasons.push('RANGE_EXPANSION_GE_1_ADR');}
  const bq=n(ds.breakout_quality);
  if(bq!=null&&bq>=60){score+=15;reasons.push('BREAKOUT_QUALITY_GE_60');}
  const dominant=String(breakout?.dominant_state||'');
  if(dominant.includes('FAILED_BREAKOUT')||dominant.includes('ACCEPTED')){score+=15;reasons.push('BREAKOUT_STATE_RESOLVED');}
  const pressure=Math.abs(n(confluence?.intraday?.pressure_score)??0);
  if(pressure>=2){score+=10;reasons.push('STRUCTURAL_PRESSURE_GE_2');}
  score=clamp(score,0,100);
  return{
    score,
    state:score>=70?'SIGNAL_DAY_CONFIRMED':score>=45?'SIGNAL_DAY_WATCH':'NORMAL_DAY',
    day_state:String(ds.day_state||'UNKNOWN'),
    framework_signal_day:ds.framework_signal_day===true,
    range_vs_adr:r(range,3),
    breakout_quality:r(bq,0),
    reasons
  };
}
function translateLevel(level,basis){
  const x=n(level);return x==null?null:r(basis==null?x:x-basis,2);
}
function zoneView(z,basis,anchor){
  const low=n(z?.low),high=n(z?.high),mid=n(z?.mid);
  if(low==null||high==null||!(high>low))return null;
  const range=high-low,q25=low+range*.25,q75=low+range*.75;
  const lo=translateLevel(low,basis),hi=translateLevel(high,basis);
  const lowerHigh=translateLevel(q25,basis),upperLow=translateLevel(q75,basis);
  const eqLow=translateLevel((mid??((low+high)/2))-range*.05,basis);
  const eqHigh=translateLevel((mid??((low+high)/2))+range*.05,basis);
  const translatedMid=translateLevel(mid??((low+high)/2),basis);
  const pos=anchor!=null&&lo!=null&&hi!=null&&hi>lo?clamp((anchor-lo)/(hi-lo)*100,0,100):n(z?.location?.position_pct);
  const state=pos==null?'UNKNOWN':pos<=25?'LOWER_TRADEABLE_ZONE':pos>=75?'UPPER_TRADEABLE_ZONE':pos>=45&&pos<=55?'EQUILIBRIUM':'MID_RANGE';
  return{
    timeframe:String(z?.timeframe||'UNKNOWN').toUpperCase(),key:z?.key??null,
    low:lo,high:hi,mid:translatedMid,position_pct:r(pos,1),state,
    lower_zone:{low:lo,high:lowerHigh},
    equilibrium_zone:{low:eqLow,high:eqHigh},
    upper_zone:{low:upperLow,high:hi},
    source_location:z?.location?.zone??null
  };
}
function eventTiming(breakout){
  const d=String(breakout?.dominant_state||'');
  const side=d.includes('UP')?breakout?.upside:d.includes('DOWN')?breakout?.downside:null;
  const ts=n(side?.first_break_ts);
  return{
    dominant_state:d||'UNKNOWN',
    first_break_at:ts==null?null:new Date(ts*1000).toISOString(),
    bars_since_break:n(side?.bars_since_break),
    acceptance_minutes:n(side?.acceptance_minutes),
    quality_score:n(side?.quality_score),
    false_breakout_risk:side?.false_breakout_risk??null
  };
}
export function buildGoldSignalMap({now=new Date(),live={},day={},zones={},confluence={},breakout={}}={}){
  const q=live?.quote||{};
  const liveFresh=live?.state==='BROKER_LIVE'&&n(q?.mid)!=null&&n(q?.age_seconds)!=null&&n(q.age_seconds)<3;
  const structuralPrice=n(zones?.price);
  const liveMid=liveFresh?n(q.mid):null;
  const basis=liveFresh&&structuralPrice!=null?structuralPrice-liveMid:null;
  const anchor=liveMid??structuralPrice;
  const tfZones=(Array.isArray(zones?.zones)?zones.zones:[]).map(z=>zoneView(z,basis,anchor)).filter(Boolean);
  const sd=signalDay(day,breakout,confluence);
  const windows=signalWindows(now);
  const active=windows.active_window;
  let signalTime='OUTSIDE_SIGNAL_WINDOW';
  if(sd.state==='SIGNAL_DAY_CONFIRMED'&&active&&liveFresh)signalTime='ACTIVE_SIGNAL_TIME';
  else if(sd.state==='SIGNAL_DAY_CONFIRMED'&&active&&!liveFresh)signalTime='SIGNAL_WINDOW_WAITING_FOR_LIVE_XAUUSD';
  else if(sd.state==='SIGNAL_DAY_CONFIRMED'&&windows.prep_window)signalTime='PRE_SIGNAL_WINDOW';
  else if(sd.state!=='SIGNAL_DAY_CONFIRMED'&&active)signalTime='WINDOW_ACTIVE_NO_CONFIRMED_SIGNAL_DAY';

  const cluster=x=>x?{
    center:translateLevel(x.center,basis),low:translateLevel(x.low??x.center,basis),high:translateLevel(x.high??x.center,basis),
    strength:n(x.strength),labels:Array.isArray(x.labels)?x.labels:[],distance_pct:n(x.distance_pct)
  }:null;
  const direction=directionFrom(breakout,confluence);
  const timing=eventTiming(breakout);
  const primaryScore=clamp(sd.score+(liveFresh?15:0)+(active?10:0),0,100);

  return{
    ok:true,version:'v187-xauusd-signal-map-v1',generated_at:now.toISOString(),
    symbol:'XAUUSD',
    live_anchor:{
      state:liveFresh?'BROKER_LIVE':'STRUCTURAL_FALLBACK',
      price:r(anchor,2),bid:liveFresh?r(q.bid,2):null,ask:liveFresh?r(q.ask,2):null,
      quote_age_seconds:liveFresh?r(q.age_seconds,2):null,trade_mode:liveFresh?q.trade_mode:null,
      structural_gc_price:r(structuralPrice,2),futures_spot_basis_usd:r(basis,2),
      translation_quality:liveFresh?'LIVE_XAUUSD_ANCHORED_TO_DELAYED_GC_STRUCTURE':'DELAYED_GC_STRUCTURE_ONLY'
    },
    signal_day:sd,
    day_dna:{
      day_state:sd.day_state,
      liquidity_phase:confluence?.intraday?.phase??null,
      acceptance:confluence?.intraday?.acceptance??null,
      pressure_score:n(confluence?.intraday?.pressure_score),
      extension_state:confluence?.intraday?.extension_state??null,
      mtf_state:confluence?.multi_timeframe?.state??zones?.composite?.state??null,
      mtf_average_position_pct:r(confluence?.multi_timeframe?.average_position_pct??zones?.composite?.average_position_pct,1),
      breakout_state:timing.dominant_state
    },
    signal_time:{
      state:signalTime,active_window:active,prep_window:windows.prep_window,
      deterministic_quality_score:primaryScore,
      direction_candidate:direction,
      event:timing,
      clocks:windows.clocks,
      sessions:windows.sessions.map(s=>({key:s.key,label:s.label,state:s.state,local_time:s.clock.label}))
    },
    tradeable_zones:{
      price_basis:liveFresh?'XAUUSD_LIVE_TRANSLATED_FROM_GC_STRUCTURE':'GC_FUTURES_STRUCTURE',
      zones:tfZones,
      pivots:zones?.daily_pivots?Object.fromEntries(Object.entries(zones.daily_pivots).map(([k,v])=>[k,translateLevel(v,basis)])):null,
      nearest_above:cluster(confluence?.confluence?.nearest_above_cluster),
      nearest_below:cluster(confluence?.confluence?.nearest_below_cluster)
    },
    decision_compression:{
      what_changed:`${sd.state} · ${timing.dominant_state} · ${confluence?.intraday?.phase??'PHASE_UNKNOWN'}`,
      what_matters:active
        ?`${active} signal window is active; live XAUUSD anchor ${liveFresh?'is fresh':'is not connected/fresh'}.`
        :`Outside primary signal windows; preserve zones and wait for the next qualified timing window.`,
      direction_candidate:direction,
      action_permitted:'WAIT',
      capital_permission:'0R'
    },
    governance:{
      deterministic_detection_not_probability:true,
      tradeable_zones_are_framework_references:true,
      live_price_does_not_authorize_orders:true,
      automatic_execution:false,
      machine_execution_allowed:false,
      live_order_submission_enabled:false,
      action_permitted:'WAIT',
      capital_permission:'0R'
    }
  };
}
