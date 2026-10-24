import {HOMEPAGE_PUBLIC_ENDPOINTS} from './institutional-evidence.mjs';
import {evaluateInstitutionalProof} from './institutional-evidence-v280.mjs';
type Json=Record<string,any>;
const perspectives:Record<string,{title:string;caption:string;detail:string}>={
 session:{title:'Session / near-term evidence',caption:'Observe before framing a setup',
  detail:'A session lens asks what the latest completed observations support. Venue closure, quote age and liquidity proxies cannot be replaced by visual patterns.'},
 weekly:{title:'Weekly / structural context',caption:'Compare scenarios, not prophecies',
  detail:'A weekly lens separates completed-candle structure from interpretation and invalidation. Visual depth is conceptual, not a confirmed institutional position.'},
 quarterly:{title:'Quarterly / cycle perspective',caption:'Historical ranges, forward uncertainty',
  detail:'A quarterly lens can reference prior-quarter OHLC bands. These are historical range proxies, not current order-book liquidity or a forecast of the next sweep.'}
};
const node=(id:string)=>document.getElementById(id);
const text=(id:string,value:string)=>{const e=node(id);if(e)e.textContent=value;};
const safeFetch=async(url:string):Promise<Json|null>=>{
 try{
  const response=await window.fetch(url,{method:'GET',cache:'no-store',
   credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',
   headers:{Accept:'application/json'},signal:AbortSignal.timeout(7500)});
  if(!response.ok)return null;
  const data=await response.json();
  return data&&typeof data==='object'&&!Array.isArray(data)?data:null;
 }catch{return null;}
};
export function mountInstitutionalHome(){
 const lens=node('dimensional-lens'),recheck=node('source-ledger-refresh') as HTMLButtonElement|null;
 if(!lens||!recheck)return;
 const select=(horizon:string)=>{
  const p=perspectives[horizon];if(!p)return;
  lens.dataset.horizon=horizon;
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-lens-horizon]'))
   button.setAttribute('aria-pressed',String(button.dataset.lensHorizon===horizon));
  text('lens-horizon-title',p.title);
  text('lens-horizon-caption',p.caption);
  text('lens-horizon-detail',p.detail);
 };
 for(const button of document.querySelectorAll<HTMLButtonElement>('[data-lens-horizon]')){
  button.addEventListener('click',()=>select(button.dataset.lensHorizon||'session'));
 }
 let running=false,lastCheck=0,latest:ReturnType<typeof evaluateInstitutionalProof>|null=null;
 const renderProof=()=>{
   if(!latest)return;
   text('lens-proof-gold',latest.verified.gold?'SOURCE VERIFIED':'WITHHELD');
   text('lens-proof-btc',latest.verified.bitcoin?'RECEIPT ONLY':'WITHHELD');
   const horizon=lens.dataset.horizon||'session';
   text('lens-proof-horizon',latest.horizon[horizon as keyof typeof latest.horizon]??'NOT VERIFIED');
 };
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-lens-horizon]'))
   b.addEventListener('click',renderProof);
 const refresh=async()=>{
  if(running)return;
  const now=Date.now();
  if(lastCheck&&now-lastCheck<20_000){
   text('source-ledger-updated','Checked recently · try again in '+Math.ceil((20_000-(now-lastCheck))/1000)+'s');
   return;
  }
  lastCheck=now;running=true;recheck.disabled=true;
  text('source-ledger-updated','Checking source provenance…');
  try{
   // EXACT allowlist, each one-time read is anonymous. Do not poll provider APIs.
   const observed=await Promise.all(HOMEPAGE_PUBLIC_ENDPOINTS.map(safeFetch));
   const snapshot=evaluateInstitutionalProof({
    references:observed[0],macro:observed[1],quarterly:observed[2],recovery:observed[3]
   });
   for(const row of snapshot.items){
    const card=document.querySelector<HTMLElement>('[data-source-row="'+row.key+'"]');
    if(!card)continue;
    card.dataset.sourceState=row.state;
    const badge=card.querySelector<HTMLElement>('[data-source-verdict]');
    const detail=card.querySelector<HTMLElement>('[data-source-detail]');
    if(badge)badge.textContent=row.verdict;
    if(detail)detail.textContent=row.detail;
   }
   latest=snapshot;
   renderProof();
   text('source-ledger-summary',snapshot.source_summary);
   const core=snapshot.core_status==='DATABASE INCIDENT REPORTED'?' · private core: INCIDENT':' · private core: not certified';
   text('source-ledger-updated','Evidence checked '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+core);
  }finally{running=false;recheck.disabled=false;}
 };
 recheck.addEventListener('click',()=>void refresh());
 void refresh();
}
