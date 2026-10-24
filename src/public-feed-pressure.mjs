// V281: adaptive bounded failure pressure isolation for read-only market endpoints.
// Never returns a stale success after a failed upstream fetch.
// No cron, database, entitlement, identity or trading mutations.
export const GOLD_FEED = 'public-gold-live-xauusd';
export const PAPER_FEED = 'paper-broker-quote-intake';
export const GOLD_TTL_MS = 1000;
export const DEFAULT_TTL_MS = 15000;
export const FAILURE_COOLDOWN_MS = 4000;
export const MAX_FAILURE_COOLDOWN_MS = 60000;
export const GOLD_MAX_FAILURE_COOLDOWN_MS = 12000;
export const PAPER_MAX_FAILURE_COOLDOWN_MS = 4000;

export function createFeedPressureGate({read, now=Date.now, failureCooldownMs=FAILURE_COOLDOWN_MS,
 maxFailureCooldownMs=MAX_FAILURE_COOLDOWN_MS}={}) {
  if(typeof read !== 'function')throw new TypeError('read function required');
  if(!Number.isSafeInteger(failureCooldownMs)||failureCooldownMs<1||failureCooldownMs>60000)
    throw new RangeError('invalid cooldown');
  if(!Number.isSafeInteger(maxFailureCooldownMs)||maxFailureCooldownMs<failureCooldownMs||maxFailureCooldownMs>60000)
    throw new RangeError('invalid max cooldown');
  const cache=new Map();
  const pending=new Map();
  const cooldown=new Map();
  const failuresByFeed=new Map();
  const maxDelay=feed=>feed===GOLD_FEED?
    Math.max(failureCooldownMs,Math.min(maxFailureCooldownMs,GOLD_MAX_FAILURE_COOLDOWN_MS)):
    feed===PAPER_FEED?
      Math.max(failureCooldownMs,Math.min(maxFailureCooldownMs,PAPER_MAX_FAILURE_COOLDOWN_MS)):
      maxFailureCooldownMs;
  const delayFor=(feed,n)=>Math.min(maxDelay(feed),failureCooldownMs*2**Math.min(8,Math.max(0,n-1)));
  const ttl=feed=>feed===PAPER_FEED?0:feed===GOLD_FEED?GOLD_TTL_MS:DEFAULT_TTL_MS;
  async function observe(feed){
    const time=now(), fresh=cache.get(feed), age=fresh?time-fresh.at:Infinity;
    const maxAge=ttl(feed);
    if(fresh&&maxAge>0&&age>=0&&age<maxAge)
      return {ok:true,mode:'FRESH_CACHE',body:fresh.body};
    if(pending.has(feed))return pending.get(feed);
    const retryAt=cooldown.get(feed);
    if(typeof retryAt==='number'&&time<retryAt)
      return {ok:false,mode:'FAILURE_COOLDOWN',retry_after_seconds:Math.max(1,Math.ceil((retryAt-time)/1000))};
    let promise;
    promise=(async()=>{
      try{
        const body=await read(feed);
        if(!body||typeof body!=='object'||Array.isArray(body)||body.ok===false)
          throw new Error('upstream_unavailable');
        // The broker-live source can itself return ok:true while its quote is
        // DATA_GATED. Do not manufacture a live quote or change any timestamp.
        if(ttl(feed)>0)cache.set(feed,{at:now(),body});
        else cache.delete(feed);
        cooldown.delete(feed);
        failuresByFeed.delete(feed);
        return {ok:true,mode:'UPSTREAM',body};
      }catch{
        // Never serve previously cached success after an upstream failure.
        cache.delete(feed);
        const n=Math.min(64,(failuresByFeed.get(feed)||0)+1);
        failuresByFeed.set(feed,n);
        const delay=delayFor(feed,n);
        cooldown.set(feed,now()+delay);
        return {ok:false,mode:'UPSTREAM_UNAVAILABLE',retry_after_seconds:Math.max(1,Math.ceil(delay/1000))};
      }
    })().finally(()=>{if(pending.get(feed)===promise)pending.delete(feed)});
    pending.set(feed,promise);
    return promise;
  }
  return Object.freeze({observe});
}
