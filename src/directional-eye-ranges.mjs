// Observed UTC calendar ranges, not order-book liquidity or predictive intervals.
const DAY=86400000;
export function measuredRanges(rows,now=Date.now()){
 const result={status:'UNAVAILABLE',reason:'DAILY_CANDLES_UNAVAILABLE',periods:{},source:'Coinbase Exchange BTC-USD',calendar:'UTC',received_at:new Date(now).toISOString(),expires_at:new Date(now+60000).toISOString(),source_update_time:null};
 if(!Array.isArray(rows)||!rows.length||rows.length>500)return result;
 const today=Math.floor(now/DAY)*DAY;
 for(let i=0;i<rows.length;i++){
  const r=rows[i];
  if(!r||![r.t,r.o,r.h,r.l,r.c,r.v].every(Number.isFinite)||r.t%DAY!==0||r.t>today||r.l<=0||r.v<0||r.h<Math.max(r.o,r.c)||r.l>Math.min(r.o,r.c)||r.h<r.l||i&&r.t-rows[i-1].t!==DAY)return {...result,reason:'INVALID_DAILY_SERIES'};
 }
 if(rows.at(-1).t!==today)return {...result,reason:'CURRENT_DAY_BUCKET_MISSING'};
 const d=new Date(today),weekday=(d.getUTCDay()+6)%7;
 const starts={Daily:today,Weekly:today-weekday*DAY,Monthly:Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1),Quarterly:Date.UTC(d.getUTCFullYear(),Math.floor(d.getUTCMonth()/3)*3,1)};
 for(const [period,start] of Object.entries(starts)){
  const a=rows.filter(r=>r.t>=start);
  if(!a.length||a[0].t!==start){result.periods[period]={status:'UNAVAILABLE',reason:'PERIOD_START_MISSING'};continue;}
  const low=Math.min(...a.map(r=>r.l)),high=Math.max(...a.map(r=>r.h)),width=high-low;
  result.periods[period]={status:'OBSERVED_IN_PROGRESS',low,high,open:a[0].o,discount:[low,low+.4*width],battlefield:[low+.4*width,low+.6*width],premium:[low+.6*width,high],period_start:new Date(start).toISOString(),latest_bucket:new Date(today).toISOString(),daily_buckets:a.length,complete:false};
 }
 return {...result,status:'OBSERVED_RANGES',reason:null,method:'Provider daily OHLC, including current incomplete day. 40/20/40 range partition; not institutional valuation. HTTP receipt time is not source update time.'};
}
