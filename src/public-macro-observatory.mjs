import {verifyMacroPacket} from './public-macro-reference-data.mjs';
import {retainTabObservation,tabSamplePath} from './market-observatory-core.mjs';
const get=id=>document.getElementById(id);
const fmtPrice=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',
 minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const fmtIndex=n=>Number(n).toFixed(2);
const clock=t=>t?new Date(t).toLocaleString(undefined,{timeZoneName:'short'}):'Unverified';
let macroPacket=null,macroPending=false;
let series={wti:[],dxy:[]};
function paint(){
 const ref=verifyMacroPacket(macroPacket,Date.now());
 for(const asset of ['wti','dxy']){
  const v=ref[asset],price=get('ob-'+asset);
  if(!price)continue;
  price.textContent=v?(asset==='wti'?fmtPrice(v.value):fmtIndex(v.value)):'Unavailable';
  const state=get('ob-'+asset+'-state');if(state){
   state.textContent=v?'DELAYED · INDICATIVE':'UNAVAILABLE';
   state.dataset.state=v?'online':'unavailable';
  }
  const time=get('ob-'+asset+'-time');if(time)time.textContent=v?clock(v.at):'Not verified';
  const proof=get('ob-'+asset+'-proof');
  if(proof)proof.textContent=v
   ?(asset==='wti'?v.contract_label+' · ':'')+'Vendor market timestamp. Delays up to 30 minutes; NOT executable or commercially licensed.'
   :'No current verified vendor market observation. No stale quote is displayed.';
  const path=get('ob-'+asset+'-trace');if(path)path.setAttribute('d',tabSamplePath(series[asset]));
  const n=get('ob-'+asset+'-count');if(n)n.textContent=series[asset].length+' tab observation'+(series[asset].length===1?'':'s');
 }
}
async function refresh(){
 if(macroPending||document.hidden)return;
 macroPending=true;
 try{
  const response=await fetch('/api/public-macro-reference',{method:'GET',
   headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(7000)});
  if(!response.ok)throw Error('source_unavailable');
  const body=await response.json();
  const refs=verifyMacroPacket(body,Date.now());
  if(refs.count===0)throw Error('no_verified_macro_references');
  macroPacket=body;
  for(const asset of ['wti','dxy'])if(refs[asset])
   series[asset]=retainTabObservation(series[asset],refs[asset]);
 }catch{
  macroPacket=null;
 }finally{macroPending=false;paint()}
}
if(get('ob-wti')&&get('ob-dxy')){
 const render=()=>{paint();if(!document.hidden)void refresh()};
 const button=get('ob-refresh');button?.addEventListener('click',()=>void refresh());
 const interval=window.setInterval(()=>{if(!document.hidden)void refresh()},30000);
 const expiry=window.setInterval(paint,1000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
 window.addEventListener('pagehide',()=>{window.clearInterval(interval);window.clearInterval(expiry)});
 paint();void refresh();
}
