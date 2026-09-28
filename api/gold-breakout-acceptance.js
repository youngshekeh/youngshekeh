const VERSION='v83-breakout-acceptance-detector-v1';
const UA='THE-FATHER-ANALYTICS/83.0';

async function getJson(path,timeout=10000){
  try{
    const r=await fetch(`https://thefatheranalytics.com${path}`,{
      headers:{Accept:'application/json','User-Agent':UA},cache:'no-store',signal:AbortSignal.timeout(timeout)
    });
    return {ok:r.ok,status:r.status,body:await r.json().catch(()=>null)};
  }catch(error){return {ok:false,status:0,body:null,error:String(error).slice(0,160)}}
}
async function chart(){
  const u='https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=5m&range=5d&includePrePost=true';
  try{
    const r=await fetch(u,{headers:{'User-Agent':UA,Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(9000)});
    if(!r.ok)return {ok:false,status:r.status};
    const j=await r.json();const x=j?.chart?.result?.[0];
    return x?{ok:true,status:r.status,result:x}:{ok:false,status:r.status};
  }catch(error){return {ok:false,status:0,error:String(error).slice(0,160)}}
}
function num(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function chicagoDate(ts){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(ts*1000));
  const get=t=>p.find(x=>x.type===t)?.value||'0';
  return {y:+get('year'),m:+get('month'),d:+get('day'),hour:+get('hour'),minute:+get('minute')};
}
function sessionLabel(ts){
  const p=chicagoDate(ts);
  const base=new Date(Date.UTC(p.y,p.m-1,p.d,12));
  if(p.hour*60+p.minute>=17*60)base.setUTCDate(base.getUTCDate()+1);
  return base.toISOString().slice(0,10);
}
function analyzeDown(bars,level,priorRange){
  const first=bars.findIndex(b=>b.low<level||b.close<level);
  if(first<0)return {state:'NO_DOWNSIDE_BREAK',touched:false};
  const after=bars.slice(first);
  const closesBelow=after.filter(b=>b.close<level).length;
  const closeRatio=after.length?closesBelow/after.length:0;
  const current=after.at(-1);
  const minLow=Math.min(...after.map(b=>b.low));
  const extension=level-minLow;
  let consecutiveBelow=0;
  for(let i=after.length-1;i>=0&&after[i].close<level;i--)consecutiveBelow++;
  let consecutiveReclaim=0;
  for(let i=after.length-1;i>=0&&after[i].close>=level;i--)consecutiveReclaim++;
  const extensionRatio=priorRange>0?extension/priorRange:0;
  let state='BREAKOUT_DOWN_TENTATIVE';
  if(current.close>=level&&consecutiveReclaim>=2)state='FAILED_BREAKOUT_DOWN';
  else if(current.close<level&&consecutiveBelow>=3&&closeRatio>=0.65&&extensionRatio>=0.08)state='ACCEPTED_BREAKOUT_DOWN';
  const risk=state==='FAILED_BREAKOUT_DOWN'?'CONFIRMED_FAILURE':
    state==='BREAKOUT_DOWN_TENTATIVE'?'ELEVATED':
    current.close<level&&Math.abs(current.close-level)/level<0.001?'WATCH_RECLAIM':'NORMAL';
  const score=Math.max(0,Math.min(100,Math.round(closeRatio*45+Math.min(25,consecutiveBelow*5)+Math.min(30,extensionRatio*100))));
  return {
    state,touched:true,first_break_ts:after[0].ts,bars_since_break:after.length,
    closes_beyond:closesBelow,close_acceptance_pct:Number((closeRatio*100).toFixed(1)),
    consecutive_beyond:consecutiveBelow,consecutive_reclaim:consecutiveReclaim,
    extension:Number(extension.toFixed(2)),extension_vs_prior_range:Number(extensionRatio.toFixed(3)),
    acceptance_minutes:consecutiveBelow*5,current_close:Number(current.close.toFixed(2)),
    level:Number(level.toFixed(2)),quality_score:score,false_breakout_risk:risk
  };
}
function analyzeUp(bars,level,priorRange){
  const first=bars.findIndex(b=>b.high>level||b.close>level);
  if(first<0)return {state:'NO_UPSIDE_BREAK',touched:false};
  const after=bars.slice(first);
  const closesAbove=after.filter(b=>b.close>level).length;
  const closeRatio=after.length?closesAbove/after.length:0;
  const current=after.at(-1);
  const maxHigh=Math.max(...after.map(b=>b.high));
  const extension=maxHigh-level;
  let consecutiveAbove=0;
  for(let i=after.length-1;i>=0&&after[i].close>level;i--)consecutiveAbove++;
  let consecutiveReclaim=0;
  for(let i=after.length-1;i>=0&&after[i].close<=level;i--)consecutiveReclaim++;
  const extensionRatio=priorRange>0?extension/priorRange:0;
  let state='BREAKOUT_UP_TENTATIVE';
  if(current.close<=level&&consecutiveReclaim>=2)state='FAILED_BREAKOUT_UP';
  else if(current.close>level&&consecutiveAbove>=3&&closeRatio>=0.65&&extensionRatio>=0.08)state='ACCEPTED_BREAKOUT_UP';
  const risk=state==='FAILED_BREAKOUT_UP'?'CONFIRMED_FAILURE':
    state==='BREAKOUT_UP_TENTATIVE'?'ELEVATED':
    current.close>level&&Math.abs(current.close-level)/level<0.001?'WATCH_RECLAIM':'NORMAL';
  const score=Math.max(0,Math.min(100,Math.round(closeRatio*45+Math.min(25,consecutiveAbove*5)+Math.min(30,extensionRatio*100))));
  return {
    state,touched:true,first_break_ts:after[0].ts,bars_since_break:after.length,
    closes_beyond:closesAbove,close_acceptance_pct:Number((closeRatio*100).toFixed(1)),
    consecutive_beyond:consecutiveAbove,consecutive_reclaim:consecutiveReclaim,
    extension:Number(extension.toFixed(2)),extension_vs_prior_range:Number(extensionRatio.toFixed(3)),
    acceptance_minutes:consecutiveAbove*5,current_close:Number(current.close.toFixed(2)),
    level:Number(level.toFixed(2)),quality_score:score,false_breakout_risk:risk
  };
}
function selfTest(){
  const downLevel=100,range=10;
  const accepted=[
    {ts:1,open:101,high:101,low:99,close:99.2},{ts:2,open:99.2,high:99.5,low:98.4,close:98.8},
    {ts:3,open:98.8,high:99.1,low:97.9,close:98.1},{ts:4,open:98.1,high:98.5,low:97.4,close:97.8}
  ];
  const failed=[
    {ts:1,open:101,high:101,low:99,close:99.4},{ts:2,open:99.4,high:100.4,low:99.1,close:100.2},
    {ts:3,open:100.2,high:100.8,low:100,close:100.5}
  ];
  const a=analyzeDown(accepted,downLevel,range),f=analyzeDown(failed,downLevel,range);
  return {
    accepted_fixture:a.state==='ACCEPTED_BREAKOUT_DOWN',
    failed_fixture:f.state==='FAILED_BREAKOUT_DOWN',
    accepted_state:a.state,failed_state:f.state,
    passed:a.state==='ACCEPTED_BREAKOUT_DOWN'&&f.state==='FAILED_BREAKOUT_DOWN'
  };
}
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'})}
  const u=new URL(req.url,'https://thefatheranalytics.com');
  if(u.searchParams.get('selftest')==='1'){
    const t=selfTest();
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({ok:t.passed,version:VERSION,checked_at:new Date().toISOString(),self_test:t,
      governance:{action_permitted:'WAIT',capital_permission:'0R',production_data_used:false}});
  }
  const [day,c,q]=await Promise.all([getJson('/api/gold-day-state'),chart(),getJson('/api/data-quality-sentinel')]);
  if(!day.ok||!day.body?.ok||!c.ok||q.body?.state==='QUARANTINE'){
    return res.status(200).json({ok:false,version:VERSION,state:'DATA_GATED',quality_state:q.body?.state??'UNAVAILABLE',
      governance:{action_permitted:'WAIT',capital_permission:'0R'}});
  }
  const targetSession=day.body.session_label;
  const ts=c.result.timestamp||[],qq=c.result.indicators?.quote?.[0]||{};
  const bars=[];
  for(let i=0;i<ts.length;i++){
    if(sessionLabel(ts[i])!==targetSession)continue;
    const open=num(qq.open?.[i]),high=num(qq.high?.[i]),low=num(qq.low?.[i]),close=num(qq.close?.[i]);
    if([open,high,low,close].some(v=>v===null)||high<=0||low<=0||high<low)continue;
    bars.push({ts:ts[i],open,high,low,close});
  }
  const priorHigh=num(day.body.previous?.high),priorLow=num(day.body.previous?.low),priorRange=num(day.body.previous?.range)||0;
  const downside=priorLow===null?{state:'UNAVAILABLE',touched:false}:analyzeDown(bars,priorLow,priorRange);
  const upside=priorHigh===null?{state:'UNAVAILABLE',touched:false}:analyzeUp(bars,priorHigh,priorRange);
  let dominant='NO_BREAKOUT';
  if(String(downside.state).startsWith('ACCEPTED'))dominant=downside.state;
  else if(String(upside.state).startsWith('ACCEPTED'))dominant=upside.state;
  else if(String(downside.state).startsWith('FAILED'))dominant=downside.state;
  else if(String(upside.state).startsWith('FAILED'))dominant=upside.state;
  else if(downside.touched)dominant=downside.state;
  else if(upside.touched)dominant=upside.state;

  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
    ok:true,version:VERSION,generated_at:new Date().toISOString(),truth_label:'SHADOW_BREAKOUT_ACCEPTANCE',
    session_label:targetSession,quality_state:q.body?.state??'UNAVAILABLE',bars_analyzed:bars.length,
    dominant_state:dominant,downside,upside,
    interpretation:{
      rule:'Acceptance requires repeated closes beyond the prior level plus measurable extension. Reclaim back through the level can classify failure.',
      probability_claim:false
    },
    governance:{canonical:false,action_permitted:'WAIT',capital_permission:'0R',automatic_execution:false}
  });
}