// V332 · Command OS browser load spreading during SQL outages.
// Only schedules existing tasks. Does not inspect credentials, make network
// requests, modify pg_cron or authorize a payment/trade.
export const V332_RECUR_MS=300000;
export const V332_MACHINE_MS=60000;
export const V332_PHASE_START_MS=10000;
export const V332_PHASE_GAP_MS=17000;
export const V332_STARTUP_CONCURRENCY=2;
export const V332_SOURCE_CONCURRENCY=2;

export async function v332BoundedSettled(tasks,concurrency=2){
 if(!Array.isArray(tasks)||!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>4)
  throw new TypeError('INVALID_BOUNDED_TASKS');
 const result=new Array(tasks.length);
 let index=0;
 async function worker(){
  while(index<tasks.length){
   const at=index++;
   try{result[at]={status:'fulfilled',value:await tasks[at]()};}
   catch{result[at]={status:'rejected'};}
  }
 }
 await Promise.all(Array.from({length:Math.min(concurrency,tasks.length)},worker));
 return result;
}

export async function v332BoundedMap(items,fn,concurrency=2){
 if(!Array.isArray(items)||typeof fn!=='function'||!Number.isSafeInteger(concurrency)||
    concurrency<1||concurrency>4)throw new TypeError('INVALID_MAP');
 const result=new Array(items.length);
 let index=0,firstError=null;
 async function worker(){
  while(index<items.length){
   const at=index++;
   try{result[at]=await fn(items[at],at);}
   catch(err){firstError??=err;}
  }
 }
 await Promise.all(Array.from({length:Math.min(concurrency,items.length)},worker));
 if(firstError!==null)throw firstError;
 return result;
}

export function v332CreateScheduler({
 tasks,machineTask,visible=()=>true,
 timeout=(fn,delay)=>setTimeout(fn,delay),
 interval=(fn,delay)=>setInterval(fn,delay),
 clearTimeoutFn=id=>clearTimeout(id),clearIntervalFn=id=>clearInterval(id)
}={}){
 if(!Array.isArray(tasks)||tasks.length!==12||tasks.some(t=>typeof t!=='function')||
 typeof machineTask!=='function'||typeof visible!=='function')
 throw new TypeError('V332_SCHEDULER_CONFIG_INVALID');
 let disposed=false,active=0;
 const running=new Set(),timeouts=[],intervals=[];
 const run=async(key,fn)=>{
  if(disposed||!visible()||running.has(key)||active>=V332_STARTUP_CONCURRENCY)return false;
  active++;running.add(key);
  try{await fn();return true;}
  catch{return false;}
  finally{active--;running.delete(key);}
 };
 const schedule=(key,fn,offset,period)=>{
  const callback=()=>{void run(key,fn);};
  timeouts.push(timeout(()=>{
    if(disposed)return;
    callback();
    intervals.push(interval(callback,period));
  },offset));
 };
 schedule('machine',machineTask,V332_MACHINE_MS,V332_MACHINE_MS);
 tasks.forEach((fn,i)=>schedule('sync-'+i,fn,V332_PHASE_START_MS+i*V332_PHASE_GAP_MS,V332_RECUR_MS));
 return Object.freeze({
  state:()=>Object.freeze({active,disposed,
   staggered:true,max_parallel:V332_STARTUP_CONCURRENCY,
   all_business_automations_preserved:true,
   private_db_health_certified:false,
   payments_enabled:false,live_trading_enabled:false,capital_permission:'0R'}),
  dispose(){
   if(disposed)return;
   disposed=true;
   timeouts.forEach(clearTimeoutFn);intervals.forEach(clearIntervalFn);
  }
 });
}
