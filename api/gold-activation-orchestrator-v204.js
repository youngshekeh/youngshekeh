import {buildGoldActivationOrchestrator} from '../src/gold-activation-orchestrator-v204.mjs';
const BASE='https://thefatheranalytics.com';
const FEEDS={
  readiness:'/api/gold-bridge-readiness-v195',
  quality:'/api/gold-feed-quality-v196',
  anchor:'/api/gold-live-anchor-guard-v197',
  relay:'/api/gold-relay-observability-v199',
  ledger:'/api/gold-relay-event-ledger-v202'
};
async function read(path){
  try{
    const r=await fetch(BASE+path,{headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-V204/1.0'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
    const body=await r.json().catch(()=>null);
    return body&&typeof body==='object'&&!Array.isArray(body)?body:{ok:false,state:'UNAVAILABLE'};
  }catch{return{ok:false,state:'UNAVAILABLE',error:'upstream_transport_unavailable'};}
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Gold-Activation-Orchestrator','V204');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'});}
  const keys=Object.keys(FEEDS),values=await Promise.all(keys.map(k=>read(FEEDS[k])));
  const input=Object.fromEntries(keys.map((k,i)=>[k,values[i]]));
  const body=buildGoldActivationOrchestrator({now:new Date(),...input});
  return res.status(body.ok?200:503).json(body);
}
