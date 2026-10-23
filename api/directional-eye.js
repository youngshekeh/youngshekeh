import {ASSETS,evaluateEye,unavailable,timingWindows} from '../src/directional-eye-core.mjs';
const endpoint='https://api.exchange.coinbase.com/products/BTC-USD/candles';
export async function readEye(now=Date.now()){
 const read=async granularity=>{
  const r=await fetch(`${endpoint}?granularity=${granularity}`,{headers:{Accept:'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw Error('candles_unavailable');
  const rows=await r.json();if(!Array.isArray(rows)||rows.length>500)throw Error('bad_candles');
  return rows.map(r=>({t:r[0]*1000,l:r[1],h:r[2],o:r[3],c:r[4],v:r[5]})).sort((a,b)=>a.t-b.t).slice(-300);
 };
 let bitcoin=unavailable('Bitcoin');
 try{const [oneMinute,fiveMinute]=await Promise.all([read(60),read(300)]);bitcoin=evaluateEye({asset:'Bitcoin',oneMinute,fiveMinute,source:'Coinbase Exchange BTC-USD',now});}catch{}
 return {version:'directional-eye-v1',generated_at:new Date(now).toISOString(),research_only:true,
  assets:ASSETS.map(a=>a==='Bitcoin'?bitcoin:unavailable(a)),windows:timingWindows(now),
  ledger_status:'NO_CANONICAL_WRITE',calibration:'UNVALIDATED',capital_permission:'0R',live_orders:false};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
 return res.status(200).json(await readEye());
}
