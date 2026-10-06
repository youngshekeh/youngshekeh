const ORIGIN='https://thefatheranalytics.com';

function finite(value){
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}

function zoneBy(rows,name){
  return Array.isArray(rows)?rows.find(x=>String(x?.timeframe||'').toLowerCase()===name):null;
}

function uniqueLevels(rows){
  const seen=new Set();
  return rows.filter(row=>{
    const p=finite(row?.price);
    if(p===null) return false;
    const key=p.toFixed(2);
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function localMinutes(timeZone, now){
  const parts=new Intl.DateTimeFormat('en-GB',{
    timeZone,
    hour:'2-digit',
    minute:'2-digit',
    hourCycle:'h23'
  }).formatToParts(now);
  const hour=Number(parts.find(p=>p.type==='hour')?.value||0);
  const minute=Number(parts.find(p=>p.type==='minute')?.value||0);
  return hour*60+minute;
}

function sessionWindow(now){
  const windows=[
    {key:'ASIA',zone:'Asia/Tokyo',start:8*60,end:11*60},
    {key:'LONDON',zone:'Europe/London',start:7*60,end:10*60},
    {key:'NEW_YORK',zone:'America/New_York',start:8*60+30,end:11*60+30}
  ].map(w=>{
    const minute=localMinutes(w.zone,now);
    const active=minute>=w.start&&minute<w.end;
    const until=active?0:(minute<w.start?w.start-minute:(24*60-minute)+w.start);
    return {...w,minute,active,minutes_until:until};
  });
  const active=windows.find(w=>w.active)||null;
  const next=[...windows].sort((a,b)=>a.minutes_until-b.minutes_until)[0]||null;
  return {
    active_window:active?.key||'NONE',
    next_window:active?.key||next?.key||'NONE',
    minutes_until_next:active?0:(next?.minutes_until??null),
    windows:windows.map(({key,active,minutes_until})=>({key,active,minutes_until}))
  };
}

async function readBundle(){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(ORIGIN+'/api/q4-visual-data',{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-Q4-MACHINE/2.0'},
      cache:'no-store',
      signal:controller.signal,
      redirect:'error'
    });
    const body=await response.json().catch(()=>null);
    return response.ok&&body&&typeof body==='object'?body:null;
  }catch{
    return null;
  }finally{
    clearTimeout(timer);
  }
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Machine','Q4-RESEARCH-BRAIN-V2');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }

  const bundle=await readBundle();
  if(!bundle?.ok){
    return res.status(503).json({
      ok:false,
      version:'q4-machine-state-v2',
      state:'DATA_GATED',
      governance:{action_permitted:'WAIT',capital_permission:'0R',automatic_execution:false}
    });
  }

  const now=new Date();
  const day=bundle.day||{};
  const zones=bundle.zones||{};
  const liquidity=bundle.liquidity||{};
  const price=finite(day?.current?.price)??finite(zones?.price)??finite(liquidity?.price);
  const zoneRows=Array.isArray(zones?.zones)?zones.zones:[];
  const daily=zoneBy(zoneRows,'daily');
  const quarterly=zoneBy(zoneRows,'quarterly');
  const yearly=zoneBy(zoneRows,'yearly');
  const pivots=zones?.daily_pivots||{};
  const state=liquidity?.state||{};
  const dna=String(day?.day_state?.day_state||'WITHHELD');
  const direction=String(state?.direction||'WITHHELD');
  const acceptance=String(state?.acceptance||'WITHHELD');
  const breakout=finite(day?.day_state?.breakout_quality);
  const dailyZone=String(daily?.location?.zone||'WITHHELD');
  const quarterZone=String(quarterly?.location?.zone||'WITHHELD');

  let score=0;
  const evidence=[];
  if(/LOW_SWEEP/i.test(dna)){score+=20;evidence.push('low sweep rejection');}
  if(/UP/i.test(direction)){score+=20;evidence.push('repair direction up');}
  if(/RECLAIM/i.test(acceptance)){score+=20;evidence.push('reclaim accepted');}
  if((breakout??0)>=70){score+=20;evidence.push('breakout quality ≥70');}
  if(/EXPANDED/i.test(String(state?.extension_state||''))){score+=20;evidence.push('range expanded');}

  let transmutationState='STRUCTURE_WAITING';
  if(/RECLAIM/i.test(acceptance)&&/UP/i.test(direction)&&/LOW_SWEEP/i.test(dna)){
    transmutationState='RECLAIM_TO_EXPANSION_TEST';
  }else if(/UP/i.test(direction)&&/RECLAIM/i.test(acceptance)){
    transmutationState='UP_REPAIR_ACCEPTED';
  }else if(/DOWN/i.test(direction)){
    transmutationState='DOWNSIDE_ACCEPTANCE_TEST';
  }

  const tension=/DEEP_PREMIUM/i.test(dailyZone)&&/PREMIUM/i.test(quarterZone)
    ?'SHORT_HORIZON_PREMIUM_TENSION'
    :/DEEP_DISCOUNT/i.test(String(yearly?.location?.zone||''))
      ?'LONG_HORIZON_DISCOUNT_DIVERGENCE'
      :'BALANCED';

  const nearestAbove=liquidity?.liquidity_map?.nearest_above||day?.liquidity?.nearest_above||null;
  const nearestBelow=liquidity?.liquidity_map?.nearest_below||day?.liquidity?.nearest_below||null;
  const ladderAbove=Array.isArray(zones?.liquidity_ladder?.above)?zones.liquidity_ladder.above:[];
  const ladderBelow=Array.isArray(zones?.liquidity_ladder?.below)?zones.liquidity_ladder.below:[];

  const upside=uniqueLevels([
    nearestAbove,
    ...ladderAbove,
    {label:'DAILY_R2',price:pivots.r2},
    {label:'DAILY_R3',price:pivots.r3},
    {label:'Q4_HIGH',price:quarterly?.high}
  ]).filter(x=>price===null||finite(x.price)>price).sort((a,b)=>finite(a.price)-finite(b.price)).slice(0,5);

  const downside=uniqueLevels([
    nearestBelow,
    ...ladderBelow,
    {label:'Q4_EQUILIBRIUM',price:quarterly?.mid},
    {label:'DAILY_R1',price:pivots.r1},
    {label:'DAILY_PIVOT',price:pivots.pivot}
  ]).filter(x=>price===null||finite(x.price)<price).sort((a,b)=>finite(b.price)-finite(a.price)).slice(0,5);

  const timing=sessionWindow(now);
  const sourceTime=Date.parse(String(bundle.generated_at||''));
  const ageSec=Number.isFinite(sourceTime)?Math.max(0,Math.round((now.getTime()-sourceTime)/1000)):null;
  const usable=Number(bundle.usable_sources||0);
  const health=usable>=3&&(ageSec===null||ageSec<=120)?'SYNCHRONIZED':usable>0?'DEGRADED':'DATA_GATED';

  const currentPath=/UP/i.test(direction)&&/RECLAIM/i.test(acceptance)
    ?'UP_REPAIR'
    :/DOWN/i.test(direction)
      ?'DOWNSIDE_PRESSURE'
      :'BALANCED_WAIT';

  return res.status(200).json({
    ok:true,
    version:'q4-machine-state-v2',
    generated_at:now.toISOString(),
    price,
    day_dna:dna,
    transmutation:{
      state:transmutationState,
      rule_score:score,
      rule_score_label:'DETERMINISTIC_NOT_PROBABILITY',
      tension,
      evidence
    },
    signal_time:timing,
    scenario_tree:{
      current_path:currentPath,
      upside:upside.map(x=>({label:String(x.label||'LIQUIDITY'),price:finite(x.price)})),
      downside:downside.map(x=>({label:String(x.label||'LIQUIDITY'),price:finite(x.price)})),
      note:'Structural path map only. Levels are not entries, stops, targets, or trade instructions.'
    },
    heartbeat:{
      state:health,
      usable_sources:usable,
      source_age_seconds:ageSec,
      source_truth_label:String(bundle.truth_label||'UNKNOWN'),
      order_route:'OFF',
      automatic_execution:false,
      capital_permission:'0R'
    },
    decision_compression:{
      what_changed:transmutationState.replaceAll('_',' '),
      what_matters_now:`${currentPath.replaceAll('_',' ')} · ${tension.replaceAll('_',' ')} · active window ${timing.active_window}`,
      action_permitted:'WAIT'
    },
    governance:{
      canonical:false,
      research_only:true,
      action_permitted:'WAIT',
      capital_permission:'0R',
      automatic_execution:false,
      note:'Q4 Machine V2 compresses research state and timing. It cannot place, prepare, or authorize orders.'
    }
  });
}
