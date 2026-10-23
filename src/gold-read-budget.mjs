import {composeGoldRead} from './public-gold-independent.mjs';
import {goldDisplay} from './public-gold-display.mjs';
// Primary sources race; a healthy indicative quote need not wait for a stalled broker.
// A fresh authenticated broker quote always wins if it arrives inside the grace window.
export const BROKER_BUDGET_MS=2800;
export const REFERENCE_BUDGET_MS=2800;
export const BROKER_GRACE_MS=900;
export async function readGoldWithinBudget({read,curate,independent,now=Date.now,brokerGraceMs=BROKER_GRACE_MS}={}){
 if(typeof read!=='function'||typeof curate!=='function')throw new TypeError('read/curate required');
 if(!Number.isSafeInteger(brokerGraceMs)||brokerGraceMs<1||brokerGraceMs>2000)throw new RangeError('invalid broker grace');
 const missing=()=>({httpOk:false,data:null});
 const attempt=async(slug,budget)=>{
  try{const value=await read(slug,budget);return value?.httpOk===true?value:missing()}
  catch{return missing()}
 };
 const brokerTask=attempt('public-gold-live-xauusd',BROKER_BUDGET_MS);
 const independentTask=typeof independent==='function'?Promise.resolve().then(independent).catch(()=>null):Promise.resolve(null);
 const first=await Promise.race([
  brokerTask.then(broker=>({kind:'broker',broker})),
  independentTask.then(external=>({kind:'external',external}))
 ]);
 let broker,external;
 if(first.kind==='broker'){
  broker=first.broker;
  const brokerOnly=curate({broker},now());
  if(goldDisplay(brokerOnly,now()).mode==='BROKER_LIVE_READ_ONLY')return brokerOnly;
  external=await independentTask;
 }else{
  external=first.external;
  const indicative=typeof independent==='function'?composeGoldRead(curate({},now()),external,now()):null;
  if(indicative?.ok===true){
   let timer;
   try{
    broker=await Promise.race([brokerTask,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),brokerGraceMs)})]);
   }finally{clearTimeout(timer);}
   if(broker===null)return indicative;
  }else broker=await brokerTask;
 }
 const select=value=>typeof independent==='function'?composeGoldRead(value,external,now()):value;
 const primary=select(curate({broker},now()));
 if(primary?.ok===true)return primary;
 const reference=await attempt('public-gold-live-api',REFERENCE_BUDGET_MS);
 return select(curate({broker,reference},now()));
}
