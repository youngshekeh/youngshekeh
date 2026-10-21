// V223: per-instance pressure isolation for read-only public market endpoints.
// Never returns a stale success after a failed upstream fetch.
// No cron, database, entitlement, identity or trading mutations.
export const GOLD_FEED = 'public-gold-live-xauusd';
export const PAPER_FEED = 'paper-broker-quote-intake';
export const GOLD_TTL_MS = 1000;
export const DEFAULT_TTL_MS = 15000;
export const FAILURE_COOLDOWN_MS = 4000;

export function createFeedPressureGate({read, now=Date.now, failureCooldownMs=FAILURE_COOLDOWN_MS}={}) {
  if(typeof read !== 'function')throw new TypeError('read function required');
  if(!Number.isSafeInteger(failureCooldownMs)||failureCooldownMs<1||failureCooldownMs>60000)
    throw new RangeError('invalid cooldown');
  const cache=new Map();
  const pending=new Map();
  const cooldown=new Map();
  const ttl=feed=>feed===PAPER_FEED?0:feed===GOLD_FEED?GOLD_TTL_MS:DEFAULT_TTL_MS;
  async function observe(feed){
    const time=now(), fresh=cache.get(feed), age=fresh?time-fresh.at:Infinity;
    const maxAge=ttl(feed);
    if(fresh&&maxAge>0&&age>=0&&age<maxAge)
      return {ok:true,mode:'FRESH_CACHE',body:fresh.body};
    if(pending.has(feed))return pending.get(feed);
    const retryAt=cooldown.get(feed);
    if(typeof retryAt==='number'&&time<retryAt)
      return {ok:false,mode:'FAILURE_COOLDOWN'};
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
        return {ok:true,mode:'UPSTREAM',body};
      }catch{
        // Never serve previously cached success after an upstream failure.
        cache.delete(feed);
        cooldown.set(feed,now()+failureCooldownMs);
        return {ok:false,mode:'UPSTREAM_UNAVAILABLE'};
      }
    })().finally(()=>{if(pending.get(feed)===promise)pending.delete(feed)});
    pending.set(feed,promise);
    return promise;
  }
  return Object.freeze({observe});
}
