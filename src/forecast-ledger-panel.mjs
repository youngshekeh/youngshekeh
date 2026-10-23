import {currentLedger} from './forecast-ledger-health.mjs';
const root=document.getElementById('directional-eye');
if(root){
 const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 const panel=el('section','');panel.className='eye-card';panel.setAttribute('aria-label','Publication forecast ledger health');
 const title=el('h3','Forecast ledger · evidence health'),status=el('p','Checking existing publication ledger…'),values=el('dl','');
 const note=el('p','Existing publication records are separate from Directional Eye observations. Eye capture is not connected to the permanent ledger. No new database writes or performance scores.');
 panel.append(title,status,values,note);root.querySelector('.eye-grid').before(panel);
 let packet=null,pending=false,poll=null,expiry=null;
 function paint(){
  values.replaceChildren();const p=currentLedger(packet);
  if(!p){status.textContent='Ledger evidence unavailable · '+(packet?.reason||'source evidence missing or expired').replaceAll('_',' ');return;}
  status.textContent='Publication counts available · checked at source '+new Date(p.observed_at).toLocaleTimeString('en-GB',{timeZone:'Africa/Lagos'})+' WAT';
  const pair=(k,v)=>values.append(el('dt',k),el('dd',String(v)));
  pair('Stored publication forecasts',p.counts.total);pair('Open / resolved',`${p.counts.open} / ${p.counts.resolved}`);
  pair('Scored outcomes reported by source',`Direction ${p.counts.directional_scored} · Brier ${p.counts.brier_scored}`);
  pair('Performance verification',p.scoring_status.replaceAll('_',' '));pair('Accuracy / Brier / MFE / MAE','Withheld · outcome-level validation required');pair('Eye permanent capture','NOT CONNECTED');pair('Capital Permission','WAIT · 0R');
 }
 async function refresh(){if(pending||document.hidden)return;pending=true;try{const r=await fetch('/api/forecast-ledger-health',{cache:'no-store',signal:AbortSignal.timeout(6000)});if(!r.ok)throw Error();packet=await r.json();}catch{packet=null;}finally{pending=false;paint();}}
 function start(){if(poll!==null)return;poll=setInterval(refresh,120000);expiry=setInterval(paint,1000);}
 function stop(){clearInterval(poll);clearInterval(expiry);poll=null;expiry=null;}
 document.addEventListener('visibilitychange',()=>{paint();if(!document.hidden)void refresh();});window.addEventListener('pagehide',stop);window.addEventListener('pageshow',()=>{start();void refresh();});start();void refresh();
}
