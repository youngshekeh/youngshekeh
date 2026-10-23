import {ASSETS,evaluateEye,unavailable,timingWindows,inspectCandles} from '../src/directional-eye-core.mjs';
import {measuredRanges} from '../src/directional-eye-ranges.mjs';
const endpoint='https://api.exchange.coinbase.com/products/BTC-USD/candles';
export async function readEye(now=Date.now()){
 const read=async granularity=>{
  const end=Math.floor(now/60000)*60000;
  const start=end-299*granularity*1000;
  const query=new URLSearchParams({granularity:String(granularity),start:new Date(start).toISOString(),end:new Date(end).toISOString()});
  const r=await fetch(`${endpoint}?${query}`,{headers:{Accept:'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw Error('provider_http_'+r.status);
  const rows=await r.json();if(!Array.isArray(rows)||rows.length<2||rows.length>500||rows.some(row=>!Array.isArray(row)||row.length<6||row.slice(0,6).some(v=>typeof v!=='number'||!Number.isFinite(v))||row[1]>row[2]||row[3]<row[1]||row[3]>row[2]||row[4]<row[1]||row[4]>row[2]||row[5]<0))throw Error('bad_candles');
  return rows.map(r=>({t:r[0]*1000,l:r[1],h:r[2],o:r[3],c:r[4],v:r[5]})).sort((a,b)=>a.t-b.t).slice(-300);
 };
 const dailyRequest=read(86400).then(rows=>measuredRanges(rows,now)).catch(()=>measuredRanges(null,now));
 let bitcoin=unavailable('Bitcoin');let bitcoinFeed={provider:'Coinbase Exchange',symbol:'BTC-USD',status:'UNAVAILABLE',reason:'NO_VERIFIED_CANDLES',observed_at:null};
 try{const [oneMinute,fiveMinute]=await Promise.all([read(60),read(300)]);const one=inspectCandles(oneMinute,60000,now),five=inspectCandles(fiveMinute,300000,now);
 bitcoin=evaluateEye({asset:'Bitcoin',oneMinute,fiveMinute,source:'Coinbase Exchange BTC-USD',now});
 const rejection=one.reason||five.reason||(bitcoin.state==='UNAVAILABLE'?'CROSS_TIMEFRAME_OR_VOLATILITY_REJECTED':null);
 bitcoinFeed={...bitcoinFeed,status:bitcoin.state==='UNAVAILABLE'?'UNAVAILABLE':'VALIDATED',reason:rejection,received_at:new Date(now).toISOString(),observed_at:bitcoin.observed_at||null,one_minute_rows:oneMinute.length,five_minute_rows:fiveMinute.length,one_minute:one,five_minute:five};}catch(e){bitcoinFeed.reason=e?.message==='bad_candles'?'INVALID_PROVIDER_PAYLOAD':e?.message?.startsWith('provider_http_')?'PROVIDER_HTTP_ERROR':'PROVIDER_UNAVAILABLE';}
 return {version:'directional-eye-v1',generated_at:new Date(now).toISOString(),research_only:true,
  assets:ASSETS.map(a=>a==='Bitcoin'?bitcoin:unavailable(a)),windows:timingWindows(now),
  measured_ranges:{bitcoin:await dailyRequest},data_quality:{bitcoin:bitcoinFeed,other_assets:'NO_VERIFIED_CANDLE_ADAPTER'},ledger_status:'NO_CANONICAL_WRITE',calibration:'UNVALIDATED',capital_permission:'0R',live_orders:false};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
 return res.status(200).json(await readEye());
}
