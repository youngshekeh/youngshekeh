// Research model v1. All thresholds are unvalidated hypotheses, never win probabilities.
export const ASSETS=['Gold','Bitcoin','Brent','EURUSD','DXY','S&P 500','Nasdaq','US 10Y'];
const finite=x=>typeof x==='number'&&Number.isFinite(x);
export function inspectCandles(rows,step,now){
 const base={status:'UNAVAILABLE',reason:'INSUFFICIENT_CANDLES',closed_rows:0,last_closed_at:null,age_seconds:null};
 if(!Number.isFinite(now)||![60000,300000].includes(step))return {...base,reason:'INVALID_CLOCK_OR_STEP'};
 if(!Array.isArray(rows)||rows.length<60)return base;
 for(const c of rows){
  if(!c||![c.t,c.o,c.h,c.l,c.c,c.v].every(finite)||c.t%step!==0||c.l<=0||c.v<0||c.h<Math.max(c.o,c.c)||c.l>Math.min(c.o,c.c)||c.h<c.l)return {...base,reason:'INVALID_CANDLE'};
  if(c.t>Math.floor(now/step)*step)return {...base,reason:'FUTURE_CANDLE'};
 }
 const closed=rows.filter(c=>c.t+step<=now);
 const last=closed.at(-1),age=last?now-(last.t+step):null;
 const detail={...base,closed_rows:closed.length,last_closed_at:last?new Date(last.t+step).toISOString():null,age_seconds:age==null?null:Math.floor(age/1000)};
 if(closed.length<60)return detail;
 for(let i=1;i<closed.length;i++)if(closed[i].t-closed[i-1].t!==step)return {...detail,reason:'GAPPED_OR_DUPLICATE_CANDLES'};
 if(age>step*2)return {...detail,reason:'STALE_CANDLES'};
 return {...detail,status:'VALIDATED',reason:null};
}
export function validateCandles(rows,step,now){
 return inspectCandles(rows,step,now).status==='VALIDATED'?rows.filter(c=>c.t+step<=now):null;
}
export function unavailable(asset,reason='Consistent 1m and 5m candles unavailable'){
 return {asset,state:'UNAVAILABLE',direction:'UNCONFIRMED',reason,readiness:null,probability:null,capital_permission:'0R',action:'WAIT',levels:null};
}
const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
export function evaluateEye({asset,oneMinute,fiveMinute,source,now=Date.now()}={}){
 if(!ASSETS.includes(asset)||typeof source!=='string'||!source.trim())return unavailable(asset,'Asset or source attribution missing');
 const one=validateCandles(oneMinute,60000,now),five=validateCandles(fiveMinute,300000,now);
 if(!one||!five)return unavailable(asset);
 const last=five.at(-1),prev=five.at(-2),base=five.slice(-22,-2);
 const high=Math.max(...base.map(c=>c.h)),low=Math.min(...base.map(c=>c.l));
 const ranges=five.slice(-42,-2).map((c,i)=>Math.max(c.h-c.l,Math.abs(c.h-five.at(-43+i).c),Math.abs(c.l-five.at(-43+i).c)));
 const atr=avg(ranges.slice(-14));
 if(!(atr>0))return unavailable(asset,'Zero volatility baseline');
 const compressed=avg(ranges.slice(-6))<avg(ranges.slice(0,20))*0.75;
 const displaced=Math.abs(prev.c-prev.o)>=atr*.7;
 const up=displaced&&prev.c>high&&last.l<=high+atr*.15&&last.c>high;
 const down=displaced&&prev.c<low&&last.h>=low-atr*.15&&last.c<low;
 const sweepUp=last.l<low&&last.c>low,sweepDown=last.h>high&&last.c<high;
 const minuteClose=one.at(-1).c;
 if(Math.abs(minuteClose-last.c)>atr*3)return unavailable(asset,'1m / 5m price series inconsistent');
 const direction=sweepUp&&sweepDown?'UNCONFIRMED':up||sweepUp?'UP':down||sweepDown?'DOWN':'UNCONFIRMED';
 const aligned=direction==='UP'?minuteClose>high:direction==='DOWN'?minuteClose<low:false;
 const pressure=last.v>avg(base.map(c=>c.v))*1.5;
 const near=Math.min(Math.abs(last.c-high),Math.abs(last.c-low))<=atr;
 const confirmed=(up||down)&&aligned;
 const state=confirmed?'TRIGGER':(sweepUp||sweepDown)&&pressure?'ARMED':compressed||near?'WATCH':'OBSERVE';
 const readiness=[compressed,near,sweepUp||sweepDown,pressure,confirmed].filter(Boolean).length*20;
 const sign=direction==='UP'?1:-1,trigger=direction==='UP'?high:low;
 const levels=direction==='UNCONFIRMED'?{upper:high,lower:low,atr}: {
  upper:high,lower:low,atr,trigger,zone:[trigger-atr*.15,trigger+atr*.15],
  invalidation:trigger-sign*atr,targets:[trigger+sign*atr,trigger+sign*2*atr],
  projected_distance:2*atr};
 return {asset,state,direction,readiness,probability:null,source,
  observed_at:new Date(last.t+300000).toISOString(),expires_at:new Date(Math.min(last.t+900000,one.at(-1).t+180000)).toISOString(),
  forecast_id:`EYE1-${asset.replaceAll(' ','')}-${last.t}-${state}-${direction}`,
  evidence:{compressed,near,sweep:sweepUp||sweepDown,volume_anomaly:pressure,confirmed},levels,
  horizon_minutes:60,capital_permission:'0R',action:'WAIT',
  reason:'Rule-based research only. Volume anomaly does not identify institutional activity.'};
}
export function timingWindows(now=Date.now()){
 const local=zone=>new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',hourCycle:'h23',minute:'2-digit',weekday:'short'}).format(new Date(now));
 // Express windows in venue local time; conversion uses actual date/DST via Intl.
 const at=(zone,h,m)=>{const d=new Date(now);for(let n=0;n<1440;n++){const t=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),0,n);const p=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(t);if(p===`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`)return new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Lagos',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(t);}return 'Unavailable';};
 return {london:`${at('Europe/London',8,0)}–${at('Europe/London',10,0)} WAT (08:00–10:00 London)`,
  newYork:`${at('America/New_York',9,30)}–${at('America/New_York',11,30)} WAT (09:30–11:30 New York)`,
  venue_clock:local('America/New_York'),note:'Candidate weekday windows only; holidays, releases and large-move timing are not predicted.'};
}
