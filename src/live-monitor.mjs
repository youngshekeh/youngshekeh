// Request-driven timers prevent overlapping refreshes and stale success badges.
export function createLiveMonitor({refresh, onState = () => {}, intervalMs = 60_000,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, isVisible = () => true}) {
  let timer, pending = null, stopped = false;
  const state = {busy:false, paused:false, available:false, lastAttemptAt:null,
    lastSuccessAt:null, nextAt:null, observation:null, failures:0};
  const emit = () => onState({...state});
  const clear = () => {if (timer != null) clearTimer(timer); timer = undefined; state.nextAt = null;};
  const schedule = (delay = intervalMs) => {
    clear();
    if (stopped || !isVisible()) {state.paused = true; emit(); return;}
    state.paused = false;
    state.nextAt = now() + delay;
    timer = setTimer(() => {timer = undefined; void run('timer');}, delay);
    emit();
  };
  function run(reason = 'manual') {
    if (stopped || !isVisible()) {clear(); state.paused = true; emit(); return Promise.resolve(null);}
    if (pending) return pending;
    clear(); state.busy = true; state.paused = false; state.lastAttemptAt = now(); emit();
    pending = Promise.resolve().then(() => refresh(reason)).then(observation => {
      state.observation = observation ?? null;
      state.available = observation?.available === true;
      if (state.available) {state.lastSuccessAt = now(); state.failures = 0;}
      else state.failures++;
      return observation;
    }).catch(() => {state.available = false; state.observation = null; state.failures++; return null;})
      .finally(() => {pending = null; state.busy = false; schedule();});
    return pending;
  }
  return {
    refresh:run,
    snapshot:() => ({...state}),
    visibilityChanged() {
      if (!isVisible()) {clear(); state.paused = true; emit(); return;}
      if (pending) {state.paused = false; emit(); return;}
      if (state.lastAttemptAt == null || now() - state.lastAttemptAt >= intervalMs) void run('visibility');
      else schedule(Math.max(1, intervalMs - (now() - state.lastAttemptAt)));
    },
    stop() {stopped = true; clear(); state.paused = true; emit();}
  };
}

export async function runBounded(tasks, limit = 3, shouldContinue = () => true) {
  const results = new Array(tasks.length);
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length && shouldContinue()) {
      const index = cursor++;
      try {results[index] = {status:'fulfilled', value:await tasks[index]()};}
      catch (reason) {results[index] = {status:'rejected', reason};}
    }
  }
  await Promise.all(Array.from({length:Math.min(3, Math.max(1, limit), tasks.length)}, worker));
  return results;
}

export function marketAssetView(asset, marketState) {
  const closed = marketState === 'MARKET_CLOSED';
  const gated = /STALE|UNAVAILABLE|UNKNOWN|ERROR|FAIL|RESTRICTED/i.test(String(marketState));
  const validPrice = typeof asset?.price === 'number' && Number.isFinite(asset.price) && asset.price > 0;
  const state = gated ? String(marketState) : !validPrice ? 'UNAVAILABLE' : closed ? 'MARKET_CLOSED' : String(asset.state || 'OBSERVED');
  return {name:String(asset?.label || asset?.symbol || asset?.key || 'Asset'),
    price:!gated && validPrice ? asset.price : null,
    state, marketTime:asset?.market_time || null,
    permission:/gold|xau/i.test(String(asset?.key || asset?.label || '')) ? '0R' : 'OBSERVATION ONLY'};
}
