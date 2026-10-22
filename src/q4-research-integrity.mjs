export function researchNumber(value){
 if(value===null||value===undefined||typeof value==='boolean'||typeof value==='object'
  ||(typeof value==='string'&&!value.trim()))return null;
 const number=Number(value);
 return Number.isFinite(number)?number:null;
}
export function positiveResearchNumber(value){
 const number=researchNumber(value);return number!==null&&number>0?number:null;
}
export function observationTime(source){
 const candidates=[source?.current?.market_time,source?.current?.observed_at,source?.current?.time,
  source?.market_time,source?.observed_at,source?.source?.market_time,
  source?.feed?.gold_futures?.market_time];
 for(const at of candidates){
  if(typeof at!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(at))continue;
  const time=Date.parse(at);if(Number.isFinite(time))return time;
 }
 return null;
}
export function researchSourceStatus(source,now=Date.now()){
 const time=source?.ok===true?observationTime(source):null;
 const age=time===null||time>now+5000?null:Math.max(0,(now-time)/1000);
 return Object.freeze({available:source?.ok===true,
  observation_at:time===null?null:new Date(time).toISOString(),
  age_seconds:age,current:age!==null&&age<=900,
  recent:age!==null&&age<=120});
}
