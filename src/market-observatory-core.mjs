import {verifiedPublicReferences} from './v235-reference-integrity.mjs';

// V248: source-verified PUBLIC research only. No broker/tick/order semantics.
export const PUBLIC_POLL_MS=15000;
export const PUBLIC_OBSERVATION_LIMIT=120;
export function currentResearchObservations(packet,now=Date.now()){
 const refs=verifiedPublicReferences(packet,now);
 return Object.freeze({
  gold:refs.gold,bitcoin:refs.bitcoin,count:refs.count,
  state:refs.count===2?'TWO CURRENT REFERENCES':refs.count===1?'PARTIAL PUBLIC REFERENCES':'NO CURRENT REFERENCES',
  order_submission:false,capital_permission:'0R',
  provider_source_time_gold:refs.gold?.at||null,
  provider_source_time_bitcoin:null
 });
}
const saneNumber=p=>typeof p==='number'&&Number.isFinite(p)&&p>0;
export function retainTabObservation(history,observation,{limit=PUBLIC_OBSERVATION_LIMIT}={}){
 if(!Array.isArray(history)||!Number.isSafeInteger(limit)||limit<2||limit>1000)throw Error('invalid_history');
 if(!observation||!saneNumber(observation.value)||!Number.isFinite(Date.parse(String(observation.at||''))))
  return history.slice();
 const last=history.at(-1);
 const observed=Date.parse(observation.at),lastAt=Date.parse(String(last?.at||''));
 // No duplicate/reordered timestamps. Never synthesize missing price points.
 if(last&&observed<=lastAt)return history.slice();
 return [...history,{value:observation.value,at:observation.at,source:observation.source}].slice(-limit);
}
export function tabSamplePath(history,{width=600,height=144,padding=12}={}){
 if(!Array.isArray(history)||history.length<2)return '';
 const values=history.map(x=>x.value);
 if(values.some(x=>!saneNumber(x)))return '';
 const low=Math.min(...values),high=Math.max(...values),range=high-low;
 const minTime=Date.parse(history[0].at),maxTime=Date.parse(history.at(-1).at);
 if(!Number.isFinite(minTime)||!Number.isFinite(maxTime)||maxTime<=minTime)return '';
 const dx=width-2*padding,dy=height-2*padding;
 return history.map((p,i)=>{
  const stamp=Date.parse(p.at);
  if(!Number.isFinite(stamp)||stamp<minTime||stamp>maxTime)return '';
  const x=padding+((stamp-minTime)/(maxTime-minTime))*dx;
  const y=range===0?height/2:padding+(1-(p.value-low)/range)*dy;
  return (i===0?'M':'L')+x.toFixed(2)+' '+y.toFixed(2);
 }).join(' ');
}
