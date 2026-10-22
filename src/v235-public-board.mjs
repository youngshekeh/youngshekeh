import './v235-editorial.css';
import {verifiedPublicReferences} from './v235-reference-integrity.mjs';
const grid=document.getElementById('marketTileGrid');
if(grid){
 const status=document.getElementById('marketPattern'),breadth=document.getElementById('marketBreadth'),usable=document.getElementById('marketUsable');
 const independent=document.getElementById('independentLaneState');
 let latest=null;
 const defaults=['Gold spot','DXY','S&P 500','Bitcoin','EUR / USD','U.S. 10Y','WTI crude'];
 const findCard=(label,index)=>{
   const cards=Array.from(grid.querySelectorAll('article'));
   const names=label==='Gold spot'?['GOLD','XAU','GOLD SPOT']:
     label==='Bitcoin'?['BITCOIN','BTC']:null;
   const matched=cards.find(card=>{
     const name=(card.querySelector('div span, span')?.textContent||'').trim().toUpperCase();
     return names?names.some(x=>name===x||name.startsWith(x+' /')):name===label.toUpperCase();
   });
   return matched??(cards.length===7?cards[index]:null);
 };
 const makeCard=(label)=>{
   const card=document.createElement('article');
   card.className='market-tile market-reference-card';
   const name=document.createElement('span');name.textContent=label;
   const price=document.createElement('strong');price.textContent='Unavailable';
   const meta=document.createElement('small');meta.textContent='Verified market observation unavailable';
   card.append(name,price,meta);
   return card;
 };
 function show(label,index,quote){
   let card=findCard(label,index);
   if(!card){
     card=makeCard(label);
     grid.append(card);
   }
   // Never relabel an independently verified core instrument as a spot reference.
   if(card.classList.contains('market-tile')&&!card.dataset.publicReference){
     const freshness=card.querySelector('[data-freshness]')?.getAttribute('data-freshness')||'';
     const coreTime=card.querySelector('small')?.textContent||'';
     if(/FRESH|LIVE|CURRENT/i.test(freshness)&&/verified/i.test(coreTime))return;
   }
   if(card.dataset.publicReference!=='yes'){
     card.replaceChildren();
     const labelNode=document.createElement('span');labelNode.textContent=label;
     const priceNode=document.createElement('strong');
     const metaNode=document.createElement('small');
     card.append(labelNode,priceNode,metaNode);
     card.dataset.publicReference='yes';
   }
   card.classList.add('market-reference-card');
   card.querySelector('strong').textContent=quote
     ?quote.value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
     :'Unavailable';
   card.querySelector('small').textContent=quote
     ?quote.label+' · '+quote.source+' · '+quote.time_type+' time '+new Date(quote.at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'UTC'})+' UTC'
     :'Independent public source not current';
   card.dataset.referenceStatus=quote?'observed':'unavailable';
 }
 function paint(packet){
   latest=packet;
   const references=verifiedPublicReferences(packet,Date.now());
   show('Gold spot',0,references.gold);
   show('Bitcoin',3,references.bitcoin);
   if(independent) independent.textContent=references.count+'/2 PUBLIC SOURCES';
   // Do not fabricate complete cross-asset breadth from two spot observations.
   if(status&&/SYNCING|SOURCE CHECK|WITHHELD|UNAVAILABLE|UNKNOWN/.test(status.textContent||''))status.textContent='CORE BREADTH UNVERIFIED';
   if(breadth&&/unavailable|n\/a/i.test(breadth.textContent||''))breadth.textContent=references.count+'/2 independently attributed spot references';
   if(usable&&/^(0\/7|.*REF)/.test(usable.textContent||''))usable.textContent='0/7 CORE · '+references.count+'/2 REF';
 }
 // Share a single bounded Gold/BTC fetch with the homepage reference panel.
 // A price never becomes a broker tick or a core market breadth observation.
 const receive=event=>paint(event.detail??null);
 window.addEventListener('tfa:public-references',receive);
 // The reference module may resolve first on a warm browser cache.
 paint(window.__tfaPublicReferencePacket??null);
 // Time-based revalidation removes observations that age out while network is unavailable.
 const interval=window.setInterval(()=>paint(window.__tfaPublicReferencePacket??null),10000);
 window.addEventListener('pagehide',()=>{
   window.clearInterval(interval);
   window.removeEventListener('tfa:public-references',receive);
 },{once:true});
}
