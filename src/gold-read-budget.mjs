import {composeGoldRead} from './public-gold-independent.mjs';
// Bounded primary reads with a secondary database recovery lane.
export const BROKER_BUDGET_MS=2800;
export const REFERENCE_BUDGET_MS=2800;
export async function readGoldWithinBudget({read,curate,independent,now=Date.now}={}){
 if(typeof read!=='function'||typeof curate!=='function')throw new TypeError('read/curate required');
 const missing=()=>({httpOk:false,data:null});
 const attempt=async(slug,budget)=>{
  try{const value=await read(slug,budget);return value?.httpOk===true?value:missing()}
  catch{return missing()}
 };
 // Keep broker priority, but do not wait for a second database read when the
 // independent public source already supplies a valid attributed reference.
 const [broker,external]=await Promise.all([
  attempt('public-gold-live-xauusd',BROKER_BUDGET_MS),
  typeof independent==='function'?Promise.resolve().then(independent).catch(()=>null):null
 ]);
 const select=value=>typeof independent==='function'?composeGoldRead(value,external,now()):value;
 const first=select(curate({broker},now()));
 if(first?.ok===true)return first;
 const reference=await attempt('public-gold-live-api',REFERENCE_BUDGET_MS);
 return select(curate({broker,reference},now()));
}
