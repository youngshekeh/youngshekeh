// One page-wide read-only admission lane for the database-backed research APIs.
// The independent public price observer deliberately does not use this lane.
export function createResearchTransport({fetchImpl=globalThis.fetch, origin='https://thefatheranalytics.com',
 now=Date.now, isVisible=()=>true, onState=()=>{}, limit=3, queueLimit=64,
 failureThreshold=3, cooldownMs=30000, maxCooldownMs=120000, deadlineMs=20000}={}) {
 const active=new Set(), waiting=[], pending=new Map(), routeRetry=new Map();
 let mode='CLOSED',retryAt=0,failures=0,recoveryFailures=0,epoch=0,paused=false,scheduled=false;
 const counters={network_started:0,coalesced:0,deferred:0,peak_active:0,last_success_at:null};
 const snapshot=()=>Object.freeze({state:paused||!isVisible()?'PAUSED':mode,
  active:active.size,queued:waiting.length,retry_at:retryAt||null,
  retry_in_seconds:Math.max(0,Math.ceil((retryAt-now())/1000)),...counters});
 const emit=()=>{try{onState(snapshot());}catch{}};
 const unavailable=(reason,delay=0)=>new Response(JSON.stringify({ok:false,state:'UNAVAILABLE',
  error:'research_temporarily_unavailable',reason,retry_after_seconds:Math.max(0,Math.ceil(delay/1000)),
  governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false}}),
  {status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 function keyOf(input,options){
  if(typeof input!=='string'||(options?.method||'GET').toUpperCase()!=='GET')return null;
  try{
   const url=new URL(input,origin);
   if(url.origin!==origin||!url.pathname.startsWith('/api/')||url.username||url.password
    ||url.pathname==='/api/public-market-reference')return null;
   return url.pathname+url.search;
  }catch{return null;}
 }
 const priority=key=>key==='/api/gold-live-price'?0:
  /feed=public-(gold-live-xauusd|gold-execution-desk|live-markets-api)(?:&|$)/.test(key)?1:
  /\/(gold-day-state|gold-mtf-zones|gold-liquidity-state-machine)(?:\?|$)/.test(key)?2:3;
 const finish=(task,response)=>{
  if(task.done)return;
  task.done=true;
  if(pending.get(task.key)===task)pending.delete(task.key);
  const index=waiting.indexOf(task);if(index>=0)waiting.splice(index,1);
  task.resolve(response);emit();
 };
 const defer=(reason,delay=0)=>{counters.deferred++;return unavailable(reason,delay);};
 function open(){
  mode='OPEN';failures=0;epoch++;
  const delay=Math.min(maxCooldownMs,cooldownMs*2**Math.min(recoveryFailures,8));
  retryAt=now()+delay;recoveryFailures++;
  for(const task of [...waiting])finish(task,defer('RECOVERY_BACKOFF',delay));
  // Cancels client reads; already-started upstream database work may continue.
  for(const task of active)task.controller.abort();
  emit();
 }
 function subscribe(task,signal){
  task.subscribers++;
  return new Promise(resolve=>{
   let settled=false;
   const complete=response=>{
    if(settled)return;settled=true;task.subscribers--;
    signal?.removeEventListener('abort',aborted);
    try{resolve(response.clone());}catch{resolve(unavailable('BODY_UNAVAILABLE'));}
   };
   const aborted=()=>{
    if(signal?.reason?.name==='TimeoutError')task.timedOut=true;
    complete(unavailable('REQUEST_ABORTED'));
    if(task.subscribers===0&&!task.done){
     task.controller.abort();
     if(!active.has(task))finish(task,unavailable('REQUEST_ABORTED'));
    }
   };
   signal?.addEventListener('abort',aborted,{once:true});
   task.promise.then(complete);
   if(signal?.aborted)aborted();
  });
 }
 async function run(task){
  active.add(task);task.epoch=epoch;
  counters.network_started++;counters.peak_active=Math.max(counters.peak_active,active.size);emit();
  let response,probeOk=false,backendFailure=false;
  const deadline=AbortSignal.timeout(deadlineMs);
  const signal=AbortSignal.any([task.controller.signal,deadline]);
  let abortListener;
  const aborted=new Promise((_,reject)=>{
   abortListener=()=>reject(new Error('read_aborted'));
   signal.addEventListener('abort',abortListener,{once:true});
   if(signal.aborted)abortListener();
  });
  try{
   response=await Promise.race([fetchImpl(task.key,{...task.options,method:'GET',
    signal,cache:'no-store',redirect:'error'}),aborted]);
   const body=await Promise.race([response.clone().json(),aborted]);
   const valid=body!==null&&typeof body==='object'&&!Array.isArray(body);
   probeOk=response.ok&&valid&&body.ok===true;
   backendFailure=!valid||response.status===408||response.status===429||response.status>=500
    ||(response.ok&&body.ok!==true);
   if(!probeOk){
    routeRetry.set(task.key,now()+15000);
    // A JSON 401/403/404 remains an endpoint-specific failure, not proof that all APIs failed.
    if(!valid)response=unavailable('INVALID_RESPONSE');
   }else routeRetry.delete(task.key);
  }catch{
   backendFailure=!paused&&isVisible()&&(task.subscribers>0||task.timedOut)&&task.epoch===epoch;
   response=unavailable(task.subscribers===0?'REQUEST_ABORTED':'TRANSPORT_UNAVAILABLE');
   if(backendFailure)routeRetry.set(task.key,now()+15000);
  }finally{
   signal.removeEventListener('abort',abortListener);
   if(task.epoch===epoch){
    if(probeOk){mode='CLOSED';retryAt=0;failures=0;recoveryFailures=0;counters.last_success_at=now();}
    else if(mode==='HALF_OPEN'&&(paused||!isVisible()||(!task.subscribers&&!task.timedOut))){mode='OPEN';retryAt=now();}
    else if(mode==='HALF_OPEN'||(backendFailure&&++failures>=failureThreshold))open();
   }
   active.delete(task);
   finish(task,response??unavailable('TRANSPORT_UNAVAILABLE'));
   schedule();
  }
 }
 function pump(){
  scheduled=false;
  if(paused||!isVisible()){
   for(const task of [...waiting])finish(task,defer('PAGE_PAUSED'));
   return;
  }
  if(mode==='OPEN'&&now()<retryAt)return;
  waiting.sort((a,b)=>a.priority-b.priority);
  while(waiting.length&&active.size<limit){
   if(mode==='HALF_OPEN'&&active.size)break;
   const background=[...active].filter(t=>t.priority>1).length;
   const index=waiting.findIndex(t=>t.priority<=1||background<Math.max(1,limit-1));
   if(index<0)break;
   const task=waiting.splice(index,1)[0];
   if(task.controller.signal.aborted){finish(task,unavailable('REQUEST_ABORTED'));continue;}
   if(mode==='OPEN')mode='HALF_OPEN';
   void run(task);
   if(mode==='HALF_OPEN')break;
  }
  emit();
 }
 function schedule(){if(!scheduled){scheduled=true;queueMicrotask(pump);}}
 function request(input,options={}){
  const key=keyOf(input,options);
  if(!key)return Promise.resolve(unavailable('READ_ROUTE_REQUIRED'));
  if(options.signal?.aborted)return Promise.resolve(unavailable('REQUEST_ABORTED'));
  if(paused||!isVisible())return Promise.resolve(defer('PAGE_PAUSED'));
  if(mode==='OPEN'&&now()<retryAt)return Promise.resolve(defer('RECOVERY_BACKOFF',retryAt-now()));
  if(pending.has(key)){counters.coalesced++;return subscribe(pending.get(key),options.signal);}
  if(mode==='HALF_OPEN'||(mode==='OPEN'&&waiting.length))return Promise.resolve(defer('RECOVERY_PROBE_PENDING',1000));
  if((routeRetry.get(key)||0)>now())return Promise.resolve(defer('SOURCE_BACKOFF',routeRetry.get(key)-now()));
  if(waiting.length>=queueLimit)return Promise.resolve(defer('QUEUE_FULL',1000));
  let resolve;
  const task={key,priority:priority(key),options:{...options,signal:undefined},controller:new AbortController(),
   promise:new Promise(r=>{resolve=r;}),resolve:null,subscribers:0,done:false,epoch};
  task.resolve=resolve;pending.set(key,task);waiting.push(task);
  const result=subscribe(task,options.signal);schedule();emit();return result;
 }
 return Object.freeze({request,snapshot,
  pause(){paused=true;for(const task of [...waiting])finish(task,defer('PAGE_PAUSED'));
   for(const task of active)task.controller.abort();emit();},
  resume(){paused=false;schedule();emit();}
 });
}
