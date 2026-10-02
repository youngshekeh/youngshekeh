import { buildGoldTriggerWatch } from '../src/gold-trigger-watch-v189.mjs';
const LIFECYCLE='https://thefatheranalytics.com/api/gold-signal-lifecycle';
let cached=null,cachedAt=0,inflight=null;const TTL=15_000;
async function build(){
 const r=await fetch(LIFECYCLE,{headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-V189/1.0'},
  cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
 const lifecycle=await r.json().catch(()=>null);
 if(!r.ok||lifecycle?.ok!==true)return{ok:false,version:'v189-gold-trigger-watch-v1',state:'LIFECYCLE_UNAVAILABLE',
  generated_at:new Date().toISOString(),governance:{action_permitted:'WAIT',capital_permission:'0R',automatic_execution:false,live_order_submission_enabled:false}};
 return buildGoldTriggerWatch({now:new Date(),lifecycle});
}
async function current(){
 if(cached&&Date.now()-cachedAt<TTL)return cached;if(inflight)return inflight;
 inflight=build().then(x=>{if(x?.ok){cached=x;cachedAt=Date.now();}return x;}).finally(()=>{inflight=null;});return inflight;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-TFA-Trigger-Watch','V189');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'});}
 try{const body=await current();return res.status(body?.ok?200:503).json(body);}
 catch{return res.status(503).json({ok:false,state:'UNAVAILABLE',error:'trigger_watch_unavailable',
  governance:{action_permitted:'WAIT',capital_permission:'0R',automatic_execution:false,live_order_submission_enabled:false}});}
}
