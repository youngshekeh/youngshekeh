import { getVercelOidcToken } from '@vercel/oidc';
import { buildGoldSignalMap } from '../src/gold-signal-map.mjs';

const PRIVATE_BASE='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1';
const LIVE='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/broker-live-market-intake';
let cached=null,cachedAt=0,inflight=null;
const TTL=15_000;

async function readJson(url,headers,timeout){
  try{
    const r=await fetch(url,{headers,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(timeout)});
    const body=await r.json().catch(()=>null);
    return{ok:r.ok&&body&&typeof body==='object'&&!Array.isArray(body),status:r.status,body};
  }catch{return{ok:false,status:0,body:null};}
}
async function build(token){
  const privateHeaders={Authorization:`Bearer ${token}`,Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-V187/1.0'};
  const [day,zones,confluence,breakout,live]=await Promise.all([
    readJson(`${PRIVATE_BASE}/runtime-v75-day-state`,privateHeaders,9000),
    readJson(`${PRIVATE_BASE}/runtime-v81-mtf-zones`,privateHeaders,9000),
    readJson(`${PRIVATE_BASE}/runtime-v82-mtf-confluence`,privateHeaders,9000),
    readJson(`${PRIVATE_BASE}/runtime-v83-breakout`,privateHeaders,9000),
    readJson(LIVE,{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-V187-LIVE/1.0'},4000)
  ]);
  if(!day.ok||!zones.ok){
    return{ok:false,state:'STRUCTURE_UNAVAILABLE',version:'v187-xauusd-signal-map-v1',
      generated_at:new Date().toISOString(),governance:{action_permitted:'WAIT',capital_permission:'0R',automatic_execution:false,live_order_submission_enabled:false}};
  }
  const result=buildGoldSignalMap({
    now:new Date(),live:live.ok?live.body:{},day:day.body,zones:zones.body,
    confluence:confluence.ok?confluence.body:{},breakout:breakout.ok?breakout.body:{}
  });
  result.upstream_health={
    live_xauusd:{ok:live.ok,status:live.status},
    day_state:{ok:day.ok,status:day.status},
    mtf_zones:{ok:zones.ok,status:zones.status},
    confluence:{ok:confluence.ok,status:confluence.status},
    breakout:{ok:breakout.ok,status:breakout.status}
  };
  return result;
}
async function current(token){
  if(cached&&Date.now()-cachedAt<TTL)return cached;
  if(inflight)return inflight;
  inflight=build(token).then(x=>{if(x?.ok){cached=x;cachedAt=Date.now();}return x;}).finally(()=>{inflight=null;});
  return inflight;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Signal-Map','V187');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'});}
  let token='';try{token=await getVercelOidcToken();}catch{}
  if(!token)return res.status(503).json({ok:false,state:'IDENTITY_UNAVAILABLE',governance:{action_permitted:'WAIT',capital_permission:'0R'}});
  try{
    const body=await current(token);
    return res.status(body?.ok?200:503).json(body);
  }catch{
    return res.status(503).json({ok:false,state:'UNAVAILABLE',error:'signal_map_unavailable',
      governance:{action_permitted:'WAIT',capital_permission:'0R',automatic_execution:false,live_order_submission_enabled:false}});
  }
}
