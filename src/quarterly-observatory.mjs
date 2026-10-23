import './quarterly-zones.css';
import {QUARTER_ASSETS,verifyQuarterlyPacket} from './quarterly-liquidity-core.mjs';
import {classifyQuarterAlert,acceptQuarterAlert} from './quarterly-alert-rules.mjs';
import {verifiedPublicReferences} from './v235-reference-integrity.mjs';
// V253: Opt-in, local, open-tab research notifications only; no service worker.
const root=document.getElementById('quarter-zones');
if(root){
 const select=s=>root.querySelector(s);
 const cards=select('[data-quarter-cards]'),events=select('[data-quarter-events]');
 const status=select('[data-quarter-status]'),alertStatus=select('[data-quarter-alert-status]');
 const fmt=n=>typeof n==='number'&&Number.isFinite(n)
  ?new Intl.NumberFormat('en-US',{maximumFractionDigits:4}).format(n):'Unavailable';
 let packet=null,btcPacket=null,active=false,alertsArmed=false,desktopGranted=false;
 let history=[],states=new Map(),timer=null,clockTimer=null,controller=null;
 const notify=event=>{
  const message=event.asset_label+' · '+event.state.replaceAll('_',' ').toLowerCase()+
    ' · '+fmt(event.price)+' · '+event.quarter+' proxy '+fmt(event.level);
  history.unshift({...event,text:message,seen_at:new Date().toISOString()});
  history=history.slice(0,60);
  if(alertsArmed&&desktopGranted&&typeof Notification==='function'&&document.visibilityState==='visible'){
   try{new Notification('THE FATHER · QUARTERLY WATCH',{body:message,tag:'tfa-quarter-'+event.asset,
    silent:true});}catch{desktopGranted=false}
  }
 };
 function renderEvents(){
  events.replaceChildren();
  if(history.length===0){
   const p=document.createElement('p');p.className='ob-quarter-empty';
   p.textContent='No qualified zone interactions observed in this tab yet.';
   events.append(p);return;
  }
  for(const event of history.slice(0,18)){
   const item=document.createElement('li');item.className='ob-quarter-event';
   const title=document.createElement('strong');title.textContent=event.asset_label+' · '+event.state.replaceAll('_',' ');
   const details=document.createElement('span');details.textContent=
     'Price '+fmt(event.price)+' · reference '+fmt(event.level)+' · '+new Date(event.seen_at).toLocaleTimeString()+
     ' · observed '+new Date(event.market_observed_at).toLocaleTimeString();
   item.append(title,details);events.append(item);
  }
 }
 function card(asset,zone,now){
  const config=QUARTER_ASSETS[asset],item=document.createElement('article');
  item.className='ob-quarter-card';
  const headline=document.createElement('div');headline.className='ob-quarter-card-head';
  const label=document.createElement('strong');label.textContent=config.label;
  const subtitle=document.createElement('span');subtitle.textContent=config.symbol+' · '+config.unit;
  headline.append(label,subtitle);item.append(headline);
  if(!zone){
   const p=document.createElement('p');p.className='ob-quarter-empty';
   p.textContent='Quarterly range unavailable · incomplete or unverified daily bars.';
   item.append(p);return item;
  }
  const quote=asset==='bitcoin'?getBitcoinQuote(now):zone.quote?{
   value:zone.quote.value,at:zone.quote.at,source:'Yahoo Finance'}:null;
  const classified=classifyQuarterAlert(zone,quote,now);
  const measure=document.createElement('p');measure.className='ob-quarter-price';
  measure.textContent=classified?fmt(classified.price):'Quote unavailable';
  const classed=document.createElement('span');classed.className='ob-quarter-identity';
  classed.textContent=classified?classified.state.replaceAll('_',' ')+' · '+new Date(quote.at).toLocaleTimeString():
   'QUOTE NOT FRESH · NO ALERT';
  item.append(measure,classed);
  const dl=document.createElement('dl');dl.className='ob-quarter-rows';
  const pair=(title,value)=>{const dt=document.createElement('dt');dt.textContent=title;
   const dd=document.createElement('dd');dd.textContent=value;dl.append(dt,dd)};
  pair('Prior quarter',zone.previous_quarter);
  pair('Upper proxy · buy-side',fmt(zone.buy_side_proxy[0])+'–'+fmt(zone.buy_side_proxy[1]));
  pair('Lower proxy · sell-side',fmt(zone.sell_side_proxy[0])+'–'+fmt(zone.sell_side_proxy[1]));
  pair('Prior-quarter midpoint',fmt(zone.previous_midpoint));
  pair('Quarter-to-date observed',fmt(zone.current_qtd_low)+'–'+fmt(zone.current_qtd_high));
  pair('Daily samples',zone.sample_days_prev+' prior / '+zone.sample_days_qtd+' QTD');
  pair('Evidence',zone.source+' · last daily bar '+zone.source_last_daily_bar);
  item.append(dl);
  const note=document.createElement('p');note.className='ob-quarter-caption';
  note.textContent=(zone.contract_label?zone.contract_label+' · ':'')+
   'Previous completed-quarter OHLC range; inner bands = 2% of range. Proxies, not actual order-book liquidity.'+
   (asset==='gold'?' Gold quarterly levels are COMEX futures, NOT XAU spot.':'');
  item.append(note);
  if(alertsArmed&&classified){
   const transition=acceptQuarterAlert(states,classified,now);
   states=transition.state;if(transition.event)notify(transition.event);
  }
  return item;
 }
 function getBitcoinQuote(now){
  const verified=verifiedPublicReferences(btcPacket,now).bitcoin;
  return verified?{value:verified.value,at:verified.at,source:'Coinbase'}:null;
 }
 function render(){
  const now=Date.now(),zones=verifyQuarterlyPacket(packet,now);
  cards.replaceChildren();
  for(const asset of Object.keys(QUARTER_ASSETS))cards.append(card(asset,zones[asset],now));
  const n=Object.keys(zones).length;
  status.textContent=n+' / '+Object.keys(QUARTER_ASSETS).length+
   ' QUARTERLY RANGES VERIFIED · '+(n?'RESEARCH ONLY':'AWAITING SOURCES');
  alertStatus.textContent=alertsArmed
   ?'Tab alerts ON · '+(desktopGranted?'browser notifications allowed':'browser notifications not enabled')
   :'Tab alerts OFF · opt in to begin';
  renderEvents();
 }
 async function fetchZoneData(){
  if(active||document.hidden)return;
  active=true;const b=select('[data-quarter-refresh]');if(b)b.disabled=true;
  controller=new AbortController();
  const timeout=window.setTimeout(()=>controller?.abort(),9500);
  try{
   const [zonesRes,btcRes]=await Promise.allSettled([
    fetch('/api/public-quarterly-zones',{cache:'no-store',
      signal:controller.signal,headers:{Accept:'application/json'}}),
    fetch('/api/public-market-reference',{cache:'no-store',
      signal:controller.signal,headers:{Accept:'application/json'}})
   ]);
   if(zonesRes.status==='fulfilled'&&zonesRes.value.ok){
    const value=await zonesRes.value.json();
    packet=Object.keys(verifyQuarterlyPacket(value,Date.now())).length?value:null;
   }else packet=null;
   btcPacket=btcRes.status==='fulfilled'&&btcRes.value.ok?await btcRes.value.json():null;
  }catch{packet=null;btcPacket=null}
  finally{window.clearTimeout(timeout);controller=null;active=false;
   if(b)b.disabled=false;render()}
 }
 const arm=select('[data-quarter-arm]');
 arm?.addEventListener('click',()=>{
  alertsArmed=!alertsArmed;
  arm.textContent=alertsArmed?'Pause tab alerts':'Enable tab alerts';
  // Freshly enabling alerts never retroactively replays historical notifications.
  if(!alertsArmed)states=new Map();
  render();
 });
 select('[data-quarter-permission]')?.addEventListener('click',async()=>{
  if(typeof Notification!=='function'||!window.isSecureContext){
   alertStatus.textContent='Browser notifications unsupported. Tab alerts remain available.';return;
  }
  try{
   desktopGranted=(await Notification.requestPermission())==='granted';
   render();
  }catch{desktopGranted=false;alertStatus.textContent='Browser notification permission unavailable.'}
 });
 select('[data-quarter-refresh]')?.addEventListener('click',()=>void fetchZoneData());
 const wake=()=>{render();if(!document.hidden)void fetchZoneData()};
 const start=()=>{if(timer!==null)return;
  timer=window.setInterval(()=>{if(!document.hidden)void fetchZoneData()},180000);
  clockTimer=window.setInterval(render,15000);
  document.addEventListener('visibilitychange',wake);
 };
 const stop=()=>{window.clearInterval(timer);window.clearInterval(clockTimer);timer=null;clockTimer=null;
  document.removeEventListener('visibilitychange',wake);controller?.abort();packet=null;btcPacket=null;active=false};
 window.addEventListener('pagehide',stop);
 window.addEventListener('pageshow',()=>{start();wake()});
 start();render();void fetchZoneData();
}
