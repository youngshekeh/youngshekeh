import './public-gold-launch.css';

// Public research surface. It cannot submit trades, elevate permission or infer a live quote.
const GOLD_ENDPOINT = '/api/market-feed?feed=public-gold-live-xauusd';
const MAX_BROKER_AGE_SECONDS = 5;
const MAX_REFERENCE_AGE_SECONDS = 900;
const fmt = (value) => Number.isFinite(Number(value)) && Number(value) > 0
  ? '$' + Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : 'WITHHELD';
const parseDate = (value) => {
  const t = Date.parse(String(value || ''));
  return Number.isFinite(t) ? t : null;
};
const ageOf = (value) => {
  const t = parseDate(value);
  return t === null ? null : Math.max(0, (Date.now()-t)/1000);
};
function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function setup() {
  const surface = document.body?.dataset?.surface;
  if (!['gold-live','live-markets','visual-lab'].includes(surface)) return;
  const heading = document.querySelector('main .command-lede');
  if (!heading) return;
  const panel = make('section','public-gold-readiness');
  panel.setAttribute('aria-label','Public Gold market data readiness');
  const head = make('div','pgr-head');
  const title = make('div','pgr-title');
  title.append(make('span','pgr-kicker','PUBLIC GOLD LIVE · DATA TRUTH'));
  title.append(make('h2','','Read the market. Verify the source.'));
  head.append(title);
  const state = make('strong','pgr-state pgr-pending','CHECKING DATA');
  state.setAttribute('role','status');
  state.setAttribute('aria-live','polite');
  head.append(state);
  panel.append(head);
  const detail = make('p','pgr-detail','Checking broker price, observation time and indicative market reference.');
  panel.append(detail);
  const grid = make('div','pgr-metrics');
  const ids = {};
  for (const [key,label,initial] of [
    ['price','XAUUSD PRICE','WITHHELD'],
    ['mode','PRICE CLASS','UNVERIFIED'],
    ['source','SOURCE','CHECKING'],
    ['age','QUOTE AGE','WITHHELD'],
    ['broker','MT5 BRIDGE','CHECKING'],
    ['permission','CAPITAL PERMISSION','WAIT · 0R']
  ]) {
    const cell = make('div','pgr-metric');
    cell.append(make('span','',label));
    const val = make('strong','',initial);
    ids[key] = val;
    cell.append(val);
    grid.append(cell);
  }
  panel.append(grid);
  const foot = make('div','pgr-foot');
  foot.append(make('p','','Broker-live means a fresh authenticated, read-only MT5 tick. Indicative spot is not an execution quote. COMEX futures structure is a separate instrument.'));
  const links = make('nav','pgr-links');
  for (const [text,path] of [
    ['Gold Live','/gold-live/'],
    ['Market Dashboard','/live-markets/'],
    ['Crown · River · Staircase','/visual-lab/']
  ]) {
    const a = make('a','',text);
    a.href = path;
    if ('/'+surface+'/'===path) a.setAttribute('aria-current','page');
    links.append(a);
  }
  foot.append(links);
  panel.append(foot);
  heading.insertAdjacentElement('afterend',panel);
  let busy = false;
  let lastOk = 0;
  const unavailable = (reason) => {
    state.className = 'pgr-state pgr-offline';
    state.textContent = 'LIVE FEED NOT VERIFIED';
    detail.textContent = reason;
    ids.price.textContent = 'WITHHELD';
    ids.mode.textContent = 'DATA GATED';
    ids.source.textContent = 'UNAVAILABLE';
    ids.age.textContent = 'WITHHELD';
    ids.broker.textContent = 'AWAITING TICKS';
    ids.permission.textContent = 'WAIT · 0R';
  };
  async function refresh() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const response = await fetch(GOLD_ENDPOINT,{
        headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(9500)
      });
      if (!response.ok) throw new Error('quote_source_unavailable');
      const data = await response.json();
      if (!data || data.ok !== true || typeof data !== 'object') throw new Error('market_data_unavailable');
      const broker = data.live_broker || {};
      const quote = broker.quote || {};
      const liveAgeReported = Number(quote.age_seconds);
      const quoteAge = ageOf(quote.observed_at);
      const live = broker.state === 'BROKER_LIVE'
        && Number.isFinite(liveAgeReported) && liveAgeReported >= 0
        && liveAgeReported <= MAX_BROKER_AGE_SECONDS
        && quoteAge !== null && quoteAge <= MAX_BROKER_AGE_SECONDS
        && Number.isFinite(Number(quote.mid)) && Number(quote.mid) > 0
        && Number(quote.bid) > 0 && Number(quote.ask) >= Number(quote.bid);
      const spot = data.feed?.gold_spot || {};
      const referenceAge = ageOf(spot.market_time);
      const indicative = !live
        && Number.isFinite(Number(spot.price)) && Number(spot.price) > 0
        && referenceAge !== null && referenceAge <= MAX_REFERENCE_AGE_SECONDS
        && String(spot.quote_type||'') !== 'broker_live_read_only';
      ids.permission.textContent = 'WAIT · 0R';
      ids.broker.textContent = live ? 'READ-ONLY CONNECTED' : 'AWAITING FRESH TICK';
      if (live) {
        state.className = 'pgr-state pgr-live';
        state.textContent = 'BROKER LIVE · READ ONLY';
        detail.textContent = 'Fresh authenticated MT5 market data. Machine order submission remains OFF.';
        ids.price.textContent = fmt(quote.mid);
        ids.mode.textContent = 'LIVE MT5 BID / ASK';
        ids.source.textContent = 'MT5 BROKER';
        ids.age.textContent = Math.round(Math.max(liveAgeReported,quoteAge))+'s';
      } else if (indicative) {
        state.className = 'pgr-state pgr-indicative';
        state.textContent = 'INDICATIVE · NOT BROKER LIVE';
        detail.textContent = 'Public spot reference only. The authenticated MT5 XAUUSD feed has no fresh tick. Do not use as an execution quote.';
        ids.price.textContent = fmt(spot.price);
        ids.mode.textContent = 'INDICATIVE SPOT';
        ids.source.textContent = String(spot.source || 'PUBLIC MARKET SOURCE').slice(0,64);
        ids.age.textContent = Math.ceil(referenceAge)+'s';
      } else {
        unavailable('No fresh verified broker tick or current timestamped spot reference. Prices are withheld.');
      }
      lastOk = Date.now();
      panel.dataset.checkedAt = new Date(lastOk).toISOString();
    } catch {
      unavailable('Feed connection failed. Earlier quotes are not treated as current. Retry is automatic when this page is visible.');
    } finally {
      busy = false;
    }
  }
  void refresh();
  const every = surface === 'gold-live' ? 5000 : 15000;
  const timer = window.setInterval(() => {
    if (!document.hidden) void refresh();
  }, every);
  document.addEventListener('visibilitychange',()=>{
    if (!document.hidden && Date.now()-lastOk > 3000) void refresh();
  });
  window.addEventListener('pagehide',()=>window.clearInterval(timer),{once:true});
}
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',setup,{once:true});
else setup();
