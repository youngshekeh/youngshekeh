import './public-market-reference.css';
import './home-editorial.css';
import {verifiedPublicReferences} from './v235-reference-integrity.mjs';
const ROOT=document.getElementById('public-market-reference');
if(ROOT){
 const select=id=>document.getElementById(id);
 const gold=select('pmr-gold'),btc=select('pmr-btc'),status=select('pmr-status');
 const updated=select('pmr-updated'),goldInfo=select('pmr-gold-info'),btcInfo=select('pmr-btc-info');
 const format=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2,minimumFractionDigits:2}).format(n);
 let pending=false,lastOk=0,packet=null,timer=null,expiryTimer=null;
 function publish(data){
  window.dispatchEvent(new CustomEvent('tfa:public-references',{detail:data}));
 }
 function paint(data){
  const refs=verifiedPublicReferences(data,Date.now());
  gold.textContent=refs.gold?format(refs.gold.value):'Unavailable';
  btc.textContent=refs.bitcoin?format(refs.bitcoin.value):'Unavailable';
  goldInfo.textContent=refs.gold?'Indicative USD / troy oz · Gold API · '+new Date(refs.gold.at).toLocaleTimeString():'No current attributed spot observation';
  btcInfo.textContent='BTC / USD · LIVE DISPLAY WITHHELD · licensed source required';
  const count=refs.count;
  status.textContent=count===2?'2 SOURCES RESPONDING':count===1?'PARTIAL SOURCES':'NO FRESH REFERENCE';
  status.dataset.state=count===2?'online':count===1?'partial':'unavailable';
  publish(data);
 }
 function unavailable(message){
  packet={ok:false};
  window.__tfaPublicReferencePacket={ok:false};
  paint(packet);
  updated.textContent=message;
 }
 async function refresh(){
  if(pending||document.hidden)return;
  pending=true;
  try{
   const response=await fetch('/api/public-market-reference',{headers:{Accept:'application/json'},
     cache:'no-store',signal:AbortSignal.timeout(7500)});
   if(!response.ok)throw new Error('source_unavailable');
   const data=await response.json();
   if(data?.ok!==true||data?.reference_only!==true||data?.governance?.capital_permission!=='0R')
     throw new Error('unverified_payload');
   packet=data;
   window.__tfaPublicReferencePacket=data;
   lastOk=Date.now();
   updated.textContent='Checked '+new Date(lastOk).toLocaleTimeString()+' · Indicative research only · BTC license hold';
   paint(packet);
  }catch{
   unavailable('Provider unavailable · retrying automatically. No stale price shown.');
  }
  finally{pending=false;}
 }
 const wake=()=>{
  paint(packet);
  if(!document.hidden&&Date.now()-lastOk>4000)void refresh();
 };
 function start(){
  if(timer!==null)return;
  timer=window.setInterval(()=>{if(!document.hidden)void refresh()},15000);
  // Validation continues independently of slow or suspended network requests.
  expiryTimer=window.setInterval(()=>paint(packet),1000);
  document.addEventListener('visibilitychange',wake);
 }
 function stop(){
  window.clearInterval(timer);window.clearInterval(expiryTimer);
  timer=null;expiryTimer=null;
  document.removeEventListener('visibilitychange',wake);
 }
 window.addEventListener('pagehide',stop);
 window.addEventListener('pageshow',()=>{start();wake();});
 start();void refresh();
}
