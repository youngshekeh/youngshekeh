import './quarterly-zones.css';
import {QUARTER_ASSETS,verifyQuarterlyPacket} from './quarterly-liquidity-core.mjs';
import {classifyQuarterAlert} from './quarterly-alert-rules.mjs';
import {advanceQuarterWatch} from './quarterly-alert-observer.mjs';
import {verifyMacroPacket} from './public-macro-reference-data.mjs';
import {MARKET_FEED_PLAN,readMarketFeed,marketStreamSummary,MARKET_RENDER_INTERVAL_MS} from './market-feed-cadence.mjs';
import {verifiedPublicReferences} from './v235-reference-integrity.mjs';
// V253: Opt-in, local, open-tab research notifications only; no service worker.
const root=document.getElementById('quarter-zones');
if(root){
 const select=s=>root.querySelector(s);
 const cards=select('[data-quarter-cards]'),events=select('[data-quarter-events]');
 const status=select('[data-quarter-status]'),alertStatus=select('[data-quarter-alert-status]');
 const fmt=n=>typeof n==='number'&&Number.isFinite(n)
  ?new Intl.NumberFormat('en-US',{maximumFractionDigits:4}).format(n):'Unavailable';
 let packet=null,btcPacket=null,macroPacket=null,alertsArmed=false,desktopGranted=false;
 let history=[],observations=new Map(),timers=new Map(),clockTimer=null,controllers=new Map(),pending=new Set();
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
     ' · source '+event.source+' · before '+new Date(event.previous_market_observed_at).toLocaleTimeString()+
     ' → after '+new Date(event.market_observed_at).toLocaleTimeString();
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
  const macro=(asset==='wti'||asset==='dxy')?verifyMacroPacket(macroPacket,now)[asset]:null;
  // WTI / DXY use independent short-cache spot/market references first.
  // Never mix XAU indicative spot with COMEX GC=F quarterly futures levels.
  const quote=asset==='bitcoin'?getBitcoinQuote(now):macro?{
   value:macro.value,at:macro.at,source:macro.source
  }:zone.quote?{
   value:zone.quote.value,at:zone.quote.at,source:'Yahoo Finance'
  }:null;
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
  // Record every valid source observation (also while alerts are OFF).
  // Initial values, duplicate provider timestamps and gaps create no notifications.
  // Only two source-ordered snapshots proving a NEW zone state may emit.
  const evaluated=advanceQuarterWatch(observations,classified,{armed:alertsArmed,now});
  observations=evaluated.ledger;
  if(evaluated.event)notify(evaluated.event);
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
   ?'Watching new provider-timestamped zone transitions · '+(desktopGranted?'browser notifications allowed':'browser notifications not enabled')
   :'Tab alerts OFF · opt in to begin';
  for(const [kind,sourcePacket] of [['quarterly',packet],['spot',btcPacket],['macro',macroPacket]]){
   const el=select('[data-quarter-feed-'+kind+']');
   if(!el)continue;
   const state=marketStreamSummary(kind,sourcePacket,now);
   el.textContent=state.kind.toUpperCase()+' · '+state.count+'/'+state.expected+
    ' '+state.state+' · '+Math.round(state.interval_ms/1000)+'s checks';
   el.dataset.state=state.count===state.expected?'online':state.count>0?'partial':'unavailable';
  }
  renderEvents();
 }
 // Run streams at independent cadences: 15s spot, 30s macro, 5m history.
 // Each source has its own timeout and error state. No source failure can
 // erase still-valid observations from another source.
 async function fetchFeed(kind){
  if(pending.has(kind)||document.hidden)return;
  const plan=MARKET_FEED_PLAN[kind];
  if(!plan)return;
  pending.add(kind);
  const controller=new AbortController();
  controllers.set(kind,controller);
  const button=select('[data-quarter-refresh]');if(button)button.disabled=true;
  const timeout=window.setTimeout(()=>controller.abort(),plan.maxRequestMs);
  try{
   const accepted=await readMarketFeed(kind,{
    read:async url=>{
     const r=await fetch(url,{cache:'no-store',signal:controller.signal,
      headers:{Accept:'application/json'}});
     if(!r.ok)throw Error('upstream_public_source_unavailable');
     return r.json();
    }
   });
   if(kind==='quarterly')packet=accepted?.packet||null;
   if(kind==='spot')btcPacket=accepted?.packet||null;
   if(kind==='macro')macroPacket=accepted?.packet||null;
  }catch{
   if(kind==='quarterly')packet=null;
   if(kind==='spot')btcPacket=null;
   if(kind==='macro')macroPacket=null;
  }finally{
   window.clearTimeout(timeout);controllers.delete(kind);
   pending.delete(kind);if(button)button.disabled=pending.size>0;
   render();
  }
 }
 function refreshAll(){
  for(const kind of Object.keys(MARKET_FEED_PLAN))void fetchFeed(kind);
 }
 const arm=select('[data-quarter-arm]');
 arm?.addEventListener('click',()=>{
  alertsArmed=!alertsArmed;
  arm.textContent=alertsArmed?'Pause tab alerts':'Enable tab alerts';
  // Freshly enabling alerts never retroactively replays historical notifications.
  // Keep witnessed baselines when paused; enabling never retroactively alerts.
  // No browser preferences are stored or sent to the server.
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
 select('[data-quarter-refresh]')?.addEventListener('click',refreshAll);
 const wake=()=>{render();if(!document.hidden)refreshAll()};
 const start=()=>{
  if(timers.size>0)return;
  for(const [kind,plan] of Object.entries(MARKET_FEED_PLAN))
   timers.set(kind,window.setInterval(()=>{
    if(!document.hidden)void fetchFeed(kind);
   },plan.intervalMs));
  clockTimer=window.setInterval(render,MARKET_RENDER_INTERVAL_MS);
  document.addEventListener('visibilitychange',wake);
 };
 const stop=()=>{
  for(const timer of timers.values())window.clearInterval(timer);
  timers.clear();window.clearInterval(clockTimer);clockTimer=null;
  document.removeEventListener('visibilitychange',wake);
  for(const controller of controllers.values())controller.abort();
  controllers.clear();pending.clear();
  packet=null;btcPacket=null;macroPacket=null;
 };
 window.addEventListener('pagehide',stop);
 window.addEventListener('pageshow',()=>{start();wake()});
 start();render();refreshAll();
}
