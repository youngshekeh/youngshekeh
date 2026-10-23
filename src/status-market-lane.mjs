// V257 public market source-health truth. Never substitutes for private release gates.
import {verifiedPublicReferences} from './v235-reference-integrity.mjs';
import {verifyMacroPacket} from './public-macro-reference-data.mjs';
import {verifyQuarterlyPacket,QUARTER_ASSETS} from './quarterly-liquidity-core.mjs';
const EXPECTED=Object.freeze({spot:2,macro:2,quarterly:Object.keys(QUARTER_ASSETS).length});
const SOURCE_NAMES=Object.freeze({
 spot:'Gold API and Coinbase',macro:'Yahoo Finance · WTI NYMEX futures / ICE DXY',
 quarterly:'Yahoo Finance daily bars and Coinbase Exchange'
});
const clean=(x)=>typeof x==='string'?x:'';
const iso=(at)=>{const n=Date.parse(clean(at));return Number.isFinite(n)?new Date(n).toISOString():null};
export function assessMarketStatusFeed(kind,read,now=Date.now()){
 if(!Object.hasOwn(EXPECTED,kind))throw new TypeError('unknown_public_feed');
 const expected=EXPECTED[kind],response=read?.response;
 const unavailable=()=>Object.freeze({
  kind,available:false,full:false,count:0,expected,
  state:'SOURCE UNAVAILABLE',source:SOURCE_NAMES[kind],observed_at:null,
  reference_only:true,licensed_for_commercial_resale:false,
  risk:'WAIT / 0R · NOT BROKER LIVE',detail:'No sufficiently verified current provider evidence'
 });
 if(response?.ok!==true||read?.data?.ok!==true)return unavailable();
 const data=read.data;
 let names=[],ages=[],lastDaily=[];
 if(kind==='spot'){
  const refs=verifiedPublicReferences(data,now);
  if(refs.gold){names.push('Gold source timestamp valid');ages.push(refs.gold.at)}
  if(refs.bitcoin){names.push('Bitcoin response receipt valid, not a provider market timestamp');ages.push(refs.bitcoin.at)}
 }else if(kind==='macro'){
  const refs=verifyMacroPacket(data,now);
  for(const key of ['wti','dxy'])if(refs[key]){
   names.push((key==='wti'?'WTI NYMEX futures':'ICE DXY index')+' vendor market time valid (possibly 30m delayed)');
   ages.push(refs[key].at);
  }
 }else{
  const zones=verifyQuarterlyPacket(data,now);
  for(const [key,z] of Object.entries(zones)){
   if(!Object.hasOwn(QUARTER_ASSETS,key))continue;
   names.push(key+' '+z.previous_quarter+' daily range covered');
   if(/^\d{4}-\d{2}-\d{2}$/.test(clean(z.source_last_daily_bar)))lastDaily.push(z.source_last_daily_bar);
  }
 }
 const count=names.length;
 if(count===0)return unavailable();
 const full=count===expected;
 const last=ages.length?new Date(Math.min(...ages.map(t=>Date.parse(t)))).toISOString():null;
 const lastBar=lastDaily.length?lastDaily.sort().at(0):null;
 return Object.freeze({
  kind,available:true,full,count,expected,
  state:(full?'VERIFIED RESEARCH':'PARTIAL RESEARCH')+' · '+count+'/'+expected,
  source:SOURCE_NAMES[kind],observed_at:kind==='quarterly'?null:last,
  reference_only:true,licensed_for_commercial_resale:false,
  risk:'WAIT / 0R · NOT BROKER LIVE',
  detail:kind==='quarterly'
   ?'Completed-quarter price-range proxies, not order-book liquidity. Oldest reported daily bar: '+(lastBar||'NOT VERIFIED')
   :names.join(' · ')+'. No execution-grade quotes.'
 });
}
export async function inspectResearchSources({read,report=()=>{},now=Date.now}={}){
 if(typeof read!=='function')throw new TypeError('read_required');
 const sources=['macro','quarterly'];
 const results=await Promise.all(sources.map(async kind=>{
  let input=null;
  try{input=await read(kind)}catch{}
  const result=assessMarketStatusFeed(kind,input,now());
  report(kind,result);return result;
 }));
 return Object.freeze(Object.fromEntries(sources.map((key,i)=>[key,results[i]])));
}
