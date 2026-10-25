import './market-observatory.css';
import './quarterly-observatory.mjs';
import './public-macro-observatory.mjs';
import {currentResearchObservations,retainTabObservation,tabSamplePath,PUBLIC_POLL_MS} from './market-observatory-core.mjs';
const element=id=>document.getElementById(id);
const goldText=element('ob-gold'),btcText=element('ob-btc');
if(goldText&&btcText){
 const format=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
 const time=at=>at?new Date(at).toLocaleString(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'}):'Not verified';
 let packet=null,pending=false,interval=null,expiry=null;
 let goldHistory=[],bitcoinHistory=[];
 function set(id,text){const el=element(id);if(el)el.textContent=text;}
 function status(id,text,kind){const el=element(id);if(el){el.textContent=text;el.dataset.state=kind;}}
 function update(){
  const refs=currentResearchObservations(packet,Date.now());
  const good=refs.count===2,partial=refs.count===1;
  status('ob-feed-status',refs.state,good?'online':partial?'partial':'unavailable');
  set('ob-gold',refs.gold?format(refs.gold.value):'Unavailable');
  set('ob-btc',refs.bitcoin?format(refs.bitcoin.value):'Unavailable');
  status('ob-gold-state',refs.gold?'CURRENT · INDICATIVE':'UNAVAILABLE',refs.gold?'online':'unavailable');
  status('ob-btc-state',refs.bitcoin?'RECEIPT CURRENT':'LICENSE HOLD',refs.bitcoin?'online':'unavailable');
  set('ob-gold-time',refs.gold?time(refs.gold.at):'Not verified');
  set('ob-btc-time',refs.bitcoin?time(refs.bitcoin.at):'Not verified');
  set('ob-gold-proof',refs.gold
   ?'Gold API source timestamp verified within 120 seconds. This remains an indicative reference, not a bid/ask.'
   :'Current provider-timestamped Gold spot is unavailable. No last known price shown.');
  set('ob-btc-proof',refs.bitcoin
   ?'Licensed Bitcoin reference accepted with documented provenance.'
   :'Bitcoin live and derived reference display withheld · licensed source required.');
  // No stale price survives expiry; tab-local prior observations are labelled history.
  set('ob-chart-summary',refs.count===0
   ?'Sources unavailable right now. Existing traces, if any, are historical tab observations only.'
   :'Charts contain only verified samples captured since this tab opened. They are not exchange price history.');
  const goldPath=element('ob-gold-trace'),btcPath=element('ob-btc-trace');
  if(goldPath)goldPath.setAttribute('d',tabSamplePath(goldHistory));
  if(btcPath)btcPath.setAttribute('d',tabSamplePath(bitcoinHistory));
  set('ob-gold-count',goldHistory.length+' tab observation'+(goldHistory.length===1?'':'s'));
  set('ob-btc-count',bitcoinHistory.length+' tab observation'+(bitcoinHistory.length===1?'':'s'));
 }
 async function refresh(){
  if(pending||document.hidden)return;
  pending=true;const b=element('ob-refresh');if(b)b.disabled=true;
  try{
   const response=await fetch('/api/public-market-reference',{
    method:'GET',headers:{Accept:'application/json'},cache:'no-store',
    signal:AbortSignal.timeout(7000)
   });
   if(!response.ok)throw Error('reference_unavailable');
   const data=await response.json();
   if(data?.reference_only!==true||data?.not_for_trade_execution!==true
      ||data?.governance?.capital_permission!=='0R'
      ||data?.governance?.live_order_submission_enabled!==false)throw Error('unverified_reference');
   const now=Date.now();
   const refs=currentResearchObservations(data,now);
   packet=data;
   if(refs.gold)goldHistory=retainTabObservation(goldHistory,refs.gold);
   if(refs.bitcoin)bitcoinHistory=retainTabObservation(bitcoinHistory,refs.bitcoin);
   set('ob-last-check','Checked '+new Date(now).toLocaleTimeString()+' · Public API, independent of private kernel');
  }catch{
   packet=null;set('ob-last-check','Provider unavailable · retrying automatically · no cached quote displayed');
  }finally{
   pending=false;if(b)b.disabled=false;update();
  }
 }
 function onWake(){update();if(!document.hidden)void refresh();}
 function start(){
  if(interval!==null)return;
  interval=window.setInterval(()=>{if(!document.hidden)void refresh()},PUBLIC_POLL_MS);
  expiry=window.setInterval(update,1000);
  document.addEventListener('visibilitychange',onWake);
 }
 function stop(){
  if(interval!==null)window.clearInterval(interval);
  if(expiry!==null)window.clearInterval(expiry);
  interval=null;expiry=null;
  document.removeEventListener('visibilitychange',onWake);
 }
 element('ob-refresh')?.addEventListener('click',()=>void refresh());
 window.addEventListener('pagehide',stop);
 window.addEventListener('pageshow',()=>{start();onWake()});
 start();update();void refresh();
}
