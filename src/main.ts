import './styles.css';
import './autonomous.css';
import './mission.css';

const cleanRoute = new Set(['/access', '/member', '/owner', '/status']);
if (cleanRoute.has(window.location.pathname)) {
  window.location.replace(`${window.location.pathname}/${window.location.search}${window.location.hash}`);
}

document.documentElement.classList.add('js');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(pointer: fine)');
const parallax = document.querySelector<HTMLElement>('[data-parallax]');

let raf = 0;

function resetParallax() {
  if (!parallax) return;
  parallax.style.setProperty('--rx', '0deg');
  parallax.style.setProperty('--ry', '0deg');
}

function onPointerMove(event: PointerEvent) {
  if (!parallax || reducedMotion.matches || !finePointer.matches) return;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    const rect = parallax.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    parallax.style.setProperty('--rx', `${(-y * 6).toFixed(2)}deg`);
    parallax.style.setProperty('--ry', `${(x * 8).toFixed(2)}deg`);
  });
}

parallax?.addEventListener('pointermove', onPointerMove);
parallax?.addEventListener('pointerleave', resetParallax);
reducedMotion.addEventListener('change', resetParallax);

const reveals = document.querySelectorAll<HTMLElement>('[data-reveal]');

if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
  );

  reveals.forEach((element) => observer.observe(element));
} else {
  reveals.forEach((element) => element.classList.add('is-visible'));
}

const year = document.querySelector<HTMLElement>('#copyright-year');
if (year) year.textContent = ` © ${new Date().getFullYear()} THE FATHER ANALYTICS.`;

function setAutonomyText(id: string, value: unknown) {
  const node = document.querySelector<HTMLElement>(`#${id}`);
  if (node) node.textContent = String(value ?? 'UNAVAILABLE');
}

function renderTags(id: string, values: unknown[]) {
  const node = document.querySelector<HTMLElement>(`#${id}`);
  if (!node) return;
  node.replaceChildren();
  const list = Array.isArray(values) && values.length ? values : ['NONE'];
  for (const value of list) {
    const tag = document.createElement('span');
    tag.textContent = String(value).replaceAll('_', ' ');
    node.appendChild(tag);
  }
}

async function loadAutonomousState() {
  const modeNode = document.querySelector<HTMLElement>('#autonomyMode');
  if (!modeNode) return;
  try {
    const response = await fetch('/api/autonomous-state', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`autonomy_http_${response.status}`);
    const state = await response.json();
    const health = state?.health ?? {};
    const governance = state?.governance ?? {};
    const connectors = health?.connectors ?? {};
    const generated = state?.generated_at ? new Date(state.generated_at) : null;
    const regimeMemory = state?.cross_asset_regime_memory ?? null;

    setAutonomyText('autonomyMode', state?.mode ?? 'UNAVAILABLE');
    setAutonomyText('autonomyScore', Number.isFinite(Number(state?.system_score)) ? `${state.system_score}/100` : '--');
    setAutonomyText('autonomyDatabase', health?.database ?? 'UNAVAILABLE');
    setAutonomyText('autonomyEdge', health?.edge_runtime ?? 'UNAVAILABLE');
    setAutonomyText('autonomyEvidence', health?.evidence ?? 'UNAVAILABLE');
    setAutonomyText('autonomyConnectors', `${connectors?.healthy ?? 0}/${connectors?.required ?? 0} required connectors fresh`);
    setAutonomyText('autonomyMarket', state?.market_session ?? 'UNAVAILABLE');
    setAutonomyText('autonomyPermission', `${governance?.action_permitted ?? 'WAIT'} · ${governance?.capital_permission ?? '0R'}`);
    const memoryLabel = regimeMemory?.confirmed_pattern
      ? `CONFIRMED ${String(regimeMemory.confirmed_pattern).replaceAll('_', ' ')}`
      : regimeMemory?.candidate_pattern
        ? `CANDIDATE ${String(regimeMemory.candidate_pattern).replaceAll('_', ' ')} ×${regimeMemory.candidate_count ?? 1}`
        : String(regimeMemory?.state ?? 'DB-GATED').replaceAll('_', ' ');
    setAutonomyText('marketMemoryState', memoryLabel);
    setAutonomyText('autonomyUpdated', generated && !Number.isNaN(generated.getTime()) ? `Governed state · ${generated.toLocaleString()}` : 'Governed state unavailable');
    renderTags('autonomyBlockers', state?.blockers ?? []);
    renderTags('autonomyActions', state?.autonomous_actions ?? []);
    const stack = state?.autonomous_stack ?? {};
    setAutonomyText('stackV70', stack?.v70?.state ?? state?.mode ?? 'UNAVAILABLE');
    setAutonomyText('stackV71', stack?.v71?.state ?? 'WITHHELD');
    setAutonomyText('stackV72', stack?.v72?.state ?? 'WITHHELD');
    setAutonomyText('stackV73', stack?.v73?.state ?? 'LOCKED');
    setAutonomyText('autonomyScoreLabel', state?.mode === 'VERCEL_SURVIVOR_NODE' ? 'SURVIVOR SCORE' : 'SYSTEM SCORE');
    const test = state?.survivor_test;
    const shadow = state?.shadow_market?.signal;
    if (test) {
      setAutonomyText('autonomyTest', `${test.passed ? 'PASS' : 'HOLD'} · ${test.test_id ?? 'V70'}`);
      setAutonomyText('autonomyTestDetail', `${test.route_health ?? 'routes n/a'} · ${test.market_feeds ?? 'feeds n/a'} · core fresh ${test.core_fresh_feeds ?? 'n/a'} · age ${test.core_quote_age_minutes ?? 'n/a'}m · shadow ${shadow?.state ?? 'WITHHELD'}`);
    } else {
      setAutonomyText('autonomyTest', 'CANONICAL MODE');
      setAutonomyText('autonomyTestDetail', 'The canonical database state channel is available.');
    }
    if (state?.mode) modeNode.dataset.state = String(state.mode);
  } catch {
    setAutonomyText('autonomyMode', 'DATABASE STATE UNAVAILABLE');
    setAutonomyText('autonomyUpdated', 'The public state channel could not be verified.');
    renderTags('autonomyBlockers', ['PUBLIC_STATE_CHANNEL_UNAVAILABLE']);
    renderTags('autonomyActions', ['FAIL_CLOSED']);
    setAutonomyText('autonomyPermission', 'WAIT · 0R');
  }
}

void loadAutonomousState();
window.setInterval(() => void loadAutonomousState(), 300_000);


type MissionDesk = { name?: string; state?: string; detail?: string; href?: string };
type MissionEngine = { name?: string; state?: string; detail?: string };
type MarketAsset = { id?: string; name?: string; symbol?: string; ok?: boolean; price?: number | null; change_pct?: number | null; direction?: string; freshness?: string; age_minutes?: number | null; observed_at?: string | null };

function missionText(id: string, value: unknown) {
  const node = document.querySelector<HTMLElement>(`#${id}`);
  if (node) node.textContent = String(value ?? 'WITHHELD').replaceAll('_', ' ');
}

function renderMissionTape(items: Array<{label?: string; value?: string}>) {
  const tape = document.querySelector<HTMLElement>('#missionTape');
  if (!tape || !Array.isArray(items) || !items.length) return;
  const doubled = [...items, ...items];
  tape.replaceChildren();
  for (const item of doubled) {
    const span = document.createElement('span');
    const bold = document.createElement('b');
    bold.textContent = String(item.label ?? 'STATE');
    span.append(bold, document.createTextNode(` ${String(item.value ?? 'WITHHELD').replaceAll('_', ' ')}`));
    tape.appendChild(span);
  }
}


function renderGlobalMarkets(dashboard: { assets?: MarketAsset[]; breadth?: any } | undefined) {
  const grid = document.querySelector<HTMLElement>('#marketTileGrid');
  const assets = Array.isArray(dashboard?.assets) ? dashboard?.assets ?? [] : [];
  const breadth = dashboard?.breadth ?? {};
  if (grid && assets.length) {
    grid.replaceChildren();
    for (const asset of assets) {
      const card = document.createElement('article');
      card.className = 'market-tile';
      const top = document.createElement('div');
      const name = document.createElement('span');
      const fresh = document.createElement('i');
      name.textContent = asset.name || asset.symbol || 'MARKET';
      fresh.textContent = String(asset.freshness || 'UNAVAILABLE').replaceAll('_', ' ');
      fresh.dataset.freshness = String(asset.freshness || '');
      top.append(name, fresh);
      const price = document.createElement('strong');
      price.textContent = typeof asset.price === 'number' ? asset.price.toLocaleString(undefined, { maximumFractionDigits: 4 }) : 'WITHHELD';
      const move = document.createElement('em');
      const pct = typeof asset.change_pct === 'number' ? asset.change_pct : null;
      move.textContent = pct === null ? 'change unavailable' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% · ${String(asset.direction || 'MIXED').replaceAll('_', ' ')}`;
      move.dataset.direction = String(asset.direction || '');
      const meta = document.createElement('small');
      meta.textContent = asset.freshness === 'MARKET_CLOSED_OR_STALE'
        ? `Market closed / last verified ${Math.round(Number(asset.age_minutes || 0) / 60)}h ago`
        : `Verified ${asset.age_minutes ?? 'n/a'}m ago`;
      card.append(top, price, move, meta);
      grid.appendChild(card);
    }
  }
  missionText('marketPattern', breadth?.state ?? 'WITHHELD');
  missionText('marketBreadth', `Breadth ${breadth?.breadth_score ?? 'n/a'} · ${breadth?.up ?? 0} up / ${breadth?.down ?? 0} down / ${breadth?.flat ?? 0} flat`);
  missionText('marketUsdState', `USD ${breadth?.usd_state ?? 'MIXED'}`);
  missionText('marketRiskState', `RISK ${breadth?.risk_state ?? 'MIXED'}`);
  missionText('marketUsable', `${breadth?.usable_assets ?? 0}/7`);
}

function renderDesks(desks: MissionDesk[]) {
  const grid = document.querySelector<HTMLElement>('#sixDeskGrid');
  if (!grid || !Array.isArray(desks)) return;
  grid.replaceChildren();
  desks.forEach((desk, index) => {
    const card = document.createElement('a');
    card.className = 'desk-card';
    card.href = desk.href || '#';
    card.innerHTML = `<span>${String(index + 1).padStart(2, '0')}</span><h3></h3><strong></strong><p></p><i>OPEN DESK ↗</i>`;
    const h = card.querySelector('h3');
    const s = card.querySelector('strong');
    const p = card.querySelector('p');
    if (h) h.textContent = desk.name || 'INTELLIGENCE DESK';
    if (s) {
      s.textContent = String(desk.state || 'WITHHELD').replaceAll('_', ' ');
      s.dataset.state = String(desk.state || '');
    }
    if (p) p.textContent = desk.detail || 'Evidence-gated intelligence';
    grid.appendChild(card);
  });
}

function renderEngines(engines: MissionEngine[]) {
  const grid = document.querySelector<HTMLElement>('#engineGrid');
  if (!grid || !Array.isArray(engines)) return;
  grid.replaceChildren();
  engines.forEach((engine) => {
    const chip = document.createElement('div');
    chip.className = 'engine-chip';
    const name = document.createElement('b');
    const state = document.createElement('span');
    const detail = document.createElement('small');
    name.textContent = engine.name || 'ENGINE';
    state.textContent = String(engine.state || 'WITHHELD').replaceAll('_', ' ');
    state.dataset.state = String(engine.state || '');
    detail.textContent = engine.detail || '';
    chip.append(name, state, detail);
    grid.appendChild(chip);
  });
  missionText('engineCount', `${engines.length} ENGINES`);
}

async function loadMissionBrief() {
  try {
    const response = await fetch('/api/mission-brief', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`mission_http_${response.status}`);
    const brief = await response.json();
    const changed = brief?.what_changed ?? {};
    const calibration = brief?.calibration ?? {};
    const generated = brief?.generated_at ? new Date(brief.generated_at) : null;

    missionText('briefHeadline', changed?.headline ?? 'Governed intelligence brief unavailable.');
    missionText('briefMatter', changed?.confluence_tension ?? 'Evidence remains gated until verified.');
    missionText('briefQuality', changed?.data_quality ?? 'WITHHELD');
    missionText('briefQA', changed?.qa_score ?? 'WITHHELD');
    missionText('briefPhase', changed?.phase ?? 'WITHHELD');
    missionText('briefTimestamp', generated && !Number.isNaN(generated.getTime()) ? generated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'WITHHELD');

    renderMissionTape(brief?.command_tape ?? []);
    renderGlobalMarkets(brief?.global_market_dashboard);
    renderDesks(brief?.six_desks ?? []);
    renderEngines(brief?.engine_registry ?? []);

    missionText('calibrationAccuracy', calibration?.public_accuracy ?? 'WITHHELD');
    missionText('calibrationReason', calibration?.reason ?? 'Empirical sample threshold not met.');
    missionText('calibrationQA', calibration?.qa_score ?? '--');
  } catch {
    missionText('briefHeadline', 'Mission brief unavailable. The UI is failing closed.');
    missionText('briefMatter', 'No live intelligence is promoted while the mission brief cannot be verified.');
    missionText('briefQuality', 'WITHHELD');
    missionText('briefQA', 'WITHHELD');
    missionText('briefPhase', 'WITHHELD');
  }
}

void loadMissionBrief();
window.setInterval(() => void loadMissionBrief(), 60_000);
