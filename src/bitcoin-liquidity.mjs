import {currentBook} from './bitcoin-liquidity-core.mjs';
const parent=document.getElementById('directional-eye');
if(parent){
 const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 const box=el('section','');box.className='eye-card';box.setAttribute('aria-label','Bitcoin visible order-book depth');
 const heading=el('h3','Bitcoin · visible order-book depth'),state=el('p','Checking source-timestamped depth…'),values=el('dl',''),note=el('p','Single-venue snapshot. Orders can disappear. Imbalance is not a buy/sell signal.');
 box.append(heading,state,values,note);parent.querySelector('.eye-grid').before(box);
 let packet=null,pending=false,poll=null,expiry=null;
 const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
 function paint(){
  values.replaceChildren();const p=currentBook(packet);
  if(!p){state.textContent='Depth unavailable · '+(packet?.reason||'snapshot missing or expired').replaceAll('_',' ');return;}
  state.textContent='Observed Coinbase snapshot · '+new Date(p.observed_at).toLocaleTimeString('en-GB',{timeZone:'Africa/Lagos'})+' WAT · expires after 30 seconds';
  const pair=(k,v)=>values.append(el('dt',k),el('dd',v));
  pair('Best bid / ask',`${money(p.best_bid)} / ${money(p.best_ask)}`);
  pair('Spread',`${money(p.spread_usd)} · ${p.spread_bps.toFixed(3)} bps`);
  pair('Visible bid depth',`${money(p.bid_depth_usd)} · ${p.bid_levels} nearest price levels`);
  pair('Visible ask depth',`${money(p.ask_depth_usd)} · ${p.ask_levels} nearest price levels`);
  pair('Visible notional imbalance',`${(p.visible_imbalance*100).toFixed(1)}% · (bid − ask) / (bid + ask)`);
  pair('Price spans',`Bid ${p.bid_price_span.map(money).join('–')} / Ask ${p.ask_price_span.map(money).join('–')}`);
  pair('Capital Permission','WAIT · 0R');
 }
 async function refresh(){
  if(pending||document.hidden)return;pending=true;
  try{const r=await fetch('/api/bitcoin-liquidity',{cache:'no-store',signal:AbortSignal.timeout(6000)});if(!r.ok)throw Error();packet=await r.json();}catch{packet=null;}finally{pending=false;paint();}
 }
 function start(){if(poll!==null)return;poll=setInterval(refresh,15000);expiry=setInterval(paint,1000);}
 function stop(){clearInterval(poll);clearInterval(expiry);poll=null;expiry=null;}
 document.addEventListener('visibilitychange',()=>{paint();if(!document.hidden)void refresh();});
 window.addEventListener('pagehide',stop);window.addEventListener('pageshow',()=>{start();void refresh();});
 start();void refresh();
}
