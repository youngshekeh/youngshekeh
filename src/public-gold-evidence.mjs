// V222: independent public Gold proof for commercial launch decisions.
// Only a fresh, positive, read-only MT5 broker tick qualifies. Indicative
// market references can be displayed as research, never as broker-live proof.
export const GOLD_LAUNCH_MAX_AGE_MS = 5_000;
export const GOLD_LAUNCH_CLOCK_SKEW_MS = 1_000;
export function verifyPublicGoldQuote(envelope, now = Date.now()) {
  const reject = reason => Object.freeze({verified:false,reason,observed_at:null});
  const body = envelope?.data;
  if(envelope?.response?.ok !== true || body?.ok !== true)
    return reject('GOLD_PUBLIC_ENDPOINT_UNAVAILABLE');
  if(body?.live_broker?.state !== 'BROKER_LIVE')
    return reject('BROKER_LIVE_NOT_VERIFIED');
  const quote = body.live_broker.quote;
  if(!quote || typeof quote !== 'object') return reject('QUOTE_MISSING');
  const timestamp = Date.parse(String(quote.observed_at || ''));
  if(!Number.isFinite(timestamp) || !Number.isFinite(now)
    || timestamp > now + GOLD_LAUNCH_CLOCK_SKEW_MS
    || now - timestamp > GOLD_LAUNCH_MAX_AGE_MS)
    return reject('QUOTE_TIMESTAMP_NOT_FRESH');
  // Both timestamp and reported quote age must independently be fresh.
  const age = quote.age_seconds;
  if(typeof age !== 'number' || !Number.isFinite(age) || age < 0
    || age > GOLD_LAUNCH_MAX_AGE_MS / 1000)
    return reject('BROKER_QUOTE_AGE_NOT_VERIFIED');
  const bid = quote.bid, mid = quote.mid, ask = quote.ask;
  if(![bid,mid,ask].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0)
    || bid > mid || mid > ask)
    return reject('BROKER_BID_ASK_INVALID');
  return Object.freeze({
    verified:true,
    reason:'FRESH_BROKER_READ_ONLY_QUOTE',
    observed_at:new Date(timestamp).toISOString()
  });
}
