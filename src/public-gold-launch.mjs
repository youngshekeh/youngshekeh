import './public-gold-launch.css';
import {goldDisplay} from './public-gold-display.mjs';
import {researchFetch as fetch} from './research-connection.mjs';

// Public research surface. It cannot submit trades, elevate permission or infer a live quote.
const GOLD_ENDPOINT = '/api/public-gold-read';
const fmt = (value) => Number.isFinite(Number(value)) && Number(value) > 0
  ? '$' + Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : 'WITHHELD';
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
  const referencePanel = document.getElementById('public-market-reference');
  (referencePanel || heading).insertAdjacentElement('afterend',panel);
  let busy = false;
  let lastOk = 0;
  let latest = null;
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
  function paint(){
    const value=goldDisplay(latest);
    ids.permission.textContent='WAIT · 0R';
    if(value.mode==='UNAVAILABLE'){unavailable('No current timestamped broker quote or independent Gold reference. Earlier prices are cleared.');return;}
    const live=value.mode==='BROKER_LIVE_READ_ONLY';
    state.className=live?'pgr-state pgr-live':'pgr-state pgr-indicative';
    state.textContent=live?'BROKER LIVE · READ ONLY':'INDICATIVE · NOT BROKER LIVE';
    detail.textContent=live?'Fresh authenticated MT5 market data. Machine order submission remains OFF.':'Fresh public Gold reference, independent of the database. MT5 broker data is not verified. This is not an execution quote.';
    ids.price.textContent=fmt(value.price);ids.mode.textContent=live?'LIVE MT5 BID / ASK':'INDICATIVE SPOT';
    ids.source.textContent=value.source;ids.age.textContent=Math.ceil(value.age_seconds)+'s';
    ids.broker.textContent=live?'READ-ONLY CONNECTED':'AWAITING FRESH TICK';
  }
  async function refresh() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const response = await fetch(GOLD_ENDPOINT,{
        headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(7500)
      });
      if (!response.ok) throw new Error('quote_source_unavailable');
      const data = await response.json();
      if (!data || data.ok !== true || typeof data !== 'object') throw new Error('market_data_unavailable');
      latest = data;
      paint();
      lastOk = Date.now();
      panel.dataset.checkedAt = new Date(lastOk).toISOString();
    } catch {
      latest=null;
      unavailable('Feed connection failed. Earlier quotes are not treated as current. Retry is automatic when this page is visible.');
    } finally {
      busy = false;
    }
  }
  void refresh();
  const every = surface === 'gold-live' ? 5000 : 15000;
  const expiryTimer=window.setInterval(paint,1000);
  const timer = window.setInterval(() => {
    if (!document.hidden) void refresh();
  }, every);
  document.addEventListener('visibilitychange',()=>{
    if (!document.hidden && Date.now()-lastOk > 3000) void refresh();
  });
  window.addEventListener('pagehide',()=>{window.clearInterval(timer);window.clearInterval(expiryTimer);},{once:true});
}
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',setup,{once:true});
else setup();
