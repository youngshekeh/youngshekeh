import './directional-eye.css';
import {ASSETS,unavailable} from './directional-eye-core.mjs';
const root=document.getElementById('directional-eye');
if(root){
 let packet=null,pending=false,timer=null,expiry=null;const records=new Map();
 const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 const fmt=x=>typeof x==='number'?new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(x):'Unavailable';
 function paint(){
  const grid=root.querySelector('.eye-grid');grid.replaceChildren();
  for(const asset of ASSETS){
   let row=packet?.assets?.find(x=>x.asset===asset)||unavailable(asset);
   if(row.expires_at&&Date.parse(row.expires_at)<Date.now())row=unavailable(asset,'Candle evidence expired');
   const card=el('article','');card.className='eye-card';card.append(el('h3',asset),el('strong',`${row.state} · ${row.direction}`));
   const dl=el('dl','');
   const pair=(k,v)=>dl.append(el('dt',k),el('dd',v));
   pair('Readiness / probability',row.readiness==null?'Unavailable':`${row.readiness}/100 rule completeness · probability uncalibrated`);
   const l=row.levels;
   pair('Positioning zone',l?.zone?l.zone.map(fmt).join('–'):'Unconfirmed');
   pair('Upper / lower watch',l?`${fmt(l.upper)} / ${fmt(l.lower)}`:'Awaiting candles');
   pair('Trigger / invalidation',l?.trigger?`${fmt(l.trigger)} / ${fmt(l.invalidation)}`:'Unconfirmed');
   pair('Scenario targets / horizon',l?.targets?`${l.targets.map(fmt).join(' → ')} / 60m research horizon`:'Unavailable');
   pair('Potential distance',l?.projected_distance?`${fmt(l.projected_distance)} USD · 2 ATR scenario`:'Unavailable');
   pair('Evidence',row.observed_at?`${row.source} · ${new Date(row.observed_at).toLocaleString('en-GB',{timeZone:'Africa/Lagos'})} WAT`:'Awaiting attributed 1m + 5m candles');
   pair('Timing window',packet?.windows?(asset==='Bitcoin'||asset.includes('Nasdaq')||asset==='S&P 500'||asset==='US 10Y'||asset==='DXY'?packet.windows.newYork:packet.windows.london):'Awaiting check');
   if(asset==='Bitcoin'){
    const quality=packet?.data_quality?.bitcoin;
    const qualityFresh=packet&&Date.now()-Date.parse(packet.generated_at)<60000;
    pair('Candle feed health',quality?`${quality.provider} · ${qualityFresh?quality.status:'EXPIRED CHECK'} · ${(quality.reason||'Integrity checks passed').replaceAll('_',' ')}`:'Unavailable');
    pair('Candle counts',quality?.one_minute_rows?`1m: ${quality.one_minute_rows} / 5m: ${quality.five_minute_rows}`:'Unavailable');
    for(const [name,key] of [['1m','one_minute'],['5m','five_minute']]){
     const detail=quality?.[key];
     if(detail)pair(`${name} evidence check`,`${(detail.reason||detail.status).replaceAll('_',' ')} · last completed ${detail.last_closed_at?new Date(detail.last_closed_at).toLocaleTimeString('en-GB',{timeZone:'Africa/Lagos'})+' WAT':'unavailable'} · age at check ${detail.age_seconds??'—'}s`);
    }
    const ranges=packet?.measured_ranges?.bitcoin;
    if(ranges?.status==='OBSERVED_RANGES'&&Date.parse(ranges.expires_at)>Date.now()){
     for(const [name,r] of Object.entries(ranges.periods))pair(`${name} observed UTC range`,r.status==='OBSERVED_IN_PROGRESS'?`${fmt(r.low)}–${fmt(r.high)} · ${r.daily_buckets} daily buckets · in progress`:'Period start unavailable');
     pair('Range provenance','Coinbase daily OHLC · current day incomplete · receipt freshness only');
    }else pair('Measured UTC ranges',ranges?.reason||'Unavailable or receipt expired');
   }
   pair('Capital Permission','WAIT · 0R');card.append(dl,el('p',row.reason));grid.append(card);
   if(['ARMED','TRIGGER'].includes(row.state)&&row.forecast_id&&!records.has(row.forecast_id)&&records.size<500)records.set(row.forecast_id,Object.freeze({...row,captured_at:new Date().toISOString(),outcome:'PENDING',storage:'TAB_ONLY_NOT_CANONICAL'}));
  }
 }
 async function refresh(){if(pending||document.hidden)return;pending=true;root.querySelector('[data-refresh]').disabled=true;
  try{const r=await fetch('/api/directional-eye',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error();const p=await r.json();
   const age=Date.now()-Date.parse(p.generated_at);
   if(p.version!=='directional-eye-v1'||p.research_only!==true||p.live_orders!==false||p.capital_permission!=='0R'||!Number.isFinite(age)||age< -5000||age>60000)throw Error();packet=p;
   root.querySelector('[data-status]').textContent='Checked '+new Date().toLocaleTimeString('en-GB',{timeZone:'Africa/Lagos'})+' WAT · Research model unvalidated';
  }catch{packet=null;root.querySelector('[data-status]').textContent='Candle service unavailable · signals withheld';}
  finally{pending=false;root.querySelector('[data-refresh]').disabled=false;paint();}
 }
 root.querySelector('[data-refresh]').addEventListener('click',refresh);
 root.querySelector('[data-export]').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({model:'directional-eye-v1',canonical:false,records:[...records.values()]},null,2)],{type:'application/json'}));const a=el('a','');a.href=url;a.download='directional-eye-tab-observations.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 function start(){if(timer!==null)return;timer=setInterval(refresh,60000);expiry=setInterval(paint,5000);}
 function stop(){clearInterval(timer);clearInterval(expiry);timer=null;expiry=null;}
 document.addEventListener('visibilitychange',()=>{paint();if(!document.hidden)void refresh();});
 window.addEventListener('pagehide',stop);window.addEventListener('pageshow',()=>{start();void refresh();});start();paint();void refresh();
}
