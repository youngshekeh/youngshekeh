const TFA_PRIVATE_AUTHZ='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v115-oidc-probe';
const UA='THE-FATHER-ANALYTICS/188.0';

function eq(a:string,b:string){if(!a||!b||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
async function authorized(req:Request){
  const auth=req.headers.get('authorization')||'',token=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';
  if(!token)return false;
  const sr=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(sr&&eq(token,sr))return true;
  try{const r=await fetch(TFA_PRIVATE_AUTHZ,{headers:{Authorization:auth,Accept:'application/json'},signal:AbortSignal.timeout(5000)});
    const j=await r.json().catch(()=>null);return r.ok&&j?.ok===true&&j?.state==='VERCEL_WORKLOAD_VERIFIED';}catch{return false}
}
function finite(v:any){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function parts(ts:number,tz:string){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(ts*1000));
  const get=(t:string)=>p.find(x=>x.type===t)?.value||'';
  const hour=+get('hour'),minute=+get('minute');
  return{date:`${get('year')}-${get('month')}-${get('day')}`,weekday:get('weekday'),hour,minute,minute_of_day:hour*60+minute};
}
function state(now:Date,tz:string,start:number,end:number){
  const ts=Math.floor(now.getTime()/1000),p=parts(ts,tz),weekday=!['Sat','Sun'].includes(p.weekday);
  if(!weekday)return'CLOSED';
  if(p.minute_of_day>=start&&p.minute_of_day<end)return'ACTIVE';
  if(p.minute_of_day>=start-30&&p.minute_of_day<start)return'PREP';
  if(p.minute_of_day>=end&&p.minute_of_day<end+60)return'POST';
  return'OFF';
}
function summarize(x:any[]){
  if(!x.length)return null;const s=[...x].sort((a,b)=>a.ts-b.ts);
  const high=Math.max(...s.map(b=>b.high)),low=Math.min(...s.map(b=>b.low));
  const or=s.slice(0,Math.min(6,s.length));
  const orHigh=Math.max(...or.map(b=>b.high)),orLow=Math.min(...or.map(b=>b.low));
  return{date:s[0].local_date,open:s[0].open,high,low,close:s.at(-1).close,range:high-low,bars:s.length,
    first_ts:s[0].ts,last_ts:s.at(-1).ts,opening_range:{high:orHigh,low:orLow,range:orHigh-orLow,bars:or.length}};
}
function venueWindows(bars:any[],venue:any,now:Date){
  const groups=new Map<string,any[]>();
  for(const b of bars){
    const p=parts(b.ts,venue.tz);
    if(['Sat','Sun'].includes(p.weekday)||p.minute_of_day<venue.start||p.minute_of_day>=venue.end)continue;
    const row={...b,local_date:p.date};
    if(!groups.has(p.date))groups.set(p.date,[]);
    groups.get(p.date)!.push(row);
  }
  const windows=[...groups.values()].map(summarize).filter(Boolean) as any[];
  windows.sort((a,b)=>a.last_ts-b.last_ts);
  const latest=windows.at(-1)||null,previous=windows.at(-2)||null;
  let sweep='NO_PRIOR_WINDOW';
  if(latest&&previous){
    if(latest.high>previous.high&&latest.close<=previous.high)sweep='HIGH_SWEEP_REJECTION';
    else if(latest.low<previous.low&&latest.close>=previous.low)sweep='LOW_SWEEP_REJECTION';
    else if(latest.close>previous.high)sweep='UPSIDE_ACCEPTANCE';
    else if(latest.close<previous.low)sweep='DOWNSIDE_ACCEPTANCE';
    else sweep='INSIDE_PRIOR_RANGE';
  }
  return{
    key:venue.key,label:venue.label,time_zone:venue.tz,window_local:venue.window,
    state:state(now,venue.tz,venue.start,venue.end),latest,previous,sweep_state:sweep,
    methodology:'Observed GC=F 5m bars inside the venue-local signal window'
  };
}
function crossSession(a:any,b:any){
  const A=a?.latest,B=b?.latest;
  if(!A||!B)return{state:'UNAVAILABLE'};
  const above=B.high>A.high,below=B.low<A.low;
  let state='INSIDE_REFERENCE';
  if(above&&below)state='TWO_SIDED_RAID';
  else if(above&&B.close<=A.high)state='HIGH_RAID_REJECTION';
  else if(below&&B.close>=A.low)state='LOW_RAID_REJECTION';
  else if(B.close>A.high)state='UPSIDE_ACCEPTANCE';
  else if(B.close<A.low)state='DOWNSIDE_ACCEPTANCE';
  return{state,reference_session:a.key,active_session:b.key,reference_high:A.high,reference_low:A.low,
    active_high:B.high,active_low:B.low,active_close:B.close};
}
async function chart(){
  const url='https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=5m&range=5d&includePrePost=true';
  const started=Date.now();
  try{
    const r=await fetch(url,{headers:{'User-Agent':UA,Accept:'application/json'},signal:AbortSignal.timeout(6500)});
    if(!r.ok)return{ok:false,status:r.status,latency_ms:Date.now()-started};
    const j=await r.json(),x=j?.chart?.result?.[0];
    if(!x)return{ok:false,status:r.status,latency_ms:Date.now()-started};
    return{ok:true,status:r.status,latency_ms:Date.now()-started,result:x};
  }catch(error){return{ok:false,status:0,latency_ms:Date.now()-started,error:String(error).slice(0,160)}}
}
Deno.serve(async(req:Request)=>{
  if(!(await authorized(req)))return Response.json({ok:false,error:'unauthorized_private_runtime'},{status:401,headers:{'Cache-Control':'no-store'}});
  if(req.method!=='GET')return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers:{Allow:'GET'}});
  const c=await chart();
  if(!c.ok)return Response.json({ok:false,version:'v188-session-liquidity-v1-private-runtime',state:'DATA_UNAVAILABLE',
    governance:{action_permitted:'WAIT',capital_permission:'0R',automatic_execution:false}},{status:503,headers:{'Cache-Control':'no-store'}});
  const ts=c.result.timestamp||[],q=c.result.indicators?.quote?.[0]||{},bars:any[]=[];
  for(let i=0;i<ts.length;i++){
    const open=finite(q.open?.[i]),high=finite(q.high?.[i]),low=finite(q.low?.[i]),close=finite(q.close?.[i]);
    if([open,high,low,close].some(v=>v===null))continue;
    bars.push({ts:ts[i],open,high,low,close,volume:finite(q.volume?.[i])||0});
  }
  const venues=[
    {key:'ASIA',label:'Tokyo',tz:'Asia/Tokyo',start:8*60,end:10*60,window:'08:00–10:00'},
    {key:'LONDON',label:'London',tz:'Europe/London',start:8*60,end:10*60+30,window:'08:00–10:30'},
    {key:'NEW_YORK',label:'COMEX New York',tz:'America/New_York',start:8*60+20,end:10*60+30,window:'08:20–10:30'}
  ];
  const now=new Date(),sessions=venues.map(v=>venueWindows(bars,v,now));
  const asia=sessions.find(x=>x.key==='ASIA'),london=sessions.find(x=>x.key==='LONDON'),ny=sessions.find(x=>x.key==='NEW_YORK');
  const latestBars=bars.slice(-1)[0]||null;
  return Response.json({
    ok:true,version:'v188-session-liquidity-v1-private-runtime',generated_at:new Date().toISOString(),
    truth_label:'FRAMEWORK_DERIVED_FROM_DELAYED_GC_5M',symbol:'GC=F',
    source:{provider:'Yahoo Finance',interval:'5m',range:'5d',latency_ms:c.latency_ms,bar_count:bars.length,last_bar_ts:latestBars?.ts??null},
    sessions,
    cross_session:{
      london_vs_asia:crossSession(asia,london),
      new_york_vs_london:crossSession(london,ny)
    },
    methodology:{
      opening_range:'First 30 minutes of each configured signal window',
      sweep:'Latest window high/low and close versus the prior same-venue window',
      cross_session:'Latest active-session range/close versus latest preceding-session range',
      note:'Session windows are structural references from delayed GC futures bars; they are not broker execution prices.'
    },
    governance:{canonical:false,action_permitted:'WAIT',capital_permission:'0R',automatic_execution:false,live_order_submission_enabled:false}
  },{headers:{'Cache-Control':'no-store'}});
});