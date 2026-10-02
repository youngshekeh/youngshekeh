import {buildGoldSessionExecutionIntelligence} from '../src/gold-live-session-intelligence-v198.mjs';
const BASE='https://thefatheranalytics.com';
const FEEDS={
  guard:'/api/gold-live-anchor-guard-v197',
  signal:'/api/gold-signal-map',
  lifecycle:'/api/gold-signal-lifecycle',
  watch:'/api/gold-trigger-watch-v189',
  command:'/api/gold-command-v194'
};
async function read(path){
  try{
    const r=await fetch(BASE+path,{headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-V198/1.0'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(11000)});
    const body=await r.json().catch(()=>null);
    return body&&typeof body==='object'&&!Array.isArray(body)?body:{ok:false,state:'UNAVAILABLE'};
  }catch{return{ok:false,state:'UNAVAILABLE',error:'upstream_transport_unavailable'};}
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Gold-Session-Intelligence','V198');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'});}
  const keys=Object.keys(FEEDS),vals=await Promise.all(keys.map(k=>read(FEEDS[k])));
  const input=Object.fromEntries(keys.map((k,i)=>[k,vals[i]]));
  const body=buildGoldSessionExecutionIntelligence({now:new Date(),...input});
  return res.status(body.ok?200:503).json(body);
}
