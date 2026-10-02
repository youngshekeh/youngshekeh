import { buildGoldCommandSnapshot } from '../src/gold-command-v194.mjs';

const BASE='https://thefatheranalytics.com';
const FEEDS={
  live:'/api/gold-live-price',
  signal:'/api/gold-signal-map',
  lifecycle:'/api/gold-signal-lifecycle',
  watch:'/api/gold-trigger-watch-v189',
  ledger:'/api/gold-event-ledger-v191',
  router:'/api/gold-alert-router-v192'
};

async function fetchJson(path){
  try{
    const r=await fetch(BASE+path,{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-V194/1.0'},
      cache:'no-store',redirect:'error',signal:AbortSignal.timeout(9500)
    });
    const body=await r.json().catch(()=>null);
    if(!body||typeof body!=='object'||Array.isArray(body)) return {ok:false,state:'UNAVAILABLE',upstream_status:r.status};
    return body;
  }catch{
    return {ok:false,state:'UNAVAILABLE',error:'upstream_transport_unavailable'};
  }
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Gold-Command','V194');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }
  const keys=Object.keys(FEEDS);
  const values=await Promise.all(keys.map(k=>fetchJson(FEEDS[k])));
  const input=Object.fromEntries(keys.map((k,i)=>[k,values[i]]));
  const body=buildGoldCommandSnapshot({now:new Date(),...input});
  return res.status(body.ok?200:503).json(body);
}
