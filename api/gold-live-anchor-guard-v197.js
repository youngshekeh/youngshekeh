import {buildGoldLiveAnchorGuard} from '../src/gold-live-anchor-guard-v197.mjs';
const BASE='https://thefatheranalytics.com';
const FEEDS={
  command:'/api/gold-command-v194',
  readiness:'/api/gold-bridge-readiness-v195',
  quality:'/api/gold-feed-quality-v196'
};
async function read(path){
  try{
    const r=await fetch(BASE+path,{headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-V197/1.0'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
    const body=await r.json().catch(()=>null);
    return body&&typeof body==='object'&&!Array.isArray(body)?body:{ok:false,state:'UNAVAILABLE'};
  }catch{return{ok:false,state:'UNAVAILABLE',error:'upstream_transport_unavailable'};}
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Gold-Live-Anchor-Guard','V197');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'});}
  const keys=Object.keys(FEEDS),values=await Promise.all(keys.map(k=>read(FEEDS[k])));
  const input=Object.fromEntries(keys.map((k,i)=>[k,values[i]]));
  const body=buildGoldLiveAnchorGuard({now:new Date(),...input});
  return res.status(body.ok?200:503).json(body);
}
