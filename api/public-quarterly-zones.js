import {QUARTER_ASSETS,quarterBounds,parseYahooQuarterBars,parseCoinbaseQuarterBars,
 calculateQuarterlyZones,quarterlyPacket,verifyQuarterlyPacket} from '../src/quarterly-liquidity-core.mjs';
// Read-only public research. Source rights and exchange-grade data are NOT certified.
// Eight fixed Yahoo instruments + Coinbase BTC-USD daily candles. No database.
const yahoo=Object.freeze({
 gold:'GC%3DF',brent:'BZ%3DF',wti:'CL%3DF',eurusd:'EURUSD%3DX',
 dxy:'DX-Y.NYB',spx:'%5EGSPC',nasdaq:'%5EIXIC',treasury:'%5ETNX'
});
const TIMEOUT_MS=5500,CACHE_MS=8*60*1000;
let cached=null,cacheUntil=0,pending=null;
async function getJson(url){
 const res=await fetch(url,{method:'GET',redirect:'error',cache:'no-store',
  headers:{Accept:'application/json','User-Agent':'TFA-quarterly-research-v253'},
  signal:AbortSignal.timeout(TIMEOUT_MS)});
 if(!res.ok)throw Error('source_request_failed');
 return res.json();
}
export async function observeQuarterlyRanges({read=getJson,now=Date.now}={}){
 const at=now(),bounds=quarterBounds(at);
 const start=bounds.previous_start,end=new Date(Math.min(at,Date.parse(bounds.current_end_exclusive)-1)).toISOString();
 const sources=Object.entries(yahoo).map(([asset,symbol])=>({
  asset,url:'https://query1.finance.yahoo.com/v8/finance/chart/'+symbol+'?range=6mo&interval=1d'
 }));
 sources.push({asset:'bitcoin',
  url:'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400&start='+
   encodeURIComponent(start)+'&end='+encodeURIComponent(end)});
 // Fully separate failures: no orderbook data or synthetic fill-in.
 const outcomes=await Promise.allSettled(sources.map(s=>read(s.url)));
 const snapshot={};
 for(let i=0;i<sources.length;i++){
  if(outcomes[i].status!=='fulfilled')continue;
  const {asset}=sources[i];
  const bars=asset==='bitcoin'?parseCoinbaseQuarterBars(outcomes[i].value)
     :parseYahooQuarterBars(outcomes[i].value,asset);
  if(bars)snapshot[asset]=calculateQuarterlyZones(bars,asset,at);
 }
 return quarterlyPacket(snapshot,at);
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-TFA-Zone-Policy','V253-QUARTERLY-PROXY-READ-ONLY');
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');
  return res.status(405).json({ok:false,error:'method_not_allowed',
   governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false}});
 }
 const now=Date.now();
 if(cached&&now<cacheUntil&&Object.keys(verifyQuarterlyPacket(cached,now)).length>0)
  return res.status(200).json(cached);
 if(!pending)pending=observeQuarterlyRanges().finally(()=>{pending=null});
 try{
  const packet=await pending;
  if(packet.ok){
   cached=packet;cacheUntil=Date.now()+CACHE_MS;
   return res.status(200).json(packet);
  }
  cached=null;cacheUntil=0;
  return res.status(503).json(packet);
 }catch{
  cached=null;cacheUntil=0;
  return res.status(503).json(quarterlyPacket({},Date.now()));
 }
}
