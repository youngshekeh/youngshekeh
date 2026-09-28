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


function renderClosedLoopLearning(stack: any) {
  if (!stack?.ok) {
    const state = String(stack?.state ?? 'DB_GATED_SURVIVOR_MODE').replaceAll('_',' ');
    missionText('learningLoopStatus', state);
    missionText('learningV96State', 'DB-GATED');
    missionText('learningV97State', 'DB-GATED');
    missionText('learningV98State', 'WITHHELD');
    missionText('learningV99State', '0R · DB-GATED');
    missionText('learningV86State', 'BLOCKED · 0R');
    missionText('learningV96Detail', 'Internal attribution continues database-side; public bridge is restricted.');
    missionText('learningV97Detail', 'Internal latency-cost calibration continues database-side; broker costs remain unavailable.');
    missionText('learningV98Detail', 'Scenario EV proxy remains unpublished while evidence is not publicly verifiable.');
    missionText('learningV99Detail', 'Risk readiness remains fail-closed while the governed database bridge is restricted.');
    missionText('learningV86Detail', 'Capital permission remains 0R. Public runtime restrictions cannot be bypassed.');
    return;
  }

  const v96 = stack?.forecast_error_attribution ?? {};
  const v97 = stack?.execution_quality ?? {};
  const v98 = stack?.scenario_ev_proxy ?? {};
  const v99 = stack?.portfolio_risk_readiness ?? {};
  const v86 = stack?.capital_firewall ?? {};
  const h60 = Array.isArray(v96?.horizons) ? v96.horizons.find((x: any) => Number(x?.horizon_minutes) === 60) : null;
  const h120 = Array.isArray(v96?.horizons) ? v96.horizons.find((x: any) => Number(x?.horizon_minutes) === 120) : null;
  const d5 = Array.isArray(v97?.delays) ? v97.delays.find((x: any) => Number(x?.delay_minutes) === 5) : null;
  const ev60 = Array.isArray(v98?.horizons) ? v98.horizons.find((x: any) => Number(x?.horizon_minutes) === 60) : null;

  missionText('learningLoopStatus', 'LIVE GOVERNED LOOP');
  missionText('learningV96State', h60 ? `${h60.calibration_state?.replaceAll?.('_',' ') ?? 'EARLY SAMPLE'}` : 'WITHHELD');
  missionText('learningV96Detail', h60
    ? `60m n=${h60.nonflat_sample ?? 0}/20 · timing recovered ${h60.timing_recovered ?? 0} · directional failures ${h60.directional_failures ?? 0} · 120m n=${h120?.nonflat_sample ?? 0}/20`
    : 'Forecast attribution unavailable.');
  missionText('learningV97State', d5 ? String(d5.calibration_state ?? 'EARLY SAMPLE').replaceAll('_',' ') : 'WITHHELD');
  missionText('learningV97Detail', d5
    ? `5m latency n=${d5.sample_size ?? 0}/30 · avg shortfall ${d5.avg_signed_shortfall_bps ?? 'n/a'} bp · P75 adverse ${d5.p75_adverse_cost_bps ?? 'n/a'} bp`
    : 'Execution latency calibration unavailable.');
  missionText('learningV98State', ev60 ? String(ev60.publication_state ?? 'WITHHELD').replaceAll('_',' ') : 'WITHHELD');
  missionText('learningV98Detail', ev60
    ? `60m forecast n=${ev60.nonflat_sample ?? 0}/20 · execution n=${ev60.execution_sample ?? 0}/30 · research edge proxy remains non-PnL`
    : 'Scenario EV proxy unavailable.');
  missionText('learningV99State', String(v99?.state ?? '0R').replaceAll('_',' '));
  missionText('learningV99Detail', `Single-asset human review eligible: ${v99?.single_asset_human_review_eligible ? 'YES' : 'NO'} · multi-asset portfolio ready: ${v99?.multi_asset_portfolio_ready ? 'YES' : 'NO'}`);
  missionText('learningV86State', `${String(v86?.state ?? 'BLOCKED').replaceAll('_',' ')} · ${v86?.capital_permission ?? '0R'}`);
  missionText('learningV86Detail', `Human approval required: ${v86?.human_approval_required === false ? 'NO' : 'YES'} · automatic risk increase: ${v86?.automatic_risk_increase ? 'ON' : 'OFF'}`);
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
    const learningStack = state?.closed_loop_learning ?? null;

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
    renderClosedLoopLearning(learningStack);
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
    renderClosedLoopLearning({ ok:false, state:'PUBLIC_STATE_CHANNEL_UNAVAILABLE' });
  }
}

void loadAutonomousState();
window.setInterval(() => void loadAutonomousState(), 300_000);


type MissionDesk = { id?: string; name?: string; state?: string; detail?: string; href?: string };
type MissionEngine = { name?: string; state?: string; detail?: string };
type MarketAsset = { id?: string; name?: string; symbol?: string; ok?: boolean; price?: number | null; change_pct?: number | null; direction?: string; freshness?: string; age_minutes?: number | null; observed_at?: string | null };
type MacroMetric = { ok?: boolean; label?: string; country?: string; period?: string; value?: number | null; source?: string; source_last_updated?: string | null; frequency?: string };
type ResearchActivity = { ok?: boolean; label?: string; category?: string; count?: number | null; window_days?: number; window_start?: string; window_end?: string; source?: string; truth_label?: string };

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


function updateMissionTapeItem(label: string, value: string) {
  const tape = document.querySelector<HTMLElement>('#missionTape');
  if (!tape) return;
  for (const span of Array.from(tape.querySelectorAll<HTMLElement>('span'))) {
    const bold = span.querySelector<HTMLElement>('b');
    if (bold?.textContent === label) {
      span.replaceChildren();
      const nextBold = document.createElement('b');
      nextBold.textContent = label;
      span.append(nextBold, document.createTextNode(` ${value}`));
    }
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





function renderSeasonality(pulse: any) {
  const month=pulse?.month ?? {},quarter=pulse?.quarter ?? {};
  const pct=(v: unknown) => typeof v==='number'?`${v>=0?'+':''}${v.toFixed(2)}%`:'WITHHELD';
  const rate=(v: unknown,n: unknown) => typeof v==='number'?`${v.toFixed(1)}% · n=${n ?? '?'}`:'WITHHELD';
  missionText('seasonWindow', pulse?.ok ? `${month.label ?? 'Month'} · ${quarter.label ?? 'Quarter'} · as of ${pulse.as_of ?? 'n/a'}` : 'WITHHELD');
  missionText('seasonMonthLabel', month?.label ?? 'MONTH');
  missionText('seasonMonthState', String(month?.state ?? 'WITHHELD').replaceAll('_',' '));
  missionText('seasonMonthPositive', rate(month?.positive_rate_pct,month?.sample_size));
  missionText('seasonMonthMedian', pct(month?.median_return_pct));
  missionText('seasonMonthCurrent', pct(month?.current_return_pct));
  missionText('seasonMonthPercentile', typeof month?.current_percentile==='number'?`P${month.current_percentile.toFixed(1)}`:'WITHHELD');
  missionText('seasonMonthRange', typeof month?.q25_return_pct==='number'&&typeof month?.q75_return_pct==='number'
    ?`Middle 50%: ${pct(month.q25_return_pct)} to ${pct(month.q75_return_pct)} · best ${pct(month.best_return_pct)} · worst ${pct(month.worst_return_pct)}`
    :'Historical quartile range unavailable.');
  missionText('seasonQuarterLabel', quarter?.label ?? 'QUARTER');
  missionText('seasonQuarterState', String(quarter?.state ?? 'WITHHELD').replaceAll('_',' '));
  missionText('seasonQuarterPositive', rate(quarter?.positive_rate_pct,quarter?.sample_size));
  missionText('seasonQuarterMedian', pct(quarter?.median_return_pct));
  missionText('seasonQuarterCurrent', pct(quarter?.current_return_pct));
  missionText('seasonQuarterPercentile', typeof quarter?.current_percentile==='number'?`P${quarter.current_percentile.toFixed(1)}`:'WITHHELD');
  missionText('seasonQuarterRange', typeof quarter?.q25_return_pct==='number'&&typeof quarter?.q75_return_pct==='number'
    ?`Middle 50%: ${pct(quarter.q25_return_pct)} to ${pct(quarter.q75_return_pct)} · best ${pct(quarter.best_return_pct)} · worst ${pct(quarter.worst_return_pct)}`
    :'Historical quartile range unavailable.');
}

function renderVolatility(pulse: any) {
  const x = pulse?.indices ?? {};
  const show = (prefix: string, item: any) => {
    missionText(`${prefix}Value`, typeof item?.value === 'number' ? item.value.toFixed(2) : 'WITHHELD');
    missionText(`${prefix}Regime`, item?.ok ? `${String(item.regime ?? 'WITHHELD').replaceAll('_',' ')} · P${item.trailing_252_percentile ?? 'n/a'}` : 'WITHHELD');
    missionText(`${prefix}Meta`, item?.ok ? `${item.date} · 1D ${item.change_1d_pct >= 0 ? '+' : ''}${item.change_1d_pct?.toFixed?.(2) ?? 'n/a'}% · 5D ${item.change_5d_pct >= 0 ? '+' : ''}${item.change_5d_pct?.toFixed?.(2) ?? 'n/a'}%` : 'Cboe series unavailable');
  };
  show('gvz', x?.gvz);
  show('vix', x?.vix);
  show('vvix', x?.vvix);
  show('skew', x?.skew);
  missionText('volCompositeState', String(pulse?.composite?.state ?? 'WITHHELD').replaceAll('_',' '));
  const g = pulse?.gold_volatility_scale ?? {};
  missionText('gvzDayScale', typeof g?.one_day_pct === 'number' ? `±${g.one_day_pct.toFixed(2)}%` : 'WITHHELD');
  missionText('gvzWeekScale', typeof g?.one_week_pct === 'number' ? `±${g.one_week_pct.toFixed(2)}%` : 'WITHHELD');
  missionText('gvzDayGold', typeof g?.one_day_gold_price_units === 'number' ? `≈ ±${g.one_day_gold_price_units.toFixed(1)} Gold price units around ${g.reference_gold_price}` : 'Approximate magnitude only');
  missionText('gvzWeekGold', typeof g?.one_week_gold_price_units === 'number' ? `≈ ±${g.one_week_gold_price_units.toFixed(1)} Gold price units around ${g.reference_gold_price}` : 'Approximate magnitude only');
}

function renderRatesFunding(pulse: any) {
  const rates = pulse?.rates ?? {};
  const funding = pulse?.treasury_funding ?? {};
  const latest = funding?.latest ?? null;
  const changes = rates?.daily_change_bps ?? {};
  const pct = (v: unknown) => typeof v === 'number' ? `${v.toFixed(2)}%` : 'WITHHELD';
  const bp = (v: unknown) => typeof v === 'number' ? `${v >= 0 ? '+' : ''}${v.toFixed(1)} bp` : 'WITHHELD';

  missionText('ratesCompositeState', String(pulse?.composite?.state ?? 'WITHHELD').replaceAll('_',' '));
  missionText('rateNominal', pct(rates?.aligned_values?.nominal_10y));
  missionText('rateReal', pct(rates?.aligned_values?.real_10y));
  missionText('rateBreakeven', pct(rates?.aligned_values?.breakeven_10y));
  missionText('rateNominalMeta', rates?.aligned_date ? `${rates.aligned_date} · U.S. Treasury · aligned decomposition date` : 'FRED daily series unavailable');
  missionText('rateRealMeta', rates?.aligned_date ? `${rates.aligned_date} · TIPS real yield · ${String(rates?.state ?? '').replaceAll('_',' ')}` : 'Real yield unavailable');
  missionText('rateBreakevenMeta', rates?.aligned_date ? `${rates.aligned_date} · inflation compensation · decomposition gap ${rates?.decomposition_gap_bps ?? 'n/a'} bp` : 'Breakeven unavailable');

  if (latest) {
    missionText('auctionLatest', `${latest.term} · BTC ${latest.bid_to_cover ?? 'n/a'}`);
    missionText('auctionLatestMeta', `${latest.auction_date} · high yield ${latest.high_yield ?? 'n/a'}% · prior BTC ${latest.prior_bid_to_cover ?? 'n/a'}`);
    missionText('auctionIndirect', typeof latest.indirect_share_pct === 'number' ? `${latest.indirect_share_pct.toFixed(1)}% · ${latest.indirect_share_change_pp >= 0 ? '+' : ''}${latest.indirect_share_change_pp?.toFixed?.(1) ?? 'n/a'} pp` : 'WITHHELD');
  } else {
    missionText('auctionLatest', 'WITHHELD');
    missionText('auctionLatestMeta', 'Treasury auction data unavailable');
    missionText('auctionIndirect', 'WITHHELD');
  }
  missionText('nominalImpulse', bp(changes?.nominal));
  missionText('realImpulse', bp(changes?.real));
  missionText('breakevenImpulse', bp(changes?.breakeven));
  missionText('auctionDemandState', String(funding?.summary?.state ?? 'WITHHELD').replaceAll('_',' '));
  missionText('fundingSample', funding?.summary?.sample_size ?? 0);
}

function renderMacroPulse(pulse: { structural?: MacroMetric[]; market_proxy?: MarketAsset; comparisons?: any } | undefined) {
  const grid = document.querySelector<HTMLElement>('#macroCardGrid');
  const structural = Array.isArray(pulse?.structural) ? pulse?.structural ?? [] : [];
  const proxy = pulse?.market_proxy;
  if (grid) {
    grid.replaceChildren();
    for (const metric of structural) {
      const card = document.createElement('article');
      card.className = 'macro-card';
      const label = document.createElement('span');
      label.textContent = metric.label || 'MACRO SERIES';
      const value = document.createElement('strong');
      value.textContent = metric.ok && typeof metric.value === 'number' ? `${metric.value.toFixed(2)}%` : 'WITHHELD';
      const meta = document.createElement('small');
      meta.textContent = metric.ok ? `${metric.period || 'period n/a'} · World Bank · updated ${metric.source_last_updated || 'n/a'}` : 'Official series unavailable';
      card.append(label, value, meta);
      grid.appendChild(card);
    }
    if (proxy) {
      const card = document.createElement('article');
      card.className = 'macro-card proxy';
      const label = document.createElement('span');
      label.textContent = proxy.name || 'USD/NGN';
      const value = document.createElement('strong');
      value.textContent = typeof proxy.price === 'number' ? proxy.price.toLocaleString(undefined,{maximumFractionDigits:2}) : 'WITHHELD';
      const meta = document.createElement('small');
      meta.textContent = `${String(proxy.freshness || 'UNAVAILABLE').replaceAll('_',' ')} · verified ${proxy.age_minutes ?? 'n/a'}m ago`;
      card.append(label, value, meta);
      grid.appendChild(card);
    }
  }
  const c = pulse?.comparisons ?? {};
  const gap = (v: unknown) => typeof v === 'number' ? `${v >= 0 ? '+' : ''}${v.toFixed(2)} pp` : 'WITHHELD';
  missionText('ngGrowthGap', gap(c?.nigeria_growth_vs_world_pp));
  missionText('ngInflationGap', gap(c?.nigeria_inflation_vs_world_pp));
  missionText('ssaGrowthGap', gap(c?.ssa_growth_vs_world_pp));
}


function renderTrendsPulse(pulse: { structural?: MacroMetric[]; research?: ResearchActivity[]; market_proxies?: MarketAsset[]; digital_assets?: any; proxy_attention?: any } | undefined) {
  const structuralGrid = document.querySelector<HTMLElement>('#trendStructuralGrid');
  const researchGrid = document.querySelector<HTMLElement>('#trendResearchGrid');
  const proxyGrid = document.querySelector<HTMLElement>('#trendProxyGrid');
  const digitalGrid = document.querySelector<HTMLElement>('#trendDigitalGrid');
  const structural = Array.isArray(pulse?.structural) ? pulse?.structural ?? [] : [];
  const research = Array.isArray(pulse?.research) ? pulse?.research ?? [] : [];
  const proxies = Array.isArray(pulse?.market_proxies) ? pulse?.market_proxies ?? [] : [];
  const crypto = pulse?.digital_assets ?? {};

  if (structuralGrid) {
    structuralGrid.replaceChildren();
    for (const metric of structural) {
      const card = document.createElement('article');
      card.className = 'trend-card';
      const label = document.createElement('span');
      label.textContent = metric.label || 'STRUCTURAL TREND';
      const value = document.createElement('strong');
      if (!metric.ok || typeof metric.value !== 'number') value.textContent = 'WITHHELD';
      else if (metric.label === 'Resident patent applications') value.textContent = Math.round(metric.value).toLocaleString();
      else value.textContent = `${metric.value.toFixed(2)}%`;
      const meta = document.createElement('small');
      meta.textContent = metric.ok ? `${metric.period || 'period n/a'} · World Bank · updated ${metric.source_last_updated || 'n/a'}` : 'Official series unavailable';
      card.append(label, value, meta);
      structuralGrid.appendChild(card);
    }
  }

  if (researchGrid) {
    researchGrid.replaceChildren();
    for (const item of research) {
      const card = document.createElement('article');
      card.className = 'trend-card research';
      const label = document.createElement('span');
      label.textContent = `${item.label || 'RESEARCH ACTIVITY'} · ${item.window_days || 7}D`;
      const value = document.createElement('strong');
      value.textContent = item.ok && typeof item.count === 'number' ? item.count.toLocaleString() : 'WITHHELD';
      const meta = document.createElement('small');
      meta.textContent = item.ok ? `${item.category || ''} · arXiv · ACTIVITY ≠ MOMENTUM` : 'Research feed unavailable';
      card.append(label, value, meta);
      researchGrid.appendChild(card);
    }
  }

  if (proxyGrid) {
    proxyGrid.replaceChildren();
    for (const proxy of proxies) {
      const card = document.createElement('article');
      card.className = 'trend-card proxy';
      const top = document.createElement('div');
      const label = document.createElement('span');
      const fresh = document.createElement('i');
      label.textContent = proxy.name || proxy.symbol || 'MARKET PROXY';
      fresh.textContent = String(proxy.freshness || 'UNAVAILABLE').replaceAll('_',' ');
      fresh.dataset.freshness = String(proxy.freshness || '');
      top.append(label, fresh);
      const value = document.createElement('strong');
      value.textContent = typeof proxy.price === 'number' ? proxy.price.toLocaleString(undefined,{maximumFractionDigits:2}) : 'WITHHELD';
      const move = document.createElement('em');
      const pct = typeof proxy.change_pct === 'number' ? proxy.change_pct : null;
      move.textContent = pct === null ? 'change unavailable' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% · ${String(proxy.direction || 'MIXED').replaceAll('_',' ')}`;
      move.dataset.direction = String(proxy.direction || '');
      const meta = document.createElement('small');
      meta.textContent = proxy.freshness === 'MARKET_CLOSED_OR_STALE'
        ? `Market closed / last verified ${Math.round(Number(proxy.age_minutes || 0) / 60)}h ago`
        : `Verified ${proxy.age_minutes ?? 'n/a'}m ago · PROXY ≠ ADOPTION`;
      card.append(top, value, move, meta);
      proxyGrid.appendChild(card);
    }
  }

  if (digitalGrid) {
    digitalGrid.replaceChildren();
    const cards: Array<[string,string,string]> = [
      ['CRYPTO MARKET CAP', typeof crypto?.total_market_cap_usd === 'number' ? `$${(crypto.total_market_cap_usd/1e12).toFixed(2)}T` : 'WITHHELD', 'CoinGecko global market cap'],
      ['CRYPTO 24H', typeof crypto?.market_cap_change_24h_pct === 'number' ? `${crypto.market_cap_change_24h_pct >= 0 ? '+' : ''}${crypto.market_cap_change_24h_pct.toFixed(2)}%` : 'WITHHELD', 'Market-cap change'],
      ['BTC DOMINANCE', typeof crypto?.btc_dominance_pct === 'number' ? `${crypto.btc_dominance_pct.toFixed(2)}%` : 'WITHHELD', 'Share of crypto market cap'],
      ['ACTIVE CRYPTO ASSETS', typeof crypto?.active_cryptocurrencies === 'number' ? crypto.active_cryptocurrencies.toLocaleString() : 'WITHHELD', 'CoinGecko active-asset coverage']
    ];
    for (const [name,valueText,metaText] of cards) {
      const card = document.createElement('article');
      card.className = 'trend-card digital';
      const label = document.createElement('span'); label.textContent = name;
      const value = document.createElement('strong'); value.textContent = valueText;
      const meta = document.createElement('small'); meta.textContent = metaText;
      card.append(label,value,meta);
      digitalGrid.appendChild(card);
    }
  }

  const attention = pulse?.proxy_attention ?? {};
  missionText('trendAttentionState', attention?.state ?? 'WITHHELD');
  missionText('trendProxyUsable', `${attention?.usable ?? 0}/${attention?.total ?? 4}`);
  missionText('trendProxyBreadth', `${attention?.up ?? 0} ↑ / ${attention?.down ?? 0} ↓ / ${attention?.flat ?? 0} →`);
  missionText('trendCryptoState', String(crypto?.state ?? 'WITHHELD').replaceAll('_',' '));
}


function renderPositioningEvidence(evidence: { gold_cot?: any } | undefined) {
  const cot = evidence?.gold_cot ?? {};
  const grid = document.querySelector<HTMLElement>('#cotGroupGrid');
  if (grid) {
    grid.replaceChildren();
    const groups = Array.isArray(cot?.groups) ? cot.groups : [];
    if (!groups.length) {
      const card = document.createElement('article');
      card.className = 'positioning-card';
      card.textContent = 'CFTC positioning unavailable';
      grid.appendChild(card);
    } else {
      for (const g of groups) {
        const card = document.createElement('article');
        card.className = 'positioning-card';
        const label = document.createElement('span');
        label.textContent = g?.name || 'POSITIONING';
        const net = document.createElement('strong');
        const netValue = typeof g?.net === 'number' ? g.net : null;
        net.textContent = netValue === null ? 'WITHHELD' : `${netValue >= 0 ? '+' : ''}${Math.round(netValue).toLocaleString()} NET`;
        net.dataset.direction = netValue === null ? '' : netValue >= 0 ? 'UP' : 'DOWN';
        const detail = document.createElement('em');
        detail.textContent = `Long ${typeof g?.long === 'number' ? Math.round(g.long).toLocaleString() : 'n/a'} · Short ${typeof g?.short === 'number' ? Math.round(g.short).toLocaleString() : 'n/a'}`;
        const weekly = document.createElement('small');
        const chg = typeof g?.weekly_net_change === 'number' ? g.weekly_net_change : null;
        const pct = typeof g?.net_pct_open_interest === 'number' ? g.net_pct_open_interest : null;
        weekly.textContent = `Weekly net Δ ${chg === null ? 'n/a' : `${chg >= 0 ? '+' : ''}${Math.round(chg).toLocaleString()}`} · Net/OI ${pct === null ? 'n/a' : pct.toFixed(2)+'%'}`;
        card.append(label,net,detail,weekly);
        grid.appendChild(card);
      }
    }
  }
  missionText('cotReportDate', cot?.report_date ? String(cot.report_date).slice(0,10) : 'WITHHELD');
  missionText('cotFreshness', cot?.freshness ? `${String(cot.freshness).replaceAll('_',' ')} · age ${cot.age_days ?? 'n/a'}d` : 'Weekly evidence unavailable');
  missionText('cotOpenInterest', typeof cot?.open_interest === 'number' ? Math.round(cot.open_interest).toLocaleString() : 'WITHHELD');
  missionText('cotOiChange', typeof cot?.open_interest_change === 'number' ? `${cot.open_interest_change >= 0 ? '+' : ''}${Math.round(cot.open_interest_change).toLocaleString()}` : 'WITHHELD');
  missionText('cotManaged3', typeof cot?.managed_money_3_report_net_change === 'number' ? `${cot.managed_money_3_report_net_change >= 0 ? '+' : ''}${Math.round(cot.managed_money_3_report_net_change).toLocaleString()}` : 'WITHHELD');
}


function renderQuantAccountability(pulse: any) {
  const forecast = pulse?.forecast_error ?? {};
  const execution = pulse?.execution_latency ?? {};
  const settlement = pulse?.settlement_readiness ?? {};
  const benchmark = pulse?.benchmark_reputation ?? {};
  const calibrationStructure = pulse?.calibration_structure ?? {};
  const scenarioEv = pulse?.scenario_ev ?? {};
  const portfolioRisk = pulse?.portfolio_risk ?? {};
  const forecastCoverage = pulse?.forecast_coverage ?? {};
  const evidenceFreshness = pulse?.evidence_freshness ?? {};
  const provenanceManifest = pulse?.provenance_manifest ?? {};
  const receiptLedger = pulse?.provenance_receipt_ledger ?? {};
  const attestation = pulse?.provenance_attestation ?? {};
  const keyLifecycle = pulse?.attestation_key_lifecycle ?? {};
  const checkpoint = pulse?.provenance_checkpoint ?? {};
  const externalAnchor = pulse?.external_anchor ?? {};
  const gates = pulse?.publication_gates ?? {};
  const horizons = Array.isArray(forecast?.horizons) ? forecast.horizons : [];
  const delays = Array.isArray(execution?.delays) ? execution.delays : [];
  const forecastGrid = document.querySelector<HTMLElement>('#forecastErrorGrid');
  const latencyGrid = document.querySelector<HTMLElement>('#latencyQualityGrid');

  if (forecastGrid) {
    forecastGrid.replaceChildren();
    for (const h of horizons) {
      const card = document.createElement('article');
      card.className = 'quant-evidence-card';
      const label = document.createElement('span');
      label.textContent = `${h.horizon_minutes ?? '?'} MIN HORIZON`;
      const value = document.createElement('strong');
      value.textContent = `n=${h.nonflat_sample ?? 0}/${gates.forecast_threshold ?? 20}`;
      const metrics = document.createElement('em');
      const mfe = typeof h.avg_mfe_pct === 'number' ? h.avg_mfe_pct.toFixed(4) : 'n/a';
      const mae = typeof h.avg_mae_pct === 'number' ? h.avg_mae_pct.toFixed(4) : 'n/a';
      metrics.textContent = `MFE ${mfe}% · MAE ${mae}%`;
      const meta = document.createElement('small');
      meta.textContent = `${h.hits ?? 0} observed hits · ${h.misses ?? 0} misses · ${h.timing_recovered ?? 0} timing recoveries · accuracy withheld`;
      card.append(label, value, metrics, meta);
      forecastGrid.appendChild(card);
    }
    if (!horizons.length) {
      const card = document.createElement('article');
      card.className = 'quant-evidence-card';
      card.textContent = 'Forecast error evidence unavailable';
      forecastGrid.appendChild(card);
    }
  }

  if (latencyGrid) {
    latencyGrid.replaceChildren();
    for (const d of delays) {
      const card = document.createElement('article');
      card.className = 'quant-evidence-card latency';
      const label = document.createElement('span');
      label.textContent = `${d.delay_minutes ?? '?'} MIN DELAY`;
      const value = document.createElement('strong');
      value.textContent = `n=${d.sample_size ?? 0}/${gates.latency_threshold ?? 30}`;
      const metrics = document.createElement('em');
      const signed = typeof d.avg_signed_shortfall_bps === 'number' ? `${d.avg_signed_shortfall_bps >= 0 ? '+' : ''}${d.avg_signed_shortfall_bps.toFixed(2)} bp` : 'WITHHELD';
      metrics.textContent = `Avg signed shortfall ${signed}`;
      const meta = document.createElement('small');
      meta.textContent = `${d.adverse_count ?? 0} adverse / ${d.improved_count ?? 0} improved · max adverse ${typeof d.max_adverse_cost_bps === 'number' ? d.max_adverse_cost_bps.toFixed(2) : 'n/a'} bp · early sample`;
      card.append(label, value, metrics, meta);
      latencyGrid.appendChild(card);
    }
    if (!delays.length) {
      const card = document.createElement('article');
      card.className = 'quant-evidence-card latency';
      card.textContent = 'Execution latency evidence unavailable';
      latencyGrid.appendChild(card);
    }
  }

  const cats = forecast?.categories ?? {};
  const errorParts = [
    typeof cats.CLEAN_DIRECTIONAL_HIT === 'number' ? `${cats.CLEAN_DIRECTIONAL_HIT} clean` : null,
    typeof cats.TIMING_ERROR_RECOVERED_LATER === 'number' ? `${cats.TIMING_ERROR_RECOVERED_LATER} timing recovered` : null,
    typeof cats.LOW_FOLLOW_THROUGH_UNRESOLVED === 'number' ? `${cats.LOW_FOLLOW_THROUGH_UNRESOLVED} low follow-through` : null,
    typeof cats.ADVERSE_PATH_RISK === 'number' ? `${cats.ADVERSE_PATH_RISK} adverse path` : null
  ].filter(Boolean);

  missionText('quantLearningState', String(pulse?.state ?? 'WITHHELD').replaceAll('_',' '));
  missionText('quantPublicationGate', gates?.public_accuracy ?? 'WITHHELD');
  const sourceMode=String(pulse?.source_mode ?? 'EVIDENCE_GATED').replaceAll('_',' '); const fallbackAge=typeof pulse?.fallback_age_minutes==='number'?` · snapshot age ${pulse.fallback_age_minutes.toFixed(1)}m`:'';
  missionText('quantPublicationReason', `Max non-flat n=${gates?.max_nonflat_sample ?? 0}; threshold n=${gates?.forecast_threshold ?? 20} per horizon · ${sourceMode}${fallbackAge}.`);
  missionText('quantErrorMix', errorParts.length ? errorParts.join(' · ') : 'WITHHELD');
  missionText('quantIntegrity', forecast?.data_integrity ? `${forecast.data_integrity.negative_mfe ?? 0} negative MFE · ${forecast.data_integrity.negative_mae ?? 0} negative MAE` : 'WITHHELD');
  missionText('quantLatencyMaturity', `max n=${gates?.max_latency_sample ?? 0}/${gates?.latency_threshold ?? 30} · ${String(gates?.latency_stability ?? 'WITHHELD').replaceAll('_',' ')}`);
  missionText('quantBrier', String(gates?.brier ?? 'WITHHELD').replaceAll('_',' '));
  missionText('learningV101State', String(settlement?.settlement_state ?? 'EVIDENCE_GATED').replaceAll('_',' '));
  const settlementCounts=settlement?.counts ?? {};
  const settlementMode=String(pulse?.settlement_source_mode ?? 'EVIDENCE_GATED').replaceAll('_',' ');
  const settlementAge=typeof pulse?.settlement_fallback_age_minutes==='number' ? ` · snapshot ${pulse.settlement_fallback_age_minutes.toFixed(1)}m old` : '';
  missionText('learningV101Detail', settlement?.ok
    ? `${settlementCounts.publication_integrity_verified ?? 0}/${settlementCounts.total ?? 0} hashes verified · ${settlementCounts.due_today ?? 0} due · ${settlementCounts.overdue_open ?? 0} overdue · nearest ${settlement?.days_to_nearest_horizon ?? 'n/a'}d · ${settlementMode}${settlementAge}`
    : 'Settlement readiness evidence unavailable.');
  const benchmarkCounts=benchmark?.counts ?? {};
  const benchmarkPolicy=benchmark?.benchmark_policy ?? {};
  const benchmarkMode=String(pulse?.benchmark_source_mode ?? 'EVIDENCE_GATED').replaceAll('_',' ');
  const benchmarkAge=typeof pulse?.benchmark_fallback_age_minutes==='number' ? ` · snapshot ${pulse.benchmark_fallback_age_minutes.toFixed(1)}m old` : '';
  missionText('learningV102State', String(benchmark?.benchmark_state ?? 'EVIDENCE_GATED').replaceAll('_',' '));
  missionText('learningV102Detail', benchmark?.ok
    ? `${benchmarkPolicy.baseline_name ?? 'NO_SKILL_50'} ${benchmarkPolicy.baseline_accuracy_pct ?? 50}% · ${benchmarkCounts.models ?? 0} models · ${benchmarkCounts.human_review_eligible ?? 0} review-eligible · ${benchmarkCounts.reputation_sample_reached ?? 0} reputation-mature · ${benchmarkMode}${benchmarkAge}`
    : 'Benchmark and signal-reputation evidence unavailable.');
  const structureLedger=calibrationStructure?.ledger ?? {};
  const structureConcentration=calibrationStructure?.concentration ?? {};
  const structureMode=String(pulse?.calibration_structure_source_mode ?? 'EVIDENCE_GATED').replaceAll('_',' ');
  const structureAge=typeof pulse?.calibration_structure_fallback_age_minutes==='number'
    ? ` · snapshot ${pulse.calibration_structure_fallback_age_minutes.toFixed(1)}m old`
    : '';
  missionText('learningV103State', String(calibrationStructure?.calibration_readiness_state ?? 'EVIDENCE_GATED').replaceAll('_',' '));
  missionText('learningV103Detail', calibrationStructure?.ok
    ? `${structureLedger.total ?? 0} forecasts · avg p ${structureLedger.average_probability ?? 'n/a'}% · ${structureLedger.up_forecasts ?? 0} up / ${structureLedger.down_forecasts ?? 0} down · largest horizon ${structureConcentration.largest_horizon_share_pct ?? 'n/a'}% · ${String(structureConcentration.direction_state ?? 'WITHHELD').replaceAll('_',' ')} · ${structureMode}${structureAge}`
    : 'Calibration structure evidence unavailable.');
  const coverageGates=forecastCoverage?.coverage_gates ?? {};
  const coverageMetrics=forecastCoverage?.concentration_metrics ?? {};
  const coverageMode=String(pulse?.forecast_coverage_source_mode ?? 'EVIDENCE_GATED').replaceAll('_',' ');
  const coverageAge=typeof pulse?.forecast_coverage_fallback_age_minutes==='number' ? ` · snapshot ${pulse.forecast_coverage_fallback_age_minutes.toFixed(1)}m old` : '';
  missionText('learningV104State', String(coverageGates?.generalization_readiness ?? 'EVIDENCE_GATED').replaceAll('_',' '));
  missionText('learningV104Detail', forecastCoverage?.ok ? `${String(coverageGates.direction_coverage ?? 'WITHHELD').replaceAll('_',' ')} · ${String(coverageGates.horizon_coverage ?? 'WITHHELD').replaceAll('_',' ')} · ${String(coverageGates.confidence_band_coverage ?? 'WITHHELD').replaceAll('_',' ')} · largest horizon ${coverageMetrics.largest_horizon_share_pct ?? 'n/a'}% · ${coverageMode}${coverageAge}` : 'Forecast coverage evidence unavailable.');
  const freshnessCounts=evidenceFreshness?.counts ?? {};
  const nextExpiry=evidenceFreshness?.next_expiry ?? {};
  missionText('learningV105State', String(evidenceFreshness?.state ?? 'EVIDENCE_GATED').replaceAll('_',' '));
  missionText('learningV105Detail', evidenceFreshness?.version ? `${freshnessCounts.live ?? 0} live · ${(freshnessCounts.survivor_fresh ?? 0)+(freshnessCounts.survivor_aging ?? 0)+(freshnessCounts.survivor_critical ?? 0)} fallback · ${freshnessCounts.evidence_gated ?? 0} gated · next expiry ${typeof nextExpiry.remaining_minutes==='number'?nextExpiry.remaining_minutes.toFixed(1)+'m':'n/a'} · ${nextExpiry.id ?? 'no expiring lane'}` : 'Evidence freshness state unavailable.');
  const provenanceCounts=provenanceManifest?.counts ?? {};
  const firstFingerprint=Array.isArray(provenanceManifest?.fingerprints)?provenanceManifest.fingerprints.find((x:any)=>typeof x?.sha256==='string'):null;
  missionText('learningV106State', String(provenanceManifest?.state ?? 'EVIDENCE_GATED').replaceAll('_',' '));
  missionText('learningV106Detail', provenanceManifest?.version ? `${provenanceCounts.fingerprinted ?? 0}/${provenanceCounts.total ?? 0} SHA-256 fingerprints · ${provenanceManifest.algorithm ?? 'WITHHELD'} · ${firstFingerprint?.sha256 ? firstFingerprint.sha256.slice(0,12)+'…' : 'hash unavailable'} · content address, not signature` : 'Snapshot provenance unavailable.');
  missionText('learningV107State', String(receiptLedger?.state ?? 'EVIDENCE_GATED').replaceAll('_',' '));
  missionText('learningV107Detail', receiptLedger?.ok ? `${receiptLedger?.counts?.receipts ?? 0} receipts · ${receiptLedger?.counts?.modules ?? 0} modules · ${receiptLedger?.counts?.chain_link_failures ?? 0} broken links · hourly append-only chain.` : 'Provenance receipt ledger unavailable.');
  missionText('learningV108State', String(attestation?.state ?? 'EVIDENCE_GATED').replaceAll('_',' '));
  missionText('learningV108Detail', attestation?.ok ? `${attestation?.counts?.verified_attestations ?? 0}/${attestation?.counts?.attestations ?? 0} verified · ${attestation?.counts?.failed_attestations ?? 0} failed · ${attestation?.counts?.unattested_receipts ?? 0} unattested · Vault-backed HMAC · secret never exposed · not public-key signature.` : 'Server attestation evidence unavailable.');
  missionText('learningV109State', String(keyLifecycle?.state ?? 'EVIDENCE_GATED').replaceAll('_',' '));
  const activeKey=Array.isArray(keyLifecycle?.keys)?keyLifecycle.keys.find((k:any)=>k?.status==='ACTIVE'):null;
  missionText('learningV109Detail', keyLifecycle?.ok ? `${keyLifecycle?.counts?.keys ?? 0} keys · ${keyLifecycle?.counts?.active_keys ?? 0} active · ${keyLifecycle?.counts?.retired_keys ?? 0} retired · ${keyLifecycle?.counts?.missing_vault_keys ?? 0} missing · active v${activeKey?.version ?? '?'} · history preserved.` : 'Attestation key lifecycle unavailable.');
  const checkpointRoot=String(checkpoint?.latest_checkpoint?.checkpoint_sha256 ?? '');
  const checkpointMode=String(pulse?.provenance_checkpoint_source_mode ?? 'EVIDENCE_GATED').replaceAll('_',' ');
  const checkpointAge=typeof pulse?.provenance_checkpoint_fallback_age_minutes==='number' ? ` · snapshot ${pulse.provenance_checkpoint_fallback_age_minutes.toFixed(1)}m old` : '';
  missionText('learningV110State', String(checkpoint?.state ?? 'EVIDENCE_GATED').replaceAll('_',' '));
  missionText('learningV110Detail', checkpoint?.ok ? `${checkpoint?.counts?.checkpoints ?? 0} checkpoints · ${checkpoint?.counts?.chain_link_failures ?? 0} broken links · ${checkpoint?.counts?.hmac_failures ?? 0} HMAC failures · ${checkpoint?.counts?.uncheckpointed_attestations ?? 0} uncheckpointed · root ${checkpointRoot ? checkpointRoot.slice(0,12)+'…' : 'n/a'} · ${checkpointMode}${checkpointAge}` : 'Global provenance checkpoint unavailable.');
  const externalRoot=String(externalAnchor?.external_anchor?.checkpoint_sha256 ?? '');
  const sourceProofHash=String(externalAnchor?.external_anchor?.source_proof_sha256 ?? '');
  missionText('learningV111State', String(externalAnchor?.root_state ?? externalAnchor?.state ?? 'UNAVAILABLE').replaceAll('_',' '));
  missionText('learningV111Detail', externalAnchor?.version ? `Immutable GitHub anchor · ${externalAnchor?.anchor_age_minutes ?? 'n/a'}m old · root ${externalRoot ? externalRoot.slice(0,12)+'…' : 'n/a'} · proof ${sourceProofHash ? sourceProofHash.slice(0,12)+'…' : 'n/a'} · second-system checkpoint integrity.` : 'External checkpoint anchor unavailable.');
  missionText('learningV112State', String(externalAnchor?.heartbeat_state ?? 'UNAVAILABLE').replaceAll('_',' '));
  missionText('learningV112Detail', externalAnchor?.version ? `Last independently verified ${externalAnchor?.age_minutes ?? 'n/a'}m ago · checks ${externalAnchor?.verification_count ?? 'n/a'} · next stale gate ${externalAnchor?.freshness_expires_at ?? 'n/a'} · heartbeat cannot grant capital.` : 'External anchor heartbeat unavailable.');
}

function renderDesks(desks: MissionDesk[]) {
  const grid = document.querySelector<HTMLElement>('#sixDeskGrid');
  if (!grid || !Array.isArray(desks)) return;
  grid.replaceChildren();
  desks.forEach((desk, index) => {
    const card = document.createElement('a');
    card.className = 'desk-card';
    card.dataset.deskId = desk.id || `desk-${index + 1}`;
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


async function loadQaMatrix() {
  try {
    let response = await fetch(`/api/autonomous-qa-matrix?ui=${Date.now()}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    let qa = response.ok ? await response.json() : null;
    if (!qa || qa?.state !== 'PASS') {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      response = await fetch(`/api/autonomous-qa-matrix?ui_retry=${Date.now()}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const retry = response.ok ? await response.json() : null;
      if (retry && (!qa || retry?.state === 'PASS' || Number(retry?.summary?.passed ?? 0) > Number(qa?.summary?.passed ?? 0))) qa = retry;
    }
    const passed = Number(qa?.summary?.passed ?? 0);
    const total = Number(qa?.summary?.total ?? 0);
    const state = String(qa?.state ?? 'WITHHELD');
    const value = total > 0 ? `${passed}/${total} ${state.replaceAll('_', ' ')}` : state.replaceAll('_', ' ');
    missionText('briefQA', value);
    missionText('calibrationQA', value);
    updateMissionTapeItem('AUTONOMOUS QA', value);
    const quantStatus = document.querySelector<HTMLElement>('[data-desk-id="quant"] strong');
    if (quantStatus) {
      quantStatus.textContent = state === 'PASS' ? 'QA PASS' : `QA ${state.replaceAll('_', ' ')}`;
      quantStatus.dataset.state = state === 'PASS' ? 'QA PASS' : state;
    }
    const quantDetail = document.querySelector<HTMLElement>('[data-desk-id="quant"] p');
    if (quantDetail) quantDetail.textContent = `${passed}/${total || '?'} autonomous invariants · forecast ledger · Brier · MFE/MAE`;
  } catch {
    missionText('briefQA', 'QA CHANNEL UNAVAILABLE');
    missionText('calibrationQA', 'UNAVAILABLE');
    updateMissionTapeItem('AUTONOMOUS QA', 'CHANNEL UNAVAILABLE');
  }
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
    missionText('briefQA', changed?.qa_score ?? 'VERIFYING');
    missionText('briefPhase', changed?.phase ?? 'WITHHELD');
    missionText('briefTimestamp', generated && !Number.isNaN(generated.getTime()) ? generated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'WITHHELD');

    renderMissionTape(brief?.command_tape ?? []);
    renderGlobalMarkets(brief?.global_market_dashboard);
    renderSeasonality(brief?.gold_seasonality_cycle_context);
    renderVolatility(brief?.volatility_intelligence);
    renderRatesFunding(brief?.rates_funding_intelligence);
    renderMacroPulse(brief?.macro_evidence_pulse);
    renderTrendsPulse(brief?.global_trends_evidence_pulse);
    renderPositioningEvidence(brief?.flows_positioning_evidence);
    renderQuantAccountability(brief?.quant_accountability);
    renderDesks(brief?.six_desks ?? []);
    renderEngines(brief?.engine_registry ?? []);

    missionText('calibrationAccuracy', calibration?.public_accuracy ?? 'WITHHELD');
    missionText('calibrationReason', calibration?.reason ?? 'Empirical sample threshold not met.');
    missionText('calibrationQA', calibration?.qa_score ?? 'VERIFYING');
  } catch {
    missionText('briefHeadline', 'Mission brief unavailable. The UI is failing closed.');
    missionText('briefMatter', 'No live intelligence is promoted while the mission brief cannot be verified.');
    missionText('briefQuality', 'WITHHELD');
    missionText('briefQA', 'WITHHELD');
    missionText('briefPhase', 'WITHHELD');
  }
}

async function refreshMissionExperience() {
  await loadMissionBrief();
  await loadQaMatrix();
}
void refreshMissionExperience();
window.setInterval(() => void refreshMissionExperience(), 60_000);
