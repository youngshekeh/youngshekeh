import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"GET, OPTIONS"};const BASE='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1';const LIVE_TTL=60_000,CLOSED_TTL=300_000;let ttl=LIVE_TTL,cached:any=null,cachedAt=0;let inflight:Promise<any>|null=null;
function signState(score:number){if(score>=2)return{state:'BULLISH_CONFIRMED',bias:'UP',confidence:72};if(score===1)return{state:'BULLISH_MIXED',bias:'UP',confidence:58};if(score<=-2)return{state:'BEARISH_CONFIRMED',bias:'DOWN',confidence:72};if(score===-1)return{state:'BEARISH_MIXED',bias:'DOWN',confidence:58};return{state:'MIXED',bias:'NEUTRAL',confidence:50}}function ch(x:any){return Number.isFinite(Number(x?.change_pct))?Number(x.change_pct):null}function gt(x:number|null,t:number){return x!=null&&x>=t}function lt(x:number|null,t:number){return x!=null&&x<=t}
async function gold(){const r=await fetch(`${BASE}/public-gold-live-xauusd`,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(8500)});const j=await r.json().catch(()=>null);if(!r.ok||!j?.ok)throw new Error('market_spine_unavailable');return j}
let globalMarketSpine:any=null;
async function build(){const g=await gold(),f=g.feed||{},gc=ch(f.gold_futures||f.gold),dx=ch(f.dxy),eu=ch(f.eurusd),bt=ch(f.bitcoin),br=ch(f.brent),yb=Number.isFinite(Number(f.us10y?.change_bps))?Number(f.us10y.change_bps):null;globalMarketSpine=g;const asset=(key:string,label:string,score:number,drivers:string[])=>{const q=f[key];if(!q)return{key,label,price:null,change_pct:null,market_time:null,state:'UNAVAILABLE',bias:'NEUTRAL',confidence_pct:0,drivers:[]};const s=signState(score);return{key,label,price:q?.price??null,change_pct:q?.change_pct??null,market_time:q?.market_time??null,state:s.state,bias:s.bias,confidence_pct:s.confidence,drivers}};let eurScore=0;const eurDrivers:string[]=[];if(gt(eu,.08)){eurScore++;eurDrivers.push('EURUSD positive on day')}else if(lt(eu,-.08)){eurScore--;eurDrivers.push('EURUSD negative on day')}if(lt(dx,-.05)){eurScore++;eurDrivers.push('DXY softer')}else if(gt(dx,.05)){eurScore--;eurDrivers.push('DXY firmer')}if(yb!=null&&yb<=-2){eurScore++;eurDrivers.push('US yields lower')}else if(yb!=null&&yb>=2){eurScore--;eurDrivers.push('US yields higher')};let btcScore=0;const btcDrivers:string[]=[];if(gt(bt,.5)){btcScore++;btcDrivers.push('Bitcoin positive on day')}else if(lt(bt,-.5)){btcScore--;btcDrivers.push('Bitcoin negative on day')}if(lt(dx,-.05)){btcScore++;btcDrivers.push('DXY softer')}else if(gt(dx,.05)){btcScore--;btcDrivers.push('DXY firmer')}if(yb!=null&&yb<=-2){btcScore++;btcDrivers.push('US yields lower')}else if(yb!=null&&yb>=2){btcScore--;btcDrivers.push('US yields higher')};let dxyScore=0;const dxyDrivers:string[]=[];if(gt(dx,.05)){dxyScore++;dxyDrivers.push('DXY positive on day')}else if(lt(dx,-.05)){dxyScore--;dxyDrivers.push('DXY negative on day')}if(lt(eu,-.08)){dxyScore++;dxyDrivers.push('EURUSD weaker')}else if(gt(eu,.08)){dxyScore--;dxyDrivers.push('EURUSD stronger')}if(yb!=null&&yb>=2){dxyScore++;dxyDrivers.push('US yields higher')}else if(yb!=null&&yb<=-2){dxyScore--;dxyDrivers.push('US yields lower')};let brScore=0;const brDrivers:string[]=[];if(gt(br,.4)){brScore++;brDrivers.push('Brent positive on day')}else if(lt(br,-.4)){brScore--;brDrivers.push('Brent negative on day')}if(lt(dx,-.05)){brScore++;brDrivers.push('DXY softer')}else if(gt(dx,.05)){brScore--;brDrivers.push('DXY firmer')};let yScore=0;const yDrivers:string[]=[];if(yb!=null&&yb>=2){yScore++;yDrivers.push('10Y yield rising')}else if(yb!=null&&yb<=-2){yScore--;yDrivers.push('10Y yield falling')}if(gt(dx,.05)){yScore++;yDrivers.push('DXY firmer')}else if(lt(dx,-.05)){yScore--;yDrivers.push('DXY softer')}if(lt(gc,-.15)){yScore++;yDrivers.push('Gold futures softer')}else if(gt(gc,.15)){yScore--;yDrivers.push('Gold futures firmer')};const displayGold=f.gold_spot||f.gold_futures||f.gold,goldAsset={key:'gold',label:f.gold_spot?'XAUUSD Spot':'Gold Futures',price:displayGold?.price??null,change_pct:displayGold?.change_pct??null,market_time:displayGold?.market_time??null,state:g.engine?.state??'UNKNOWN',bias:String(g.engine?.state||'').includes('HERO')?'UP':String(g.engine?.state||'').includes('DRAGON')?'DOWN':'NEUTRAL',confidence_pct:g.engine?.confidence_pct??0,action:g.engine?.action??'WAIT',capital_permission:g.engine?.capital_permission??'0R',drivers:[`Hero ${g.engine?.hero_score??0} / Dragon ${g.engine?.dragon_score??0}`,'Engine basis: COMEX futures']},assets=[goldAsset,asset('dxy','DXY',dxyScore,dxyDrivers),asset('us10y','US10Y',yScore,yDrivers),asset('brent','Brent',brScore,brDrivers),asset('eurusd','EURUSD',eurScore,eurDrivers),asset('bitcoin','Bitcoin',btcScore,btcDrivers)];let risk=0;const regimeDrivers:string[]=[];if(gt(bt,.5)){risk++;regimeDrivers.push('Bitcoin supportive')}else if(lt(bt,-.5)){risk--;regimeDrivers.push('Bitcoin weak')}if(lt(dx,-.05)){risk++;regimeDrivers.push('Dollar softer')}else if(gt(dx,.05)){risk--;regimeDrivers.push('Dollar firmer')}if(yb!=null&&yb<=-2){risk++;regimeDrivers.push('Yields easing')}else if(yb!=null&&yb>=2){risk--;regimeDrivers.push('Yields firming')}const regime=risk>=2?'RISK_ON':risk<=-2?'DEFENSIVE':'MIXED',stale=g.market_status==='STALE',closed=g.market_status==='MARKET_CLOSED',gated=stale||closed||g.market_status==='UNAVAILABLE',note=g.market_status==='UNAVAILABLE'?'Market spine unavailable; fail-closed state is active.':closed?'Gold/FX market is closed. Capital permission remains WAIT / 0R until the session reopens.':stale?'Stale data forces WAIT.':'Gold display uses XAUUSD spot when available; governed Gold performance remains COMEX-futures calibrated.';return{ok:true,version:'live-markets-api-v186-live-xauusd',generated_at:new Date().toISOString(),market_status:g.market_status,regime:{state:g.market_status==='UNAVAILABLE'?'DATA_GATED':closed?'MARKET_CLOSED':stale?'DATA_GATED':regime,score:g.market_status==='UNAVAILABLE'?0:risk,drivers:g.market_status==='UNAVAILABLE'?[]:regimeDrivers},decision:{action:gated?'WAIT':g.engine?.action??'WAIT',capital_permission:gated?'0R':g.engine?.capital_permission??'0R',note},assets,gold_context:{display_basis:f.gold_spot?'XAUUSD spot indicative':'COMEX futures fallback',engine_basis:'COMEX Gold futures',futures_price:f.gold_futures?.price??f.gold?.price??null,spot_price:f.gold_spot?.price??null,basis_usd:g.display?.futures_spot_basis_usd??null},latest_macro:g.latest_macro??null,latest_governed_report:g.latest_governed_report??null,runtime_policy:{mode:'CONTROLLED_LOAD',cache_seconds:g.market_status==='MARKET_CLOSED'?300:60,upstream_count:1,upstream:'public-gold-live-xauusd',cache_busting:false},methodology:{market_spine:'Uses one cached governed market snapshot for Gold, DXY, US10Y, Brent, EURUSD and Bitcoin.',bias_policy:'Non-Gold assets show transparent directional bias only.',gold_policy:'Gold action/capital permission are inherited unchanged from the governed Gold engine.',execution_notice:'Research beta. Use your broker feed for execution.'}}}

// V325 REVIEW ONLY: per-asset quote freshness and provenance guard.
// A fresh SERVER RESPONSE is not proof of a fresh MARKET QUOTE.
// Public research data is not licensed for automated order execution.
const CRITICAL_ASSETS=['gold','dxy','brent'];
const HARD_QUOTE_MAX_AGE_MS=10*60_000;
const OBSERVATION_MAX_AGE_MS=30*60_000;
const FUTURE_CLOCK_SKEW_MS=2*60_000;
function quoteQuality(q:any,nowMs:number){
  const rawPrice=q?.price;
  const price=typeof rawPrice==='number'&&Number.isFinite(rawPrice)&&rawPrice>0
    ?rawPrice:null;
  const timestamp=q?.market_time;
  const ts=typeof timestamp==='string'&&timestamp.trim()
    ?Date.parse(timestamp):NaN;
  const ageMs=Number.isFinite(ts)?nowMs-ts:NaN;
  const validTime=Number.isFinite(ageMs)
    &&ageMs>=-FUTURE_CLOCK_SKEW_MS;
  const ageMinutes=validTime?Math.max(0,ageMs/60000):null;
  const reason=price===null?'INVALID_OR_MISSING_PRICE'
    :!validTime?'MISSING_OR_FUTURE_QUOTE_TIME'
    :ageMs>OBSERVATION_MAX_AGE_MS?'STALE_MARKET_TIME'
    :ageMs>HARD_QUOTE_MAX_AGE_MS?'DELAYED_MARKET_TIME'
    :'QUOTE_TIME_RECENT';
  const status=reason==='QUOTE_TIME_RECENT'?'FRESH_INDICATIVE':
    reason==='DELAYED_MARKET_TIME'?'DELAYED_INDICATIVE':
    reason==='STALE_MARKET_TIME'?'STALE':'UNVERIFIED';
  // Do not assert that public quote endpoints grant a resale,
  // redistribution, or executable market-data licence.
  const provider=typeof q?.source==='string'
    ?q.source.slice(0,100):'SOURCE_UNDISCLOSED';
  return{
    quote_status:status,quote_reason:reason,
    quote_observed_at:validTime?timestamp:null,
    quote_age_minutes:ageMinutes===null?null:Math.round(ageMinutes*10)/10,
    source_label:provider,
    provenance_basis:q?.instrument_type||q?.quote_type||'UNVERIFIED',
    redistribution_license_verified:false,
    executable_quote_verified:false,
    display_eligible:status==='FRESH_INDICATIVE',
    // Even fresh public indicators are never executable broker quotes.
    trading_permission:'WAIT_0R'
  };
}
function enforceQuoteTruth(body:any,g:any){
  const nowMs=Date.now();
  const feed=g?.feed||{};
  const lookup:Record<string,string>={
    gold:feed.gold_spot?'gold_spot':feed.gold_futures?'gold_futures':'gold',
    dxy:'dxy',us10y:'us10y',brent:'brent',eurusd:'eurusd',bitcoin:'bitcoin'
  };
  const items=(Array.isArray(body.assets)?body.assets:[]).map((asset:any)=>{
    const q=feed[lookup[asset.key]]||null;
    const quality=quoteQuality(q,nowMs);
    const nonFresh=quality.quote_status!=='FRESH_INDICATIVE';
    return{
      ...asset,
      // No fake LIVE badge or direction from missing/stale data.
      price:nonFresh?null:asset.price,
      change_pct:nonFresh?null:asset.change_pct,
      drivers:nonFresh?[]:asset.drivers,
      last_observed_price:nonFresh&&typeof asset.price==='number'
        &&Number.isFinite(asset.price)?asset.price:null,
      state:nonFresh?'DATA_GATED':asset.state,
      bias:nonFresh?'NEUTRAL':asset.bias,
      confidence_pct:nonFresh?0:asset.confidence_pct,
      action:'WAIT',capital_permission:'0R',quote_quality:quality
    };
  });
  const critical=CRITICAL_ASSETS.map(k=>({
    key:k,
    quote_status:items.find((a:any)=>a.key===k)
      ?.quote_quality?.quote_status||'UNVERIFIED'
  }));
  const goldData=items.find((a:any)=>a.key==='gold')||null;
  const futuresQuality=quoteQuality(feed.gold_futures||feed.gold||null,nowMs);
  const spotQuality=quoteQuality(feed.gold_spot||null,nowMs);
  const futuresUsable=futuresQuality.quote_status==='FRESH_INDICATIVE';
  const spotUsable=spotQuality.quote_status==='FRESH_INDICATIVE';
  const brokerTick=g?.live_broker;
  const brokerValid=brokerTick?.state==='BROKER_LIVE'&&
    Number.isFinite(Number(g?.engine?.broker_quote_age_seconds))&&
    Number(g.engine.broker_quote_age_seconds)>=0&&
    Number(g.engine.broker_quote_age_seconds)<3&&
    feed.gold_spot?.quote_type==='broker_live_read_only'&&
    goldData?.quote_quality?.quote_status==='FRESH_INDICATIVE';
  const blocked=critical.some(x=>x.quote_status!=='FRESH_INDICATIVE')||
    ['UNAVAILABLE','STALE','MARKET_CLOSED'].includes(String(g?.market_status));
  return{
    ...body,
    version:'live-markets-api-v325-quote-truth-review',
    market_status:blocked?'DATA_GATED':body.market_status,
    upstream_market_status:g?.market_status||'UNAVAILABLE',
    assets:items,
    regime:blocked?{state:'DATA_GATED',score:0,drivers:[]}:body.regime,
    // Public quotes remain research-only regardless of their timestamp.
    decision:{
      ...(body.decision||{}),action:'WAIT',capital_permission:'0R',
      note:blocked
        ?'Gold, DXY or Brent quote freshness unverified. WAIT / 0R.'
        :'Indicative quotes are recent, but redistribution/execution licence and live broker settlement are unverified. WAIT / 0R.'
    },
    quote_integrity:{
      status:blocked?'BLOCKED':'RESEARCH_ONLY',
      critical_asset_statuses:critical,
      source_count:items.filter((a:any)=>a.quote_quality?.display_eligible).length,
      asset_count:items.length,
      upstream_market_status:g?.market_status||'UNAVAILABLE',
      license_verified:false,
      execution_enabled:false,
      mt5_broker_tick_verified:!!brokerValid,
      mt5_provider_status:brokerValid?'BROKER_READ_ONLY':'NOT_VERIFIED',
      gold_spot_basis:feed.gold_spot?'SPOT_INDICATIVE':'FUTURES_FALLBACK',
      hard_quote_max_age_minutes:10,
      delayed_quote_max_age_minutes:30,
      decision:'WAIT',capital_permission:'0R',
      note:'Quote timestamp, snapshot creation timestamp and authorization to redistribute are separate checks. No executable quote is claimed.'
    },
    gold_context:{
      ...(body.gold_context||{}),
      // Secondary context fields are also consumed by UI components.
      // Never leave a stale spot/futures quote here as an apparent live price.
      spot_price:spotUsable?body.gold_context?.spot_price??null:null,
      futures_price:futuresUsable?body.gold_context?.futures_price??null:null,
      basis_usd:(spotUsable&&futuresUsable)?body.gold_context?.basis_usd??null:null,
      last_observed_spot_price:!spotUsable?body.gold_context?.spot_price??null:null,
      last_observed_futures_price:!futuresUsable?body.gold_context?.futures_price??null:null,
      display_basis:feed.gold_spot?'Indicative XAUUSD spot; see quote status':'Gold futures fallback; NOT spot'
    }
  };
}

async function current(){const now=Date.now();if(cached&&now-cachedAt<ttl)return cached;if(inflight)return inflight;inflight=build().then(x=>{cached=enforceQuoteTruth(x,globalMarketSpine);cachedAt=Date.now();ttl=x?.market_status==='MARKET_CLOSED'?CLOSED_TTL:LIVE_TTL;return cached}).finally(()=>{inflight=null});return inflight}
Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='GET')return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers:cors});try{const hit=!!(cached&&Date.now()-cachedAt<ttl),body=await current();const cc=body?.market_status==='MARKET_CLOSED'?'public, max-age=120, s-maxage=300, stale-while-revalidate=600':'public, max-age=30, s-maxage=60, stale-while-revalidate=120';return Response.json(body,{headers:{...cors,'Cache-Control':cc,'X-TFA-Cache':hit?'HIT':'MISS'}})}catch(e){console.error(e);const body={ok:true,version:'live-markets-api-v7-fail-closed',generated_at:new Date().toISOString(),market_status:'UNAVAILABLE',regime:{state:'DATA_GATED',score:0,drivers:[]},decision:{action:'WAIT',capital_permission:'0R',note:'Market spine unavailable; fail-closed state is active.'},assets:[],gold_context:{display_basis:'UNAVAILABLE',engine_basis:'COMEX Gold futures',futures_price:null,spot_price:null,basis_usd:null},latest_macro:null,latest_governed_report:null,runtime_policy:{mode:'CONTROLLED_LOAD',cache_seconds:60,upstream_count:1,upstream:'public-gold-live-api',fallback:'FAIL_CLOSED'},methodology:{fallback:'No directional state is inferred when the Gold market spine is unavailable.',gold_policy:'Gold remains WAIT / 0R.',execution_notice:'Research beta. Use your broker feed for execution.'}};cached=null;cachedAt=0;return Response.json(body,{status:503,headers:{...cors,'Cache-Control':'no-store','X-TFA-Cache':'FALLBACK'}})}});
