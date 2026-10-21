// Bounded, sequential read-only market sources. Avoid 21-second unhealthy path.
export const BROKER_BUDGET_MS=2800;
export const REFERENCE_BUDGET_MS=2800;
export async function readGoldWithinBudget({read,curate,now=Date.now}={}){
 if(typeof read!=='function'||typeof curate!=='function')throw new TypeError('read/curate required');
 const missing=()=>({httpOk:false,data:null});
 const attempt=async(slug,budget)=>{
  try{const value=await read(slug,budget);return value?.httpOk===true?value:missing()}
  catch{return missing()}
 };
 const broker=await attempt('public-gold-live-xauusd',BROKER_BUDGET_MS);
 const first=curate({broker},now());
 if(first?.ok===true)return first;
 const reference=await attempt('public-gold-live-api',REFERENCE_BUDGET_MS);
 return curate({broker,reference},now());
}
