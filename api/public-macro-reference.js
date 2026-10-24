import {curateMacroQuote,curateMacroPacket,verifyMacroPacket,MACRO_GOVERNANCE,isMacroWeekendClosed}
 from '../src/public-macro-reference-data.mjs';
// Yahoo/ICE/NYMEX redistribution license NOT verified; public research
// diagnostics only, never licensed commerce or trading execution. NOT execution-grade.
const URLS=Object.freeze({
 wti:'https://query1.finance.yahoo.com/v8/finance/chart/CL%3DF?interval=1d&range=1d',
 dxy:'https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=1d'
});
const DEADLINE_MS=3500,CACHE_MS=25000;
let cached=null,until=0,pending=null;
async function providerRead(url){
 const resp=await fetch(url,{method:'GET',
  headers:{Accept:'application/json','User-Agent':'TFA-public-research-reference/1.0'},
  redirect:'error',cache:'no-store',signal:AbortSignal.timeout(DEADLINE_MS)});
 if(!resp.ok)throw Error('upstream_unavailable');
 const data=await resp.json();
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('invalid_response');
 return data;
}
export async function readMacroReferences({read=providerRead,now=Date.now}={}){
 const timestamp=now();
 // Closed-weekend research quotes cannot become live; skip unnecessary vendor calls.
 // The 503 and explicit zero-source packet remain fail-closed, including commerce.
 if(isMacroWeekendClosed(timestamp))return curateMacroPacket({},timestamp);
 const [a,b]=await Promise.allSettled([read(URLS.wti),read(URLS.dxy)]);
 return curateMacroPacket({
  wti:a.status==='fulfilled'?curateMacroQuote(a.value,'wti',timestamp):null,
  dxy:b.status==='fulfilled'?curateMacroQuote(b.value,'dxy',timestamp):null
 },timestamp);
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-TFA-Market-Source','V252-PUBLIC-DELAYED-RESEARCH');
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');
  return res.status(405).json({ok:false,error:'method_not_allowed',governance:MACRO_GOVERNANCE});
 }
 const now=Date.now();
 // Never serve cached observations that have expired since the last read.
 if(cached&&now<until&&verifyMacroPacket(cached,now).count>0){
  return res.status(200).json(cached);
 }
 if(!pending)pending=readMacroReferences().finally(()=>{pending=null});
 try{
  const observation=await pending;
  if(observation.ok){
   cached=observation;until=Date.now()+CACHE_MS;
   return res.status(200).json(observation);
  }
  cached=null;until=0;
  return res.status(503).json(observation);
 }catch{
  cached=null;until=0;
  return res.status(503).json(curateMacroPacket({},Date.now()));
 }
}
