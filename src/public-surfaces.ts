import './styles.css';

const SUPABASE = 'https://mpcelmjiycjpdyyflisn.supabase.co';
const KEY = 'sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';
const FUNCTIONS = `${SUPABASE}/functions/v1`;

type AnyJson = Record<string, any>;

let latestGoldDesk: AnyJson = {};
let brokerTranslationAt: number | null = null;
let brokerTranslationFuturesPrice: number | null = null;
let brokerTranslationExpired = false;
let goldLastRefreshAt: number | null = null;
let goldNextRefreshAt: number | null = null;
let goldRefreshBusy = false;
let goldPulseStarted = false;

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

async function readLocal(path: string, timeout = 6500): Promise<AnyJson> {
  try {
    const response = await fetch(path, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeout),
    });
    return await response.json().catch(() => ({}));
  } catch {
    return { ok: false, state: 'UNAVAILABLE', error: 'local_transport_unavailable' };
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

function invalidateBrokerTranslation(message: string) {
  brokerTranslationExpired = true;
  for (const id of ['v118-basis','v118-spread','v118-long-zone','v118-short-trigger','v118-long-map','v118-short-map','v124-broker-long-distance','v124-broker-short-distance']) set(id, null);
  set('v121-broker-age', 'EXPIRED');
  set('v118-bridge-message', message);
}

function renderGoldPulseClock() {
  const now = Date.now();

  if (goldLastRefreshAt) {
    const age = Math.max(0, Math.floor((now - goldLastRefreshAt) / 1000));
    set('v121-last-refresh', `${age}s ago`);
  }

  if (document.hidden) {
    set('v121-pulse-mode', 'PAUSED · TAB HIDDEN');
    set('v121-next-refresh', 'ON RETURN');
  } else {
    set('v121-pulse-mode', 'ACTIVE · 60s');
    if (goldNextRefreshAt) {
      const remaining = Math.max(0, Math.ceil((goldNextRefreshAt - now) / 1000));
      set('v121-next-refresh', `${remaining}s`);
    }
  }

  if (brokerTranslationAt) {
    const brokerAge = Math.max(0, Math.floor((now - brokerTranslationAt) / 1000));
    if (brokerAge >= 60 && !brokerTranslationExpired) {
      invalidateBrokerTranslation('Broker quote expired after 60 seconds. Enter the current XAUUSD bid/ask again before using translated levels.');
    } else if (!brokerTranslationExpired) {
      set('v121-broker-age', `${brokerAge}s · VALID`);
    }
  } else if (!brokerTranslationExpired) {
    set('v121-broker-age', 'NOT SET');
  }
}

function setupBrokerGoldBridge(desk: AnyJson) {
  const nextFutures = Number(desk?.market?.price);
  if (
    brokerTranslationAt &&
    !brokerTranslationExpired &&
    brokerTranslationFuturesPrice != null &&
    Number.isFinite(nextFutures) &&
    Math.abs(nextFutures - brokerTranslationFuturesPrice) >= 0.01
  ) {
    invalidateBrokerTranslation('The Gold engine refreshed to a new futures reference. Re-enter your current broker bid/ask to rebuild the XAUUSD translation.');
  }

  latestGoldDesk = desk;
  const button = byId('v118-translate') as HTMLButtonElement | null;
  if (!button || button.dataset.v121Bound === 'true') return;
  button.dataset.v121Bound = 'true';

  const translate = () => {
    const bidInput = byId('v118-broker-bid') as HTMLInputElement | null;
    const askInput = byId('v118-broker-ask') as HTMLInputElement | null;
    const bid = Number(bidInput?.value);
    const ask = Number(askInput?.value);
    const futures = Number(latestGoldDesk?.market?.price);

    if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0 || ask < bid) {
      set('v118-bridge-message', 'Enter a valid broker bid and ask. Ask must be greater than or equal to bid.');
      return;
    }
    if (!Number.isFinite(futures) || futures <= 0) {
      set('v118-bridge-message', 'The COMEX structural reference is unavailable, so XAUUSD translation is withheld.');
      return;
    }

    const brokerMid = (bid + ask) / 2;
    const spread = ask - bid;
    const basis = futures - brokerMid;
    const spot = (level: unknown) => {
      const value = Number(level);
      return Number.isFinite(value) ? value - basis : null;
    };
    const f2 = (value: number | null) => value == null ? 'n/a' : value.toFixed(2);

    const long = latestGoldDesk?.scenarios?.long_continuation ?? {};
    const short = latestGoldDesk?.scenarios?.failed_break_short ?? {};
    const longLow = spot(long?.retest_zone?.low);
    const longHigh = spot(long?.retest_zone?.high);
    const shortTrigger = spot(short?.failure_threshold);

    set('v118-basis', basis.toFixed(2));
    set('v118-spread', spread.toFixed(2));
    set('v118-long-zone', longLow == null || longHigh == null ? null : `${f2(longLow)} → ${f2(longHigh)}`);
    set('v118-short-trigger', shortTrigger == null ? null : f2(shortTrigger));
    set('v118-long-map',
      `STOP ${f2(spot(long?.structural_invalidation))} · T1 ${f2(spot(long?.primary_target))} · T2 ${f2(spot(long?.extension_target))}`
    );
    set('v118-short-map',
      `STOP ${f2(spot(short?.structural_invalidation))} · T1 ${f2(spot(short?.primary_target))} · T2 ${f2(spot(short?.extension_target))}`
    );
    set('v118-long-map-copy',
      `Translated from COMEX using futures − broker-mid basis. Structural state: ${first(long?.state, 'UNKNOWN')}.`
    );
    set('v118-short-map-copy',
      `Translated from COMEX using the same contemporaneous basis. Structural state: ${first(short?.state, 'UNKNOWN')}.`
    );

    if (longLow != null && longHigh != null) {
      const lo = Math.min(longLow, longHigh);
      const hi = Math.max(longLow, longHigh);
      const longDistance = brokerMid > hi
        ? `${(brokerMid - hi).toFixed(2)} ABOVE`
        : brokerMid < lo
          ? `${(lo - brokerMid).toFixed(2)} BELOW`
          : 'INSIDE ZONE';
      set('v124-broker-long-distance', longDistance);
    } else {
      set('v124-broker-long-distance', null);
    }

    if (shortTrigger != null) {
      set('v124-broker-short-distance',
        brokerMid > shortTrigger
          ? `${(brokerMid - shortTrigger).toFixed(2)} ABOVE`
          : `${(shortTrigger - brokerMid).toFixed(2)} THROUGH`
      );
    } else {
      set('v124-broker-short-distance', null);
    }

    brokerTranslationAt = Date.now();
    brokerTranslationFuturesPrice = futures;
    brokerTranslationExpired = false;
    set('v118-bridge-message',
      `Broker mid ${brokerMid.toFixed(2)} · basis ${basis.toFixed(2)} · translation valid for 60 seconds unless the engine reference changes first.`
    );
    renderGoldPulseClock();
  };

  button.addEventListener('click', translate);
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
  const [gold, core, evidence, desk, day, v79, v81, v82, v83] = await Promise.all([
    read('public-gold-live-api', 6500),
    read('public-v63-structural-core-fabric', 6000),
    read('public-v65-model-evidence-fabric', 6000),
    read('public-gold-execution-desk', 10000),
    readLocal('/api/gold-day-state', 7000),
    readLocal('/api/gold-liquidity-state-machine', 9000),
    readLocal('/api/gold-mtf-zones', 9000),
    readLocal('/api/gold-mtf-confluence', 10000),
    readLocal('/api/gold-breakout-acceptance', 10000),
  ]);

  const canonicalMarket = first(gold?.market_status, gold?.state, 'UNKNOWN');
  const canonicalPrice = first(
    gold?.feed?.gold_futures?.price,
    gold?.feed?.gold?.price,
    gold?.price,
    gold?.quote?.price,
    gold?.last,
    null
  );
  const canonicalUnavailable =
    gold?.ok === false ||
    /UNKNOWN|UNAVAILABLE|RESTRICTED|ERROR|FAIL/i.test(String(canonicalMarket)) ||
    canonicalPrice == null;

  const useShadow = canonicalUnavailable && day?.ok === true;
  const action = useShadow ? 'WAIT' : first(gold?.engine?.action, gold?.action, gold?.decision?.action, core?.gold?.action, 'WAIT');
  const capital = useShadow ? '0R' : first(gold?.engine?.capital_permission, gold?.capital_permission, gold?.decision?.capital_permission, core?.gold?.capital_permission, '0R');
  const market = useShadow ? first(day?.market_session, 'SHADOW_MARKET') : canonicalMarket;
  const price = useShadow ? day?.current?.price : (market === 'UNAVAILABLE' ? null : canonicalPrice);
  const evidenceState = useShadow
    ? 'SHADOW_RESEARCH_ONLY'
    : first(evidence?.calibration?.performance_state, evidence?.performance_state, 'UNKNOWN');

  set('gold-live-state', useShadow ? `SHADOW · ${first(day?.day_state?.day_state, 'DAY_STATE_UNAVAILABLE')}` : first(gold?.engine?.state, gold?.state, market));
  set('gold-live-copy', useShadow
    ? 'Canonical Supabase market services are unavailable. V75 is showing delayed research-only structure; it cannot grant execution permission.'
    : market === 'MARKET_CLOSED'
      ? 'The governed Gold session is closed. Structural context is frozen until reopening.'
      : market === 'UNAVAILABLE'
        ? 'The live Gold market spine is unavailable. No structural price is promoted to a live execution quote.'
        : 'Gold market state is live, but capital permission remains independently governed.');
  set('gold-live-action', action);
  set('gold-live-capital', capital);
  set('gold-market', market);
  set('gold-price', price);
  set('gold-evidence', evidenceState);
  set('gold-confidence', useShadow ? 'WITHHELD' : (evidenceState === 'EVIDENCE_STORE_UNAVAILABLE' ? null : first(gold?.engine?.confidence_pct, gold?.confidence, evidence?.gold?.confidence, null)));

  if (useShadow) {
    set('gold-structure', first(day?.day_state?.day_state, 'SHADOW_DAY_STATE'));
    set('gold-structure-copy', `Research-only: range ${day?.current?.range ?? 'n/a'} · VWAP ${day?.current?.vwap ?? 'n/a'} · prior range ${day?.previous?.range ?? 'n/a'}.`);
    set('gold-model', 'V75 SHADOW QUANT RESEARCH');
    set('gold-model-copy', 'Transparent five-minute day-state rules are active. No probability or calibrated edge is claimed.');
  } else {
    set('gold-structure', first(core?.structure_signals?.market_status, core?.market_status, 'UNKNOWN'));
    set('gold-structure-copy', first(core?.decision_compression?.what_matters_now, core?.interpretation, 'Structural context is conditional.'));
    set('gold-model', evidenceState);
    set('gold-model-copy', evidenceState === 'EVIDENCE_STORE_UNAVAILABLE'
      ? 'Probability, EV, MFE/MAE and signal reputation are withheld until immutable evidence is readable.'
      : 'Observed model evidence is available subject to its sample and calibration gates.');
  }
  set('gold-firewall', `${action} · ${capital}`);

  if (desk?.ok) {
    const dm = desk?.market ?? {};
    const ds = desk?.session ?? {};
    const dl = desk?.scenarios?.long_continuation ?? {};
    const dshort = desk?.scenarios?.failed_break_short ?? {};
    const dc = desk?.current_read ?? {};
    set('v117-desk-state', first(desk?.desk_state, 'WAIT'));
    set('v117-feed-state', dm?.price == null ? first(dm?.market_status, 'UNAVAILABLE') : `${first(dm?.market_status, 'UNKNOWN')} · ${dm.price}`);
    set('v117-broker-feed', dm?.broker_execution_feed_required ? 'REQUIRED' : 'LIVE QUOTE OK');
    set('v117-session', `${first(ds?.primary_session, 'NONE')} · ${first(ds?.opening_state, 'UNKNOWN')}`);

    set('v117-long-state', first(dl?.state, 'NOT_CONFIRMED'));
    set('v117-long-copy', first(dl?.trigger, 'Long continuation condition unavailable.'));
    set('v117-long-zone', dl?.retest_zone ? `${dl.retest_zone.low} → ${dl.retest_zone.high}` : null);
    set('v117-long-stop', dl?.structural_invalidation);
    set('v117-long-targets', dl?.primary_target != null || dl?.extension_target != null ? `${dl?.primary_target ?? 'n/a'} / ${dl?.extension_target ?? 'n/a'}` : null);
    set('v117-long-rr', dl?.rr_at_prior_high ? `${dl.rr_at_prior_high.primary ?? 'n/a'}R / ${dl.rr_at_prior_high.extension ?? 'n/a'}R` : null);

    set('v117-short-state', first(dshort?.state, 'NOT_CONFIRMED'));
    set('v117-short-copy', first(dshort?.trigger, 'Failed-break short condition unavailable.'));
    set('v117-short-trigger', dshort?.failure_threshold);
    set('v117-short-stop', dshort?.structural_invalidation);
    set('v117-short-targets', dshort?.primary_target != null || dshort?.extension_target != null ? `${dshort?.primary_target ?? 'n/a'} / ${dshort?.extension_target ?? 'n/a'}` : null);
    set('v117-short-rr', dshort?.rr_at_prior_high ? `${dshort.rr_at_prior_high.primary ?? 'n/a'}R / ${dshort.rr_at_prior_high.extension ?? 'n/a'}R` : null);

    set('v117-decision', `${first(dc?.action_permitted, 'WAIT')} · ${first(dc?.capital_permission, '0R')}`);
    set('v117-decision-copy', first(dc?.note, desk?.execution?.broker_feed_rule, 'No machine-authorized trade is active.'));
  } else {
    for (const id of ['v117-desk-state','v117-feed-state','v117-broker-feed','v117-session','v117-long-state','v117-long-zone','v117-long-stop','v117-long-targets','v117-long-rr','v117-short-state','v117-short-trigger','v117-short-stop','v117-short-targets','v117-short-rr','v117-decision']) set(id, null);
    set('v117-decision-copy', 'The V117 live desk is unavailable. The existing Gold firewall remains authoritative.');
  }

  setupBrokerGoldBridge(desk);

  if (day?.ok) {
    const state = day?.day_state ?? {};
    const profile = day?.volume_profile_proxy ?? {};
    const above = day?.liquidity?.nearest_above;
    const below = day?.liquidity?.nearest_below;
    set('v75-day-state', first(state?.day_state, 'WITHHELD'));
    set('v75-day-copy', `${state?.framework_signal_day ? 'Framework signal-day conditions detected' : 'No framework signal-day condition'} · ${first(state?.vwap_relation, 'VWAP n/a')} · ${first(state?.profile_relation, 'profile n/a')}.`);
    set('v75-range', state?.range_vs_adr == null ? null : `${Number(state.range_vs_adr).toFixed(3)}× ADR3`);
    set('v75-range-copy', `Current range ${day?.current?.range ?? 'n/a'} · ADR3 ${day?.range_model?.adr3 ?? 'n/a'}.`);
    set('v75-breakout-quality', state?.breakout_quality == null ? null : `${state.breakout_quality}/100`);
    set('v75-breakout-copy', `Break prior high: ${state?.break_prior_high ? 'YES' : 'NO'} · break prior low: ${state?.break_prior_low ? 'YES' : 'NO'} · score is deterministic, not probabilistic.`);
    set('v75-prior-high', day?.previous?.high);
    set('v75-prior-low', day?.previous?.low);
    set('v75-vwap', day?.current?.vwap);
    set('v75-poc', profile?.poc);
    set('v75-opening-range', day?.opening_range ? `${day.opening_range.low} → ${day.opening_range.high}` : null);
    set('v75-opening-copy', `${first(state?.opening_range_relation, 'UNAVAILABLE')} · first ${day?.opening_range?.bars ?? 0} five-minute bars.`);
    set('v75-liquidity', `${below?.label ?? 'NONE'} ↔ ${above?.label ?? 'NONE'}`);
    set('v75-liquidity-copy', `Below ${below?.price ?? 'n/a'} · above ${above?.price ?? 'n/a'} · mapped levels, not targets.`);
    set('v75-profile', profile?.poc == null ? null : `VAL ${profile.val} · POC ${profile.poc} · VAH ${profile.vah}`);
  } else {
    for (const id of ['v75-day-state','v75-range','v75-breakout-quality','v75-prior-high','v75-prior-low','v75-vwap','v75-poc','v75-opening-range','v75-liquidity','v75-profile']) set(id, null);
  }

  if (v79?.ok) {
    set('v79-phase', first(v79?.state?.phase, 'WITHHELD'));
    set('v79-phase-copy', `${first(v79?.state?.direction, 'NONE')} · ${first(v79?.state?.acceptance, 'WITHHELD')} · extension ${first(v79?.state?.extension_state, 'n/a')}.`);
    set('v79-pressure', v79?.state?.pressure_score == null ? null : `${v79.state.pressure_score}`);
    set('v79-risk-copy', `Failed-break risk ${first(v79?.state?.failed_break_risk, 'n/a')} · exhaustion ${first(v79?.state?.exhaustion_risk, 'n/a')}.`);
    set('v79-invalidation', v79?.state?.invalidation_level);
  }

  if (v81?.ok) {
    set('v81-composite', first(v81?.composite?.state, 'WITHHELD'));
    set('v81-composite-copy', v81?.composite?.average_position_pct == null ? 'Multi-timeframe position unavailable.' : `Average current-range position ${v81.composite.average_position_pct}% · framework-derived, not a forecast.`);
    const tfMap = new Map((Array.isArray(v81?.zones) ? v81.zones : []).map((x: AnyJson) => [String(x?.timeframe), x]));
    for (const tf of ['daily','weekly','monthly','quarterly','yearly']) {
      const z: AnyJson = tfMap.get(tf) || {};
      set(`v81-${tf}`, z?.location ? `${z.location.position_pct}% · ${z.location.zone}` : null);
    }
  }

  if (v82?.ok) {
    set('v82-tension', first(v82?.confluence?.tension, 'WITHHELD'));
    set('v82-tension-copy', `Countertrend risk ${first(v82?.confluence?.countertrend_risk, 'n/a')} · intraday ${first(v82?.intraday?.phase, 'n/a')}.`);
    const below = v82?.confluence?.nearest_below_cluster;
    const above = v82?.confluence?.nearest_above_cluster;
    set('v82-clusters', below || above ? `${below?.center ?? 'n/a'} ↔ ${above?.center ?? 'n/a'}` : null);
    set('v82-clusters-copy', `Below strength ${below?.strength ?? 0}: ${Array.isArray(below?.labels) ? below.labels.join(', ') : 'none'} · above strength ${above?.strength ?? 0}: ${Array.isArray(above?.labels) ? above.labels.join(', ') : 'none'}.`);
    set('v82-dragon', first(v82?.scenarios?.continuation?.name, 'WITHHELD'));
    set('v82-dragon-copy', first(v82?.scenarios?.continuation?.condition, 'Continuation condition withheld.'));
    set('v82-hero', first(v82?.scenarios?.repair?.name, 'WITHHELD'));
    set('v82-hero-copy', first(v82?.scenarios?.repair?.condition, 'Repair condition withheld.'));
  }

  if (v83?.ok) {
    const down = v83?.downside ?? {};
    const up = v83?.upside ?? {};
    const active = String(v83?.dominant_state || '').includes('DOWN') ? down :
      String(v83?.dominant_state || '').includes('UP') ? up : null;
    set('v83-state', first(v83?.dominant_state, 'WITHHELD'));
    set('v83-state-copy', active ? `${active.close_acceptance_pct ?? 'n/a'}% closes beyond · quality ${active.quality_score ?? 'n/a'}/100 · extension ${active.extension_vs_prior_range ?? 'n/a'}× prior range.` : 'No active accepted or failed breakout state.');
    set('v83-time', active?.acceptance_minutes == null ? null : `${active.acceptance_minutes} min`);
    set('v83-time-copy', active ? `${active.consecutive_beyond ?? 0} consecutive five-minute closes beyond level ${active.level ?? 'n/a'}.` : 'Acceptance time unavailable.');
    set('v83-false-risk', first(active?.false_breakout_risk, 'NORMAL'));
    set('v83-false-copy', active ? `Reclaim closes: ${active.consecutive_reclaim ?? 0} · current close ${active.current_close ?? 'n/a'}.` : 'No active breakout risk state.');
  }
}

async function loadGoldSignalReputation() {
  const reputation = await read('public-gold-signal-reputation', 7000);
  if (!reputation?.ok) {
    set('v125-reputation-state', 'UNAVAILABLE');
    set('v125-reputation-copy', 'Signal reputation evidence is unavailable. No performance claim is inferred.');
    for (const id of ['v125-trigger-count','v125-directional-count','v125-human-count','v125-sample-count','v125-latest-signal','v125-horizon','v125-public-stats','v125-capital']) set(id, null);
    set('v125-detail', 'The Gold execution firewall remains authoritative.');
    return;
  }

  const pipeline = reputation?.pipeline ?? {};
  const latest = reputation?.latest_signal ?? {};
  const governance = reputation?.governance ?? {};
  const publicStats = latest?.public_statistics;

  set('v125-reputation-state', `SIGNAL REPUTATION · ${first(reputation?.state, 'COLLECTING')}`);
  set('v125-reputation-copy',
    latest?.statistics_withheld
      ? `Latest transition-linked reputation sample is n=${latest?.sample_count ?? 0}. Public statistics remain withheld until n≥${latest?.minimum_public_sample ?? 10}.`
      : 'Transition-linked statistics crossed the public sample floor. They remain descriptive evidence, not execution authority.'
  );
  set('v125-trigger-count', pipeline?.trigger_review_requests ?? 0);
  set('v125-directional-count', pipeline?.directional_review_candidates ?? 0);
  set('v125-human-count', pipeline?.human_review_events ?? 0);
  set('v125-sample-count', pipeline?.max_sample_count ?? 0);
  set('v125-latest-signal', first(latest?.source_state, latest?.signal_key, 'COLLECTING'));
  set('v125-horizon', latest?.horizon_minutes == null ? 'n/a' : `${latest.horizon_minutes}m`);
  set('v125-public-stats',
    latest?.statistics_withheld
      ? 'WITHHELD · SMALL N'
      : publicStats
        ? `HIT ${publicStats.observed_hit_rate_pct}% · WILSON ${publicStats.wilson_lower_pct}%`
        : 'WITHHELD'
  );
  set('v125-capital', first(latest?.capital_permission, governance?.capital_permission, '0R'));
  set('v125-detail',
    `Classifier ${first(reputation?.classifier_version, 'WITHHELD')} · review state: ${first(latest?.evidence_review_state, 'COLLECTING')} · human decisions: ${pipeline?.human_review_events ?? 0} · automatic weighting ${governance?.automatic_weighting ? 'ON' : 'OFF'} · automatic promotion ${governance?.automatic_promotion ? 'ON' : 'OFF'}.`
  );
}

async function loadGoldTriggerWatch() {
  const trigger = await read('public-gold-trigger-watch', 7000);
  if (!trigger?.ok) {
    set('v124-trigger-state', 'UNAVAILABLE');
    set('v124-trigger-copy', 'Trigger Watch is unavailable. No level interaction is inferred.');
    for (const id of ['v124-price','v124-long-distance','v124-short-distance','v124-capital','v124-long-review','v124-short-review']) set(id, null);
    set('v124-detail', 'The Gold execution firewall remains authoritative.');
    return;
  }

  const market = trigger?.market ?? {};
  const long = trigger?.long_watch ?? {};
  const short = trigger?.short_watch ?? {};
  const execution = trigger?.execution ?? {};

  set('v124-trigger-state', `TRIGGER WATCH · ${first(trigger?.state, 'WAIT_FOR_LEVEL')}`);
  set('v124-trigger-copy',
    market?.broker_execution_feed_required
      ? 'Distances below are COMEX structural distances from a delayed feed. Enter a fresh broker quote for broker-basis distances.'
      : 'Structural trigger distances are active. Broker confirmation is still required before any manual action.'
  );
  set('v124-price', market?.price);
  set('v124-long-distance',
    long?.distance_to_zone_points == null
      ? null
      : long?.location === 'INSIDE_RETEST_ZONE'
        ? 'INSIDE ZONE'
        : `${long.distance_to_zone_points} · ${first(long?.location, 'UNKNOWN')}`
  );
  set('v124-short-distance',
    short?.distance_to_threshold_points == null
      ? null
      : `${short.distance_to_threshold_points} · ${first(short?.location, 'UNKNOWN')}`
  );
  set('v124-capital', first(execution?.system_capital_permission, trigger?.governance?.capital_permission, '0R'));
  set('v124-long-review', long?.human_review_condition_reached ? 'REACHED · REVIEW ONLY' : 'NOT REACHED');
  set('v124-short-review', short?.human_review_condition_reached ? 'REACHED · REVIEW ONLY' : 'NOT REACHED');
  set('v124-detail',
    `Long: ${first(long?.location, 'UNKNOWN')} · Short: ${first(short?.location, 'UNKNOWN')} · acceptance is not inferred · machine execution ${execution?.machine_executable ? 'ENABLED' : 'DISABLED'}.`
  );
}

async function loadGoldTransitions() {
  const transition = await read('public-gold-transition-state', 7000);
  if (!transition?.ok) {
    set('v123-change-state', 'UNAVAILABLE');
    set('v123-change-copy', 'Transition intelligence is unavailable. No setup change is inferred.');
    for (const id of ['v123-event','v123-age','v123-data','v123-capital']) set(id, null);
    set('v123-detail', 'The Gold execution firewall remains authoritative.');
    return;
  }

  const material = transition?.latest_material_transition ?? {};
  const current = transition?.current ?? {};
  const data = transition?.data_quality ?? {};
  const state = first(transition?.state, 'STABLE');
  const age = material?.age_minutes;

  set('v123-change-state', `WHAT CHANGED · ${state}`);
  set('v123-change-copy',
    state === 'DATA_BLOCKED'
      ? 'A data-quality transition is blocking interpretation. Setup changes are not inferred while the market spine is unavailable.'
      : state === 'REVIEW_REQUIRED'
        ? 'A material setup transition requires human review. This does not itself grant capital permission.'
        : state === 'WATCH_CHANGE'
          ? 'A recent structural or level transition is active. Re-check the broker feed and current execution conditions.'
          : 'No fresh material setup transition is active. The desk remains in its current governed state.'
  );
  set('v123-event', first(material?.transition_code, transition?.latest_transition?.transition_code, 'NONE'));
  set('v123-age', age == null ? 'n/a' : `${age}m`);
  set('v123-data', data?.blocked ? 'BLOCKED' : first(data?.latest_event, 'CLEAR'));
  set('v123-capital', first(current?.capital_permission, transition?.governance?.capital_permission, '0R'));

  const fromState = material?.from_state;
  const toState = material?.to_state;
  const fromPrice = material?.from_price;
  const toPrice = material?.to_price;
  const delta = material?.price_delta;
  set('v123-detail',
    material?.transition_code
      ? `${first(material?.event_class, 'EVENT')} · ${material.transition_code} · ${fromState ?? 'n/a'} → ${toState ?? 'n/a'} · price ${fromPrice ?? 'n/a'} → ${toPrice ?? 'n/a'} · Δ ${delta ?? 'n/a'} · capital ${first(current?.capital_permission, '0R')}.`
      : 'No material transition has been frozen yet.'
  );
}

async function loadGoldOutcomeLearning() {
  const outcome = await read('public-gold-outcome-learning', 7000);
  if (!outcome?.ok) {
    set('v122-outcome-state', 'UNAVAILABLE');
    set('v122-outcome-copy', 'Forward outcome observations are unavailable. No performance result is inferred.');
    for (const id of ['v122-resolved','v122-15m','v122-eligible','v122-edge']) set(id, null);
    set('v122-latest', 'Outcome evidence withheld.');
    return;
  }

  const h15 = Array.isArray(outcome?.horizons)
    ? outcome.horizons.find((x: AnyJson) => Number(x?.horizon_minutes) === 15)
    : null;
  const latest = outcome?.latest ?? {};
  const calibration = outcome?.calibration ?? {};

  set('v122-outcome-state', h15?.calibration_state ? `OUTCOME LAB · ${h15.calibration_state}` : 'OUTCOME LAB');
  set('v122-outcome-copy',
    'Prospective Gold states are resolved by market timestamp at 15/30/60/120-minute horizons. Intrabar ordering and trade P&L are not inferred.'
  );
  set('v122-resolved', outcome?.resolved_outcome_count ?? 0);
  set('v122-15m', h15?.samples ?? 0);
  set('v122-eligible', outcome?.trade_eligible_source_count ?? 0);
  set('v122-edge', first(calibration?.edge_claims, 'WITHHELD'));

  const sourcePrice = latest?.source_price;
  const resolvedPrice = latest?.resolved_price;
  const delta = latest?.price_delta;
  const up = latest?.up_excursion;
  const down = latest?.down_excursion;
  set('v122-latest',
    latest?.horizon_minutes
      ? `${latest.horizon_minutes}m · ${first(latest?.source_desk_state, 'UNKNOWN')} · ${sourcePrice ?? 'n/a'} → ${resolvedPrice ?? 'n/a'} · Δ ${delta ?? 'n/a'} · up excursion ${up ?? 'n/a'} · down excursion ${down ?? 'n/a'} · sequence ${first(latest?.sequence_claim, 'NOT_INFERRED')}.`
      : 'No resolved forward window yet.'
  );
}

async function loadGoldLearning() {
  const learning = await read('public-gold-learning-state', 7000);
  if (!learning?.ok) {
    set('v119-learning-state', 'UNAVAILABLE');
    set('v119-learning-copy', 'Prospective ledger summary is unavailable. No learning evidence is inferred.');
    for (const id of ['v119-samples','v119-capture-health','v119-latest-state','v119-performance']) set(id, null);
    return;
  }

  const health = first(learning?.capture_health?.state, 'UNKNOWN');
  const samples = learning?.prospective_sample_count ?? null;
  const latest = learning?.latest ?? {};
  const age = learning?.capture_health?.last_capture_age_minutes;
  set('v119-learning-state', health === 'HEALTHY' ? 'LEARNING · HEALTHY' : `LEARNING · ${health}`);
  set('v119-learning-copy',
    `Append-only pre-outcome snapshots · latest capture ${age == null ? 'age withheld' : `${age} min ago`} · payloads SHA-256 fingerprinted.`
  );
  set('v119-samples', samples);
  set('v119-capture-health', health);
  set('v119-latest-state', first(latest?.desk_state, 'NO_SAMPLE'));
  set('v119-performance', first(learning?.methodology?.performance_claims, 'WITHHELD'));
}

async function refreshGoldSurface(reason: 'initial' | 'timer' | 'manual' | 'visibility' = 'timer') {
  if (goldRefreshBusy) return;
  goldRefreshBusy = true;
  set('v121-pulse-state', 'REFRESHING');
  set('v121-pulse-copy', reason === 'manual'
    ? 'Manual Gold refresh in progress.'
    : 'Refreshing the Gold desk and prospective learning heartbeat.');

  try {
    await loadGold();
    goldLastRefreshAt = Date.now();
    goldNextRefreshAt = goldLastRefreshAt + 60_000;
    set('v121-pulse-state', 'LIVE · 60s');
    set('v121-pulse-copy', 'Gold structure refreshes every 60 seconds while this page is active. Learning, outcome and transition intelligence update asynchronously so they cannot slow the execution desk.');
    void Promise.allSettled([
      loadGoldSignalReputation(),
      loadGoldTriggerWatch(),
      loadGoldTransitions(),
      loadGoldLearning(),
      loadGoldOutcomeLearning(),
    ]);
  } finally {
    goldRefreshBusy = false;
    renderGoldPulseClock();
  }
}

function startGoldPulse() {
  if (goldPulseStarted) return;
  goldPulseStarted = true;

  const button = byId('v121-refresh-now') as HTMLButtonElement | null;
  button?.addEventListener('click', () => void refreshGoldSurface('manual'));

  document.addEventListener('visibilitychange', () => {
    renderGoldPulseClock();
    if (!document.hidden && (!goldLastRefreshAt || Date.now() - goldLastRefreshAt >= 60_000)) {
      void refreshGoldSurface('visibility');
    }
  });

  window.setInterval(() => {
    renderGoldPulseClock();
  }, 1_000);

  window.setInterval(() => {
    if (!document.hidden) void refreshGoldSurface('timer');
  }, 60_000);
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
if (surface === 'gold-live') {
  startGoldPulse();
  void refreshGoldSurface('initial');
}
if (surface === 'visual-lab') void loadVisualLab();