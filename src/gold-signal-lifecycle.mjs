function n(v){if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null;}
const r=(v,d=2)=>{const x=n(v);return x==null?null:Number(x.toFixed(d));};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function level(v,basis){const x=n(v);return x==null?null:r(basis==null?x:x-basis,2);}
function distance(price,target){const p=n(price),t=n(target);return p==null||t==null?null:r(t-p,2);}
function copyRange(x,basis){
 if(!x)return null;
 return{
  date:x.date??null,open:level(x.open,basis),high:level(x.high,basis),low:level(x.low,basis),close:level(x.close,basis),
  range:r(x.range,2),bars:n(x.bars),first_ts:n(x.first_ts),last_ts:n(x.last_ts),
  opening_range:x.opening_range?{high:level(x.opening_range.high,basis),low:level(x.opening_range.low,basis),range:r(x.opening_range.range,2),bars:n(x.opening_range.bars)}:null
 };
}
function translateSessions(raw,basis,anchor){
 const sessions=Array.isArray(raw?.sessions)?raw.sessions:[];
 return sessions.map(s=>{
   const latest=copyRange(s?.latest,basis),previous=copyRange(s?.previous,basis);
   const lo=latest?.low,hi=latest?.high,p=n(anchor);
   const rawPosition=p!=null&&lo!=null&&hi!=null&&hi>lo?(p-lo)/(hi-lo)*100:null;
   return{key:s?.key??'UNKNOWN',label:s?.label??s?.key??'UNKNOWN',state:s?.state??'UNKNOWN',time_zone:s?.time_zone??null,
     window_local:s?.window_local??null,sweep_state:s?.sweep_state??'UNKNOWN',latest,previous,
     price_position_pct:r(rawPosition,1),price_relation:rawPosition==null?'UNKNOWN':rawPosition<0?'BELOW_SESSION_RANGE':rawPosition>100?'ABOVE_SESSION_RANGE':rawPosition<=25?'LOWER_QUARTILE':rawPosition>=75?'UPPER_QUARTILE':'MID_RANGE'};
 });
}
function gatherLevels(sessions,anchor){
 const rows=[];
 for(const s of sessions){
   const L=s?.latest;if(!L)continue;
   for(const [kind,price] of [['HIGH',L.high],['LOW',L.low],['OR_HIGH',L.opening_range?.high],['OR_LOW',L.opening_range?.low]]){
     const p=n(price);if(p==null)continue;
     rows.push({session:s.key,kind,price:p,distance:distance(anchor,p)});
   }
 }
 const p=n(anchor);
 const above=p==null?null:rows.filter(x=>x.price>p).sort((a,b)=>a.price-b.price)[0]||null;
 const below=p==null?null:rows.filter(x=>x.price<p).sort((a,b)=>b.price-a.price)[0]||null;
 return{above,below,all:rows.sort((a,b)=>a.price-b.price)};
}
function lifecycle(signal,liquidity){
 const day=signal?.signal_day?.state;
 const time=signal?.signal_time?.state;
 const live=signal?.live_anchor?.state==='BROKER_LIVE';
 const phase=String(liquidity?.state?.phase||'UNKNOWN');
 const acceptance=String(liquidity?.state?.acceptance||'UNKNOWN');
 const extension=String(liquidity?.state?.extension_state||'UNKNOWN');
 const exhaustion=String(liquidity?.state?.exhaustion_risk||'UNKNOWN');
 let stage='NORMAL_DAY',next='Wait for a qualified Signal Day.';
 if(day==='SIGNAL_DAY_CONFIRMED'){
   stage='SIGNAL_DAY_CONFIRMED';next='Wait for a primary Signal Time window.';
   if(time==='PRE_SIGNAL_WINDOW'){stage='PRE_SIGNAL_WINDOW';next='Track session liquidity and opening-range formation.';}
   else if(time==='SIGNAL_WINDOW_WAITING_FOR_LIVE_XAUUSD'){stage='WAITING_FOR_LIVE_XAUUSD';next='Require a fresh broker XAUUSD anchor before timing can be live-qualified.';}
   else if(time==='ACTIVE_SIGNAL_TIME'){
     stage='ACTIVE_SIGNAL_SCAN';next='Require a structural liquidity transition.';
     if(phase.includes('RAID')){stage='LIQUIDITY_RAID';next='Watch for reclaim/rejection or sustained acceptance.';}
     if(/REJECTION_ACCEPTED|RECLAIM/i.test(acceptance)){stage='RECLAIM_ACCEPTED';next='Monitor follow-through without treating detection as order permission.';}
     else if(/ACCEPT/i.test(acceptance)&&!acceptance.includes('REJECTION')){stage='ACCEPTANCE_CONFIRMED';next='Monitor extension and failure risk.';}
     if(extension==='EXTENDED'){stage='EXTENSION_ACTIVE';next='Watch extension quality and exhaustion risk.';}
     if(extension==='EXTENDED'&&exhaustion==='WATCH'){stage='EXTENSION_EXHAUSTION_WATCH';next='Protect against late-stage continuation assumptions.';}
   }else if(time==='OUTSIDE_SIGNAL_WINDOW'){stage='OFF_WINDOW_STRUCTURE_WATCH';next='Preserve levels and wait for the next qualified timing window.';}
 }
 let score=0;
 if(day==='SIGNAL_DAY_CONFIRMED')score+=35;
 if(signal?.signal_time?.active_window)score+=20;
 if(live)score+=20;
 if(phase!=='UNKNOWN'&&!/BALANCED|NEUTRAL/.test(phase))score+=10;
 if(!/UNKNOWN|PENDING/.test(acceptance))score+=10;
 const dzone=signal?.tradeable_zones?.zones?.find?.(z=>z?.timeframe==='DAILY');
 if(['LOWER_TRADEABLE_ZONE','UPPER_TRADEABLE_ZONE'].includes(dzone?.state))score+=5;
 return{stage,next_condition:next,detector_score:clamp(score,0,100),live_anchor_required:!live,
   inputs:{signal_day:day??'UNKNOWN',signal_time:time??'UNKNOWN',phase,acceptance,extension,exhaustion}};
}
function translateCross(x,basis){
 if(!x||x.state==='UNAVAILABLE')return x??{state:'UNAVAILABLE'};
 return{...x,reference_high:level(x.reference_high,basis),reference_low:level(x.reference_low,basis),
  active_high:level(x.active_high,basis),active_low:level(x.active_low,basis),active_close:level(x.active_close,basis)};
}
export function buildGoldSignalLifecycle({signal={},liquidity={},sessions={}}={}){
 const anchor=n(signal?.live_anchor?.price),basis=n(signal?.live_anchor?.futures_spot_basis_usd);
 const translated=translateSessions(sessions,basis,anchor);
 const levels=gatherLevels(translated,anchor);
 const life=lifecycle(signal,liquidity);
 return{
  ok:signal?.ok===true&&sessions?.ok===true,
  version:'v188-gold-signal-lifecycle-v1',
  generated_at:new Date().toISOString(),
  symbol:'XAUUSD',
  anchor:{price:r(anchor,2),state:signal?.live_anchor?.state??'UNAVAILABLE',basis_usd:r(basis,2),
    level_basis:basis==null?'GC_FUTURES_STRUCTURE':'XAUUSD_LIVE_TRANSLATED_FROM_GC_STRUCTURE'},
  lifecycle:life,
  structural_state:{
    phase:liquidity?.state?.phase??null,direction:liquidity?.state?.direction??null,
    acceptance:liquidity?.state?.acceptance??null,extension_state:liquidity?.state?.extension_state??null,
    exhaustion_risk:liquidity?.state?.exhaustion_risk??null,failed_break_risk:liquidity?.state?.failed_break_risk??null,
    invalidation_level:level(liquidity?.state?.invalidation_level,basis),
    evidence:Array.isArray(liquidity?.state?.evidence)?liquidity.state.evidence:[]
  },
  session_liquidity:{
    sessions:translated,
    nearest_above:levels.above,
    nearest_below:levels.below,
    all_levels:levels.all,
    cross_session:{
      london_vs_asia:translateCross(sessions?.cross_session?.london_vs_asia,basis),
      new_york_vs_london:translateCross(sessions?.cross_session?.new_york_vs_london,basis)
    }
  },
  flags:{
    signal_day_confirmed:signal?.signal_day?.state==='SIGNAL_DAY_CONFIRMED',
    signal_window_active:signal?.signal_time?.state==='ACTIVE_SIGNAL_TIME',
    live_xauusd_fresh:signal?.live_anchor?.state==='BROKER_LIVE',
    tradeable_extreme:['LOWER_TRADEABLE_ZONE','UPPER_TRADEABLE_ZONE'].includes(signal?.tradeable_zones?.zones?.find?.(z=>z?.timeframe==='DAILY')?.state),
    liquidity_transition_resolved:/^(REJECTION_ACCEPTED|ACCEPTANCE_CONFIRMED|RECLAIM_ACCEPTED)$/.test(String(liquidity?.state?.acceptance||'UNKNOWN'))
  },
  decision_compression:{
    state:`${life.stage} · ${signal?.signal_time?.direction_candidate??'NEUTRAL'}`,
    what_matters:life.next_condition,
    action_permitted:'WAIT',capital_permission:'0R'
  },
  governance:{detector_score_not_probability:true,session_levels_are_framework_references:true,
    automatic_execution:false,machine_execution_allowed:false,live_order_submission_enabled:false,
    action_permitted:'WAIT',capital_permission:'0R'}
 };
}
