const BASE='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/';
// Only existing anonymous read endpoints. No private runtimes, writes, or caller URLs.
const FEEDS=new Set([
  'public-vertical-status','latest-global-markets','latest-global-trends','latest-nigeria-economy',
  'public-live-markets-api','public-gold-live-api','public-gold-execution-desk',
  'public-v63-structural-core-fabric','public-v56-signal-integrity-shield','public-v65-model-evidence-fabric',
  'public-v54-resilient-mission-control','public-gold-risk-challenger-evaluation',
  'public-gold-adaptive-paper-risk','public-gold-execution-firewall','public-gold-opportunity-governor',
  'public-gold-broker-adapter-lab','public-gold-execution-reality','public-gold-autonomous-shadow-trader',
  'public-gold-review-freshness','public-gold-review-priority','public-gold-contextual-disagreement',
  'public-gold-disagreement-intelligence','public-gold-review-intelligence','public-gold-signal-reputation',
  'public-gold-trigger-watch','public-gold-transition-state','public-gold-outcome-learning',
  'public-gold-learning-state','paper-broker-quote-intake'
]);
const pending=new Map(), cached=new Map();
const TTL=15_000;

async function observe(feed){
  const old=cached.get(feed);
  if(old && Date.now()-old.at<TTL)return old.value;
  if(pending.has(feed))return pending.get(feed);
  const request=(async()=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),10_000);
    try{
      const response=await fetch(BASE+feed,{
        headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-V182-PUBLIC-READ/1.0'},
        signal:controller.signal,cache:'no-store',redirect:'error'
      });
      const body=await response.json();
      if(!response.ok || !body || typeof body!=='object' || Array.isArray(body))throw new Error('feed_unavailable');
      const value={body};
      if(body.ok===true && feed!=='paper-broker-quote-intake')cached.set(feed,{at:Date.now(),value});
      return value;
    }finally{clearTimeout(timer);}
  })().finally(()=>pending.delete(feed));
  pending.set(feed,request);
  return request;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Monitor','V182');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,state:'UNAVAILABLE',error:'method_not_allowed'});
  }
  const url=new URL(req.url,'https://thefatheranalytics.com');
  const feed=url.searchParams.get('feed');
  if(!FEEDS.has(feed) || url.searchParams.getAll('feed').length!==1 || [...url.searchParams.keys()].some(key=>key!=='feed')){
    return res.status(400).json({ok:false,state:'UNAVAILABLE',error:'unknown_public_feed'});
  }
  try{
    const {body}=await observe(feed);
    return res.status(200).json(body);
  }catch{
    return res.status(503).json({ok:false,state:'UNAVAILABLE',error:'public_feed_unavailable',
      governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false}});
  }
}
