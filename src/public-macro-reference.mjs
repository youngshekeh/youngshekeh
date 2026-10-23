// V252 Oil/DXY independent of Gold/BTC, private Supabase and broker execution.
import {verifyMacroPacket} from './public-macro-reference-data.mjs';
const el=id=>document.getElementById(id);
if(el('pmr-wti')&&el('pmr-dxy')){
 let data=null,busy=false;
 const price=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
 function paint(){
  const refs=verifyMacroPacket(data,Date.now());
  for(const id of ['wti','dxy']){
   const value=refs[id];
   el('pmr-'+id).textContent=value?(id==='wti'?price(value.value):value.value.toFixed(2)):'Unavailable';
   el('pmr-'+id+'-info').textContent=value
    ?(id==='wti'?value.contract_label+' · ':'')+'Yahoo Finance · market time '+new Date(value.at).toLocaleString()+' · DELAYED / NOT EXECUTABLE'
    :'No current verified delayed '+(id==='wti'?'WTI futures':'DXY index')+' reference';
  }
 }
 async function refresh(){
  if(busy||document.hidden)return;
  busy=true;
  try{
   const r=await fetch('/api/public-macro-reference',{method:'GET',cache:'no-store',
     headers:{Accept:'application/json'},signal:AbortSignal.timeout(7000)});
   if(!r.ok)throw Error('macro_unavailable');
   const body=await r.json();
   data=verifyMacroPacket(body,Date.now()).count?body:null;
  }catch{data=null}
  finally{busy=false;paint()}
 }
 const poll=window.setInterval(()=>{if(!document.hidden)void refresh()},30000);
 const decay=window.setInterval(paint,1000);
 document.addEventListener('visibilitychange',()=>{paint();if(!document.hidden)void refresh()});
 window.addEventListener('pagehide',()=>{window.clearInterval(poll);window.clearInterval(decay)});
 paint();void refresh();
}
