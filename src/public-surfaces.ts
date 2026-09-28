import './styles.css';

const SUPABASE = 'https://mpcelmjiycjpdyyflisn.supabase.co';
const KEY = 'sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';
const FUNCTIONS = `${SUPABASE}/functions/v1`;

type AnyJson = Record<string, any>;

async function read(path: string, timeout = 6500): Promise<AnyJson> {
  try {
    const response = await fetch(`${FUNCTIONS}/${path}`, {
      headers: { apikey: KEY, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeout),
    });
    return await response.json().catch(() => ({}));
  } catch {
    return { ok: false, state: 'UNAVAILABLE', error: 'transport_unavailable' };
  }
}

function byId(id: string) {
  return document.getElementById(id);
}

function set(id: string, value: unknown) {
  const element = byId(id);
  if (!element) return;
  const text =
    value === null || value === undefined || value === ''
      ? 'WITHHELD'
      : String(value);
  element.textContent = text;
  element.classList.toggle('state-good', /READY|AVAILABLE|ONLINE|OPEN|CONFIRMED|CLEAR/i.test(text));
  element.classList.toggle('state-warn', /WAIT|CLOSED|WITHHELD|CHECK|DEGRADED|BUILDING|FROZEN/i.test(text));
  element.classList.toggle('state-bad', /UNAVAILABLE|INCIDENT|FAIL|ERROR|BLOCK/i.test(text));
}

function first<T>(...values: T[]) {
  return values.find((value) => value !== null && value !== undefined && value !== '');
}

function reportSummary(report: AnyJson) {
  const payload = report?.report || report?.latest_report || report?.data || null;
  if (!payload) {
    return {
      state: report?.state || report?.performance_state || 'EVIDENCE_STORE_UNAVAILABLE',
      title: 'Publication evidence unavailable',
      copy: 'The immutable report store is not readable right now. No publication is inferred from an empty response.',
      meta: report?.generated_at || 'Evidence withheld',
    };
  }
  return {
    state: report?.state || 'AVAILABLE',
    title: first(payload?.title, payload?.headline, payload?.name, 'Latest governed publication'),
    copy: first(payload?.executive_summary, payload?.summary, payload?.what_changed, payload?.brief, 'Publication available.'),
    meta: first(payload?.published_at, payload?.generated_at, report?.generated_at, 'Governed snapshot'),
  };
}

async function loadIntelligence() {
  const [vertical, markets, trends, nigeria] = await Promise.all([
    read('public-vertical-status', 3500),
    read('latest-global-markets', 3500),
    read('latest-global-trends', 3500),
    read('latest-nigeria-economy', 3500),
  ]);
  const evidence = vertical?.state || markets?.state || trends?.state || nigeria?.state || 'UNKNOWN';
  const verticals = Array.isArray(vertical?.verticals) ? vertical.verticals : [];
  set('intel-state', vertical?.state || 'CHECK');
  set('intel-evidence', evidence);
  set('intel-count', vertical?.report_count ?? vertical?.count ?? null);
  set('intel-time', new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const marketLane = verticals.find((x: AnyJson) => x?.id === 'global_markets');
  const trendLane = verticals.find((x: AnyJson) => x?.id === 'global_trends');
  const nigeriaLane = verticals.find((x: AnyJson) => x?.id === 'nigeria_economy');
  set('markets-report-state', marketLane?.status || markets?.state || 'UNKNOWN');
  set('trends-report-state', trendLane?.status || trends?.state || 'UNKNOWN');
  set('africa-report-state', nigeriaLane?.status || nigeria?.state || 'NIGERIA_DEEP_FOCUS_ONLY');
  for (const [prefix, data] of [['gm', markets], ['gt', trends], ['ng', nigeria]] as const) {
    const summary = reportSummary(data);
    set(`${prefix}-title`, summary.title);
    set(`${prefix}-copy`, summary.copy);
    set(`${prefix}-meta`, `${summary.state} · ${summary.meta}`);
  }
}

function assetList(markets: AnyJson) {
  const direct = markets?.assets || markets?.markets || markets?.data?.assets || [];
  return Array.isArray(direct) ? direct : [];
}

function marketStatus(markets: AnyJson) {
  return first(markets?.market_status, markets?.state, markets?.status, 'UNKNOWN');
}

async function loadLiveMarkets() {
  const [markets, core, integrity, evidence] = await Promise.all([
    read('public-live-markets-api', 4500),
    read('public-v63-structural-core-fabric', 5000),
    read('public-v56-signal-integrity-shield', 5000),
    read('public-v65-model-evidence-fabric', 5000),
  ]);
  set('market-status', marketStatus(markets));
  set('market-regime', first(markets?.regime, markets?.market_regime, markets?.state, 'UNKNOWN'));
  const gold = assetList(markets).find((x: AnyJson) => /gold|xau/i.test(String(x?.key || x?.symbol || x?.label || ''))) || markets?.gold || {};
  set('gold-action', first(gold?.action, markets?.decision?.action, core?.gold?.action, 'WAIT'));
  set('gold-capital', first(gold?.capital_permission, markets?.decision?.capital_permission, core?.gold?.capital_permission, '0R'));
  set('structure-state', first(core?.structure_signals?.market_status, core?.market_status, core?.state, 'UNKNOWN'));
  set('structure-copy', first(core?.decision_compression?.what_matters_now, core?.interpretation, 'Structural context remains conditional.'));
  const goldIntegrity = integrity?.signal_integrity_board?.assets?.find?.((x: AnyJson) => /gold|xau/i.test(String(x?.key || x?.label || '')));
  set('integrity-state', first(goldIntegrity?.false_breakout?.state, goldIntegrity?.lifecycle_stage, integrity?.state, 'UNKNOWN'));
  set('integrity-copy', first(goldIntegrity?.false_breakout?.reason, integrity?.decision_compression?.what_matters_now, 'Signal integrity is evidence-gated.'));
  set('market-evidence', first(evidence?.calibration?.performance_state, evidence?.performance_state, 'UNKNOWN'));

  const grid = byId('asset-grid');
  if (!grid) return;
  const assets = assetList(markets);
  if (!assets.length) {
    grid.innerHTML = '<div class="empty-state">Live asset rows are unavailable. Structural context remains research-only and Gold stays WAIT · 0R.</div>';
    return;
  }
  grid.innerHTML = assets.map((asset: AnyJson) => {
    const name = first(asset?.label, asset?.symbol, asset?.key, 'Asset');
    const state = first(asset?.state, asset?.market_status, 'UNKNOWN');
    const price = first(asset?.price, asset?.last, asset?.quote?.price, null);
    const permission = first(asset?.capital_permission, /gold|xau/i.test(String(name)) ? '0R' : 'NOT_GRANTED');
    return `<article class="asset-card"><span>${String(name)}</span><strong>${price == null ? 'WITHHELD' : String(price)}</strong><small>${String(state)} · ${String(permission)}</small></article>`;
  }).join('');
}

async function loadGold() {
  const [gold, core, evidence] = await Promise.all([
    read('public-gold-live-api', 4500),
    read('public-v63-structural-core-fabric', 5000),
    read('public-v65-model-evidence-fabric', 5000),
  ]);
  const market = first(gold?.market_status, gold?.state, 'UNKNOWN');
  const action = first(gold?.action, gold?.decision?.action, core?.gold?.action, 'WAIT');
  const capital = first(gold?.capital_permission, gold?.decision?.capital_permission, core?.gold?.capital_permission, '0R');
  const price = market === 'UNAVAILABLE' ? null : first(gold?.price, gold?.quote?.price, gold?.last, null);
  const evidenceState = first(evidence?.calibration?.performance_state, evidence?.performance_state, 'UNKNOWN');
  set('gold-live-state', first(gold?.engine, gold?.state, market));
  set('gold-live-copy', market === 'MARKET_CLOSED'
    ? 'The governed Gold session is closed. Structural context is frozen until reopening.'
    : market === 'UNAVAILABLE'
      ? 'The live Gold market spine is unavailable. No structural price is promoted to a live execution quote.'
      : 'Gold market state is live, but capital permission remains independently governed.');
  set('gold-live-action', action);
  set('gold-live-capital', capital);
  set('gold-market', market);
  set('gold-price', price);
  set('gold-evidence', evidenceState);
  set('gold-confidence', evidenceState === 'EVIDENCE_STORE_UNAVAILABLE' ? null : first(gold?.confidence, evidence?.gold?.confidence, null));
  set('gold-structure', first(core?.structure_signals?.market_status, core?.market_status, 'UNKNOWN'));
  set('gold-structure-copy', first(core?.decision_compression?.what_matters_now, core?.interpretation, 'Structural context is conditional.'));
  set('gold-model', evidenceState);
  set('gold-model-copy', evidenceState === 'EVIDENCE_STORE_UNAVAILABLE'
    ? 'Probability, EV, MFE/MAE and signal reputation are withheld until immutable evidence is readable.'
    : 'Observed model evidence is available subject to its sample and calibration gates.');
  set('gold-firewall', `${action} · ${capital}`);
}

async function loadVisualLab() {
  const [core, integrity, mission] = await Promise.all([
    read('public-v63-structural-core-fabric', 5000),
    read('public-v56-signal-integrity-shield', 5000),
    read('public-v54-resilient-mission-control', 5000),
  ]);
  const market = first(core?.structure_signals?.market_status, core?.market_status, mission?.market_status, 'UNKNOWN');
  const gold = mission?.assets?.find?.((x: AnyJson) => /gold|xau/i.test(String(x?.key || x?.label || ''))) || mission?.gold || {};
  const goldIntegrity = integrity?.signal_integrity_board?.assets?.find?.((x: AnyJson) => /gold|xau/i.test(String(x?.key || x?.label || '')));
  set('lab-status', market);
  set('lab-session', first(core?.session?.overlap_state, core?.session_state?.overlap_state, market === 'MARKET_CLOSED' ? 'MARKET_CLOSED' : 'UNKNOWN'));
  set('lab-structure', market);
  set('lab-integrity', first(goldIntegrity?.lifecycle_stage, goldIntegrity?.false_breakout?.state, 'UNKNOWN'));
  set('lab-permission', `${first(gold?.action, 'WAIT')} · ${first(gold?.capital_permission, '0R')}`);
  set('lab-adventure', market === 'MARKET_CLOSED'
    ? 'The journey is frozen at the last valid session state. No new “battle” or “breakout” animation is inferred while the market is closed.'
    : 'Base Camp → Structure → Liquidity → Confirmation → Permission.');
  set('lab-institutional', first(core?.decision_compression?.what_matters_now, 'Market state, structural context and evidence maturity resolve from the same governed core.'));

  const stage = byId('lab-stage');
  if (stage && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    stage.addEventListener('pointermove', (event) => {
      const e = event as PointerEvent;
      const rect = stage.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      stage.style.setProperty('--lab-rx', `${(-y * 5).toFixed(2)}deg`);
      stage.style.setProperty('--lab-ry', `${(x * 7).toFixed(2)}deg`);
    });
    stage.addEventListener('pointerleave', () => {
      stage.style.setProperty('--lab-rx', '0deg');
      stage.style.setProperty('--lab-ry', '0deg');
    });
  }
}

const surface = document.body.dataset.surface;
if (surface === 'intelligence') void loadIntelligence();
if (surface === 'live-markets') void loadLiveMarkets();
if (surface === 'gold-live') void loadGold();
if (surface === 'visual-lab') void loadVisualLab();