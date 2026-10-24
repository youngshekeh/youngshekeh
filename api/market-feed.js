import {createFeedPressureGate} from '../src/public-feed-pressure.mjs';

const BASE='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/';
// V264: allow the Gold aggregator its full 8.5s deadline plus bounded network overhead.
// Do not retry, invent a quote, or serve a stale success on upstream failure.
const PUBLIC_FEED_DEADLINE_MS=10_500;
// Only existing anonymous read endpoints. No private runtimes, writes, or caller URLs.
const FEEDS=new Set([
  'public-vertical-status','latest-global-markets','latest-global-trends','latest-nigeria-economy',
  'public-live-markets-api','public-gold-live-api','public-gold-live-xauusd','public-gold-execution-desk',
  'public-v63-structural-core-fabric','public-v56-signal-integrity-shield','public-v65-model-evidence-fabric',
  'public-v54-resilient-mission-control','public-gold-risk-challenger-evaluation',
  'public-gold-adaptive-paper-risk','public-gold-execution-firewall','public-gold-opportunity-governor',
  'public-gold-broker-adapter-lab','public-gold-execution-reality','public-gold-autonomous-shadow-trader',
  'public-gold-review-freshness','public-gold-review-priority','public-gold-contextual-disagreement',
  'public-gold-disagreement-intelligence','public-gold-review-intelligence','public-gold-signal-reputation',
  'public-gold-trigger-watch','public-gold-transition-state','public-gold-outcome-learning',
  'public-gold-learning-state','public-cross-asset-regime','public-regime-change-history',
  'public-forecast-governance','public-forecast-accountability','public-forecast-error-attribution',
  'paper-broker-quote-intake'
]);
// Reduce avoidable read traffic under provider pressure. Vercel instances do not
// share in-memory state, so this does not replace database/cron recovery.
const feeds=createFeedPressureGate({
  async read(feed){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),PUBLIC_FEED_DEADLINE_MS);
    try{
      const response=await fetch(BASE+feed,{
        headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-V223-BOUNDED-READ/1.0'},
        signal:controller.signal,cache:'no-store',redirect:'error'
      });
      const body=await response.json().catch(()=>null);
      if(!response.ok || !body || typeof body!=='object' || Array.isArray(body)
        || body.ok===false)throw new Error('feed_unavailable');
      return body;
    }finally{clearTimeout(timer);}
  }
});

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Monitor','V182');
  res.setHeader('X-TFA-Live-XAUUSD','V186');
  res.setHeader('X-TFA-Feed-Pressure-Version','V281');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,state:'UNAVAILABLE',error:'method_not_allowed'});
  }
  const url=new URL(req.url,'https://thefatheranalytics.com');
  const feed=url.searchParams.get('feed');
  if(!FEEDS.has(feed) || url.searchParams.getAll('feed').length!==1 || [...url.searchParams.keys()].some(key=>key!=='feed')){
    return res.status(400).json({ok:false,state:'UNAVAILABLE',error:'unknown_public_feed'});
  }
  const observed=await feeds.observe(feed);
  res.setHeader('X-TFA-Feed-Pressure',observed.mode);
  if(observed.ok)return res.status(200).json(observed.body);
  // Per-instance local failure suppression, NOT a predicted database recovery time.
  res.setHeader('Retry-After',String(Math.max(1,Math.min(60,Number(observed.retry_after_seconds)||4))));
  return res.status(503).json({ok:false,state:'UNAVAILABLE',error:'public_feed_unavailable',
    governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false}});
}
