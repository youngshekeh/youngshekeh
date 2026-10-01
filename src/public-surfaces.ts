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

function renderV132ShadowStudies(shadow: AnyJson) {
  const host = byId('v132-open-studies');
  if (!host) return;
  host.replaceChildren();

  const open = Array.isArray(shadow?.open_marks) ? shadow.open_marks : [];
  if (!open.length) {
    const empty = document.createElement('article');
    empty.className = 'shadow-study shadow-study-empty';
    const title = document.createElement('strong');
    title.textContent = 'NO OPEN SHADOW STUDIES';
    const copy = document.createElement('small');
    copy.textContent = 'V132 is waiting for the next governed level-transition event.';
    empty.append(title, copy);
    host.appendChild(empty);
    return;
  }

  for (const study of open.slice(0, 4)) {
    const card = document.createElement('article');
    card.className = 'shadow-study';

    const top = document.createElement('div');
    top.className = 'shadow-study-top';

    const side = document.createElement('span');
    const sideText = String(study?.side || 'UNKNOWN');
    side.className = `shadow-side ${sideText === 'LONG' ? 'shadow-side-long' : 'shadow-side-short'}`;
    side.textContent = sideText;

    const r = document.createElement('strong');
    const grossR = study?.unrealized_gross_r;
    r.textContent = grossR == null ? 'R WITHHELD' : `${Number(grossR) >= 0 ? '+' : ''}${grossR}R`;
    if (grossR != null) {
      r.classList.add(Number(grossR) >= 0 ? 'state-good' : 'state-bad');
    }

    top.append(side, r);

    const strategy = document.createElement('small');
    strategy.className = 'shadow-strategy';
    strategy.textContent = String(study?.strategy_code || 'SHADOW EVENT');

    const grid = document.createElement('div');
    grid.className = 'shadow-study-metrics';
    const metrics = [
      ['ENTRY', study?.entry_price],
      ['MARK', study?.current_delayed_mark],
      ['STOP', study?.stop_price],
      ['TARGET', study?.target_price],
    ];

    for (const [label, value] of metrics) {
      const cell = document.createElement('div');
      const l = document.createElement('span');
      l.textContent = String(label);
      const v = document.createElement('b');
      v.textContent = value == null ? 'WITHHELD' : String(value);
      cell.append(l, v);
      grid.appendChild(cell);
    }

    const foot = document.createElement('small');
    foot.className = 'shadow-study-foot';
    foot.textContent = 'Delayed COMEX research mark · not an executable quote';

    card.append(top, strategy, grid, foot);
    host.appendChild(card);
  }
}









async function loadV162ProspectiveCollisionRevalidation() {
  const live = await readLocal('/api/prospective-collision-revalidation', 20000);
  if (!live?.ok) {
    set('v162-state', 'LIVE REVALIDATION · FAIL CLOSED');
    set('v162-copy', 'The prospective collision revalidator is unavailable. The next scheduler candidate must remain blocked.');
    for (const id of ['v162-clear','v162-job','v162-move','v162-current-peers','v162-proposed-peers','v162-peer-delta','v162-overlaps','v162-live-match','v162-relief']) set(id, null);
    set('v162-reservations', 'RESERVED');
    set('v162-rescheduling', 'OFF');
    set('v162-orders', 'OFF');
    set('v162-capital', '0R');
    return;
  }

  const candidate = live?.candidate ?? {};
  const density = live?.live_density ?? {};
  const reserved = live?.controlled_experiment_reservations ?? {};
  const gate = live?.revalidation ?? {};
  const planner = live?.planner_context ?? {};
  const clear = Boolean(gate?.clear);
  const blockers = Array.isArray(gate?.blockers) ? gate.blockers.map((x: unknown) => String(x)) : [];

  set('v162-state', `LIVE REVALIDATION · ${first(live?.state, 'UNKNOWN')}`);
  set('v162-copy',
    clear
      ? 'The candidate survives live schedule, controlled-minute and peer-density revalidation. It may proceed only to the remaining admission gates.'
      : 'The planner recommendation is rejected by the current live graph. Historical relief cannot override controlled-minute reservations or unchanged peer density.'
  );
  set('v162-clear', clear ? 'CLEAR' : 'REJECT');
  set('v162-job', candidate?.jobname ?? 'NONE');
  set('v162-move', candidate?.jobname ? `${String(candidate?.planner_current_schedule || '?')} → ${String(candidate?.recommended_schedule || '?')}` : 'NONE');
  set('v162-current-peers', density?.current_peer_triggers ?? null);
  set('v162-proposed-peers', density?.proposed_peer_triggers ?? null);
  set('v162-peer-delta', density?.peer_trigger_delta ?? null);
  set('v162-overlaps', reserved?.overlap_count ?? null);
  set('v162-live-match', candidate?.exact_live_schedule_match ? 'MATCH' : 'DRIFT');
  set('v162-relief', planner?.estimated_relief_index == null ? 'WITHHELD' : Number(planner.estimated_relief_index).toFixed(2));
  set('v162-reservations', reserved?.clear ? 'CLEAR' : 'BLOCKED');
  set('v162-rescheduling', 'OFF');
  set('v162-orders', 'OFF');
  set('v162-capital', '0R');

  const host = byId('v162-blockers');
  if (host) {
    host.replaceChildren();
    if (!blockers.length) {
      const chip = document.createElement('span');
      chip.className = 'integrity-chip integrity-chip-clear';
      chip.textContent = 'NO LIVE REVALIDATION BLOCKERS';
      host.appendChild(chip);
    } else {
      for (const item of blockers.slice(0, 6)) {
        const chip = document.createElement('span');
        chip.className = 'integrity-chip integrity-chip-warn';
        chip.textContent = item.replaceAll('_', ' ');
        host.appendChild(chip);
      }
    }
  }

  set('v162-detail',
    `State ${String(live?.state || 'unknown')} · candidate ${String(candidate?.jobname || 'none')} · peers ${Number(density?.current_peer_triggers || 0)} → ${Number(density?.proposed_peer_triggers || 0)} · delta ${Number(density?.peer_trigger_delta || 0)} · controlled overlaps ${Number(reserved?.overlap_count || 0)} · live match ${candidate?.exact_live_schedule_match ? 'yes' : 'no'} · admission ${clear ? 'revalidation clear' : 'blocked'} · capital 0R.`
  );
}

async function loadV161SchedulerExperimentRegistry() {
  const registry = await readLocal('/api/scheduler-experiment-registry', 20000);
  if (!registry?.ok) {
    set('v161-state', 'EXPERIMENT REGISTRY · FAIL CLOSED');
    set('v161-copy', 'The scheduler experiment registry is unavailable. New scheduler mutation should remain locked.');
    for (const id of ['v161-chain','v161-total','v161-accepted','v161-observing','v161-violations','v161-latest','v161-lifecycle','v161-admission','v161-rollback-review']) set(id, null);
    set('v161-auto-rollback', 'OFF');
    set('v161-orders', 'OFF');
    set('v161-capital', '0R');
    return;
  }

  const summary = registry?.summary ?? {};
  const admission = registry?.authoritative_admission ?? {};
  const experiments = Array.isArray(registry?.experiments) ? registry.experiments : [];
  const violations = Number(summary?.chain_integrity_violations || 0);
  const accepted = Number(summary?.accepted || 0);
  const observing = Number(summary?.observing || 0);
  const rollbackReview = Number(summary?.rollback_recommended || 0);

  set('v161-state', `EXPERIMENT REGISTRY · ${first(registry?.state, 'UNKNOWN')}`);
  set('v161-copy',
    violations > 0
      ? 'The controlled scheduler experiment chain has an integrity violation. Further mutation must remain locked.'
      : observing > 0
        ? 'The experiment chain is internally consistent, but the newest mutation is still under observation.'
        : 'The experiment chain is internally consistent and all recorded experiments are accepted or rolled back.'
  );
  set('v161-chain', violations === 0 ? 'CLEAN' : 'LOCKED');
  set('v161-total', summary?.experiments_total ?? 0);
  set('v161-accepted', accepted);
  set('v161-observing', observing);
  set('v161-violations', violations);
  set('v161-latest', summary?.latest_experiment ?? 'NONE');
  set('v161-lifecycle', summary?.latest_lifecycle_state ?? 'WITHHELD');
  set('v161-admission',
    admission?.registry_does_not_evaluate_admission
      ? 'V159 SEPARATE'
      : admission?.admitted
        ? `${Number(admission?.gates_passed || 0)}/${Number(admission?.gate_count || 0)} READY`
        : `${Number(admission?.gates_passed || 0)}/${Number(admission?.gate_count || 0)} LOCKED`
  );
  set('v161-rollback-review', rollbackReview);
  set('v161-auto-rollback', 'OFF');
  set('v161-orders', 'OFF');
  set('v161-capital', '0R');

  const host = byId('v161-experiments');
  if (host) {
    host.replaceChildren();
    if (!experiments.length) {
      const chip = document.createElement('span');
      chip.className = 'integrity-chip integrity-chip-warn';
      chip.textContent = 'NO CONTROLLED EXPERIMENTS';
      host.appendChild(chip);
    } else {
      for (const exp of experiments.slice(0, 8)) {
        const chip = document.createElement('span');
        chip.className = exp?.chain_compliant ? 'integrity-chip integrity-chip-clear' : 'integrity-chip integrity-chip-warn';
        chip.textContent = `#${Number(exp?.sequence || 0)} ${String(exp?.jobname || 'job')} · ${String(exp?.previous_schedule || '?')} → ${String(exp?.governed_schedule || '?')} · ${String(exp?.lifecycle_state || 'UNKNOWN')} · rollback ${exp?.rollback_rehearsal?.ready ? 'READY' : 'LOCKED'}`;
        host.appendChild(chip);
      }
    }
  }

  set('v161-detail',
    `State ${String(registry?.state || 'unknown')} · experiments ${Number(summary?.experiments_total || 0)} · accepted ${accepted} · observing ${observing} · violations ${violations} · latest ${String(summary?.latest_experiment || 'none')} · V159 ${String(admission?.state || 'separate')} · admission authority externalized · auto mutation OFF · capital 0R.`
  );
}

async function loadV160LatestRollbackRehearsal() {
  const rollback = await readLocal('/api/latest-rollback-rehearsal', 20000);
  if (!rollback?.ok) {
    set('v160-state', 'LATEST ROLLBACK · FAIL CLOSED');
    set('v160-copy', 'The latest rollback rehearsal is unavailable. Further scheduler mutation should remain locked until rollback readiness is restored.');
    for (const id of ['v160-ready','v160-experiment','v160-live','v160-from','v160-to','v160-observer','v160-identity','v160-consistency','v160-recommended']) set(id, null);
    set('v160-drift-rule', 'REFUSED');
    set('v160-file', 'WITHHELD');
    set('v160-orders', 'OFF');
    set('v160-capital', '0R');
    return;
  }

  const latest = rollback?.latest_experiment ?? {};
  const target = rollback?.target ?? {};
  const rehearsal = rollback?.rehearsal ?? {};
  const sim = rollback?.simulated_rollback ?? {};
  const blockers = Array.isArray(rehearsal?.blockers) ? rehearsal.blockers.map((x: unknown) => String(x)) : [];
  const ready = Boolean(rehearsal?.ready);
  const recommended = Boolean(rehearsal?.rollback_recommended);

  set('v160-state', `LATEST ROLLBACK · ${first(rollback?.state, 'UNKNOWN')}`);
  set('v160-copy',
    recommended && ready
      ? 'The newest experiment has a rollback condition and V160 has verified its exact rollback path. Automatic rollback remains disabled.'
      : ready
        ? 'The newest experiment has an exact, rehearsed rollback path available if its post-change observer later requires it.'
        : 'The newest experiment rollback contract has a blocker. No further scheduler mutation should be admitted.'
  );
  set('v160-ready', ready ? 'READY' : 'LOCKED');
  set('v160-experiment', latest?.experiment ?? 'NONE');
  set('v160-live', target?.live_schedule ?? 'WITHHELD');
  set('v160-from', sim?.from_schedule ?? 'WITHHELD');
  set('v160-to', sim?.to_schedule ?? 'WITHHELD');
  set('v160-observer', latest?.observer_state ?? 'WITHHELD');
  set('v160-identity', target?.identity_match ? 'MATCH' : 'LOCKED');
  set('v160-consistency', target?.ledger_state_consistent ? 'CONSISTENT' : 'LOCKED');
  set('v160-recommended', recommended ? 'YES' : 'NO');
  set('v160-drift-rule', sim?.unknown_drift_refused ? 'REFUSED' : 'WITHHELD');
  set('v160-file', rehearsal?.rollback_file ? 'READY' : 'WITHHELD');
  set('v160-orders', 'OFF');
  set('v160-capital', '0R');

  const host = byId('v160-blockers');
  if (host) {
    host.replaceChildren();
    if (!blockers.length) {
      const chip = document.createElement('span');
      chip.className = 'integrity-chip integrity-chip-clear';
      chip.textContent = 'NO LATEST ROLLBACK CONTRACT BLOCKERS';
      host.appendChild(chip);
    } else {
      for (const item of blockers.slice(0, 6)) {
        const chip = document.createElement('span');
        chip.className = 'integrity-chip integrity-chip-warn';
        chip.textContent = item.replaceAll('_', ' ');
        host.appendChild(chip);
      }
    }
  }

  set('v160-detail',
    `State ${String(rollback?.state || 'unknown')} · experiment ${String(latest?.experiment || 'none')} · observer ${String(latest?.observer_state || 'n/a')} · live ${String(target?.live_schedule || 'n/a')} · simulated ${String(sim?.from_schedule || 'n/a')} → ${String(sim?.to_schedule || 'n/a')} · identity ${target?.identity_match ? 'match' : 'blocked'} · ledger ${target?.ledger_state_consistent ? 'consistent' : 'blocked'} · rollback recommended ${recommended ? 'yes' : 'no'} · auto rollback OFF · capital 0R.`
  );
}

async function loadV159LatestExperimentAdmission() {
  const gate = await readLocal('/api/latest-experiment-admission', 20000);
  if (!gate?.ok) {
    set('v159-state', 'LATEST ADMISSION · FAIL CLOSED');
    set('v159-copy', 'The latest-experiment admission governor is unavailable. No further scheduler mutation is permitted.');
    for (const id of ['v159-gate-score','v159-admitted','v159-latest','v159-cooldown','v159-qa','v159-platform','v159-infra','v159-baseline','v159-next-job']) set(id, null);
    set('v159-observer', 'LOCKED');
    set('v159-next-move', 'WITHHELD');
    set('v159-orders', 'OFF');
    set('v159-capital', '0R');
    return;
  }

  const admission = gate?.admission ?? {};
  const gates = gate?.gates ?? {};
  const latest = gate?.latest_mutation ?? {};
  const qa = gate?.qa ?? {};
  const platform = gate?.platform ?? {};
  const infra = gate?.infrastructure ?? {};
  const next = gate?.next_candidate ?? {};
  const prospective = gate?.prospective_revalidation ?? {};
  const passed = Number(admission?.gates_passed || 0);
  const total = Number(admission?.gate_count || 0);
  const admitted = Boolean(admission?.admitted);
  const age = Number(latest?.minutes_since);

  set('v159-state', `LATEST ADMISSION · ${first(gate?.state, 'UNKNOWN')}`);
  set('v159-copy',
    admitted
      ? 'The newest scheduler experiment has completed its own acceptance window and every current admission gate passes. A future candidate may enter human review only.'
      : 'The newest scheduler experiment is authoritative. Older healthy experiments cannot authorize another mutation while any latest-experiment gate remains locked.'
  );
  set('v159-gate-score', `${passed}/${total}`);
  set('v159-admitted', admitted ? 'REVIEW ELIGIBLE' : 'LOCKED');
  set('v159-latest', latest?.experiment ?? 'NONE');
  set('v159-cooldown', Number.isFinite(age) ? `${age.toFixed(1)}m / ${Number(admission?.minimum_minutes_between_mutations || 75)}m` : 'WITHHELD');
  set('v159-qa', gates?.qa_fresh_pass ? `PASS · ${Number(qa?.age_minutes || 0).toFixed(1)}m` : 'LOCKED');
  set('v159-platform', gates?.platform_clear ? 'CLEAR' : String(platform?.v156_state || 'LOCKED'));
  set('v159-infra', gates?.infrastructure_normal ? 'NORMAL' : 'LOCKED');
  set('v159-baseline', gates?.baseline_eligible ? 'ELIGIBLE' : 'LOCKED');
  set('v159-next-job', next?.jobname ?? 'NONE');
  set('v159-observer', latest?.observer_state ?? 'WITHHELD');
  set('v159-next-move', next?.jobname ? `${String(next?.current_schedule || '?')} → ${String(next?.recommended_schedule || '?')}` : 'NONE');
  set('v159-orders', 'OFF');
  set('v159-capital', '0R');

  const host = byId('v159-gates');
  if (host) {
    host.replaceChildren();
    const items = [
      [Boolean(gates?.latest_experiment_accepted), 'LATEST SHIFT ACCEPTED'],
      [Boolean(gates?.cooldown_mature), '75M COOLDOWN'],
      [Boolean(gates?.qa_fresh_pass), 'FRESH QA PASS'],
      [Boolean(gates?.platform_clear), 'PLATFORM CLEAR'],
      [Boolean(gates?.infrastructure_normal), 'INFRA NORMAL'],
      [Boolean(gates?.baseline_eligible), 'V146.1 ELIGIBLE'],
      [Boolean(gates?.prospective_collision_revalidation), 'LIVE COLLISION REVALIDATION'],
      [Boolean(gates?.candidate_exact_schedule_match), 'CANDIDATE EXACT MATCH']
    ];
    for (const [pass,label] of items) {
      const chip = document.createElement('span');
      chip.className = pass ? 'integrity-chip integrity-chip-clear' : 'integrity-chip integrity-chip-warn';
      chip.textContent = `${String(label)} · ${pass ? 'PASS' : 'LOCKED'}`;
      host.appendChild(chip);
    }
  }

  const reasons = Array.isArray(admission?.block_reasons) ? admission.block_reasons.join(', ').replaceAll('_',' ') : 'none';
  set('v159-detail',
    `Admission ${admitted ? 'review eligible' : 'locked'} · gates ${passed}/${total} · latest ${String(latest?.experiment || 'none')} ${String(latest?.event || '')} · observer ${String(latest?.observer_state || 'n/a')} · age ${Number.isFinite(age) ? age.toFixed(1) : 'n/a'}m · next ${String(next?.jobname || 'none')} · live revalidation ${String(prospective?.state || 'n/a')} · blockers ${reasons} · capital 0R.`
  );
}

async function loadV158MemberAlertPostShiftObserver() {
  const obs = await readLocal('/api/member-alert-post-shift-observer', 20000);
  if (!obs?.ok) {
    set('v158-state', 'MEMBER ALERT SHIFT · FAIL CLOSED');
    set('v158-copy', 'The V157 post-shift observer is unavailable. No subsequent scheduler mutation is permitted.');
    for (const id of ['v158-runs','v158-schedule','v158-cron-ok','v158-receipts','v158-gap','v158-cron-fail','v158-business-fail','v158-platform','v158-age']) set(id, null);
    set('v158-rollback', 'STANDBY');
    set('v158-next-review', 'LOCKED');
    set('v158-orders', 'OFF');
    set('v158-capital', '0R');
    return;
  }

  const plan = obs?.plan ?? {};
  const post = obs?.post_change ?? {};
  const system = obs?.system ?? {};
  const gate = obs?.success_gate ?? {};
  const age = Number(plan?.minutes_since_apply);
  const rollback = Boolean(gate?.rollback_recommended);
  const eligible = Boolean(gate?.next_plan_review_eligible);

  set('v158-state', `MEMBER ALERT SHIFT · ${first(obs?.state, 'UNKNOWN')}`);
  set('v158-copy',
    rollback
      ? 'V157 has tripped a target or receipt rollback condition. Further mutation is locked pending review of the exact V157 rollback path.'
      : obs?.state === 'PLATFORM_GUARD_OBSERVATION_SUSPENDED'
        ? 'An external quota or guard condition is active. Observation is suspended without blaming the V157 phase shift or forcing rollback.'
        : eligible
          ? 'V157 has survived the required governed runs, business receipts and observation window. A future candidate may return to human review.'
          : 'V157 is still collecting real hourly cron and first-party receipt evidence. The next scheduler mutation remains locked.'
  );

  set('v158-runs', post?.cron_runs ?? 0);
  set('v158-schedule', plan?.live_schedule ?? 'WITHHELD');
  set('v158-cron-ok', post?.cron_succeeded ?? 0);
  set('v158-receipts', post?.business_succeeded ?? 0);
  set('v158-gap', post?.business_receipt_gap ?? 0);
  set('v158-cron-fail', post?.cron_failed ?? 0);
  set('v158-business-fail', post?.business_failed ?? 0);
  set('v158-platform', gate?.platform_clear ? 'CLEAR' : String(system?.v156_state || 'LOCKED'));
  set('v158-age', Number.isFinite(age) ? `${age.toFixed(1)}m / ${Number(gate?.minimum_observation_minutes || 75)}m` : 'WITHHELD');
  set('v158-rollback', rollback ? 'RECOMMENDED' : 'STANDBY');
  set('v158-next-review', eligible ? 'ELIGIBLE' : 'LOCKED');
  set('v158-orders', 'OFF');
  set('v158-capital', '0R');

  const host = byId('v158-gates');
  if (host) {
    host.replaceChildren();
    const items = [
      [Number(post?.cron_succeeded || 0) >= Number(gate?.minimum_successful_governed_runs || 2), '2 GOVERNED RUNS'],
      [Number(post?.business_succeeded || 0) >= Number(gate?.minimum_successful_business_receipts || 2), '2 BUSINESS RECEIPTS'],
      [Boolean(gate?.platform_clear), 'PLATFORM CLEAR'],
      [Number(post?.cron_failed || 0) === 0, 'ZERO CRON FAILURES'],
      [Number(post?.business_failed || 0) === 0, 'ZERO BUSINESS FAILURES'],
      [Number(post?.business_receipt_gap || 0) === 0, 'ZERO RECEIPT GAP'],
      [Boolean(gate?.zero_schedule_drift), 'ZERO SCHEDULE DRIFT'],
      [Number.isFinite(age) && age >= Number(gate?.minimum_observation_minutes || 75), '75M OBSERVATION']
    ];
    for (const [pass,label] of items) {
      const chip = document.createElement('span');
      chip.className = pass ? 'integrity-chip integrity-chip-clear' : 'integrity-chip integrity-chip-warn';
      chip.textContent = `${String(label)} · ${pass ? 'PASS' : 'LOCKED'}`;
      host.appendChild(chip);
    }
  }

  set('v158-detail',
    `State ${String(obs?.state || 'unknown')} · schedule ${String(plan?.live_schedule || 'n/a')} · cron ${Number(post?.cron_succeeded || 0)}/${Number(post?.cron_runs || 0)} succeeded · receipts ${Number(post?.business_succeeded || 0)} · failures ${Number(post?.cron_failed || 0) + Number(post?.business_failed || 0)} · receipt gap ${Number(post?.business_receipt_gap || 0)} · platform ${gate?.platform_clear ? 'clear' : 'suspended'} · rollback ${rollback ? 'RECOMMENDED' : 'standby'} · next plan ${eligible ? 'review eligible' : 'locked'} · capital 0R.`
  );
}

async function loadV156QuotaGuardRecoveryShadow() {
  const recovery = await readLocal('/api/quota-guard-recovery-shadow', 20000);
  if (!recovery?.ok) {
    set('v156-state', 'QUOTA RECOVERY · FAIL CLOSED');
    set('v156-copy', 'The quota guard recovery engine is unavailable. Guard restoration and further scheduler mutation cannot be certified.');
    for (const id of ['v156-restored','v156-quota','v156-shed','v156-paused','v156-mismatch','v156-enforcer','v156-signal-age','v156-v1461','v156-pressure']) set(id, null);
    set('v156-handoff', 'LOCKED');
    set('v156-auto-release', 'OFF');
    set('v156-orders', 'OFF');
    set('v156-capital', '0R');
    return;
  }

  const quota = recovery?.quota ?? {};
  const shed = recovery?.load_shedding ?? {};
  const guard = recovery?.guard ?? {};
  const enforcer = recovery?.enforcer ?? {};
  const downstream = recovery?.downstream ?? {};
  const rec = recovery?.recovery ?? {};
  const blockers = Array.isArray(rec?.blockers) ? rec.blockers.map((x: unknown) => String(x)) : [];
  const restored = Number(guard?.restored_active_rows || 0);
  const expected = Number(guard?.expected_restore_targets || 0);
  const pressure = Number(downstream?.v147_pressure_score);

  set('v156-state', `QUOTA RECOVERY · ${first(recovery?.state, 'UNKNOWN')}`);
  set('v156-copy',
    recovery?.state === 'RECOVERY_CONFIRMED_RESTORED'
      ? 'The quota signal cleared, V72 ran successfully, all previously active guard targets were restored, and the live cron graph matches the guard ledger.'
      : recovery?.state === 'RECOVERY_PENDING_GUARD_RELEASE'
        ? 'The quota signal has cleared but V72 is still inside the recovery grace window. Guard restoration is pending and no manual override is warranted.'
        : recovery?.state === 'QUOTA_RESTRICTED_LOAD_SHEDDING_CONSISTENT'
          ? 'The platform is quota-restricted and V72 load shedding is internally consistent. Guarded jobs remain intentionally paused.'
          : 'Quota recovery integrity has a blocker. No manual guard release or scheduler admission is permitted from this surface.'
  );

  set('v156-restored', `${restored}/${expected}`);
  set('v156-quota', quota?.restricted ? 'RESTRICTED' : String(quota?.state || 'UNKNOWN').toUpperCase());
  set('v156-shed', String(shed?.state || 'UNKNOWN').toUpperCase());
  set('v156-paused', guard?.paused_rows ?? null);
  set('v156-mismatch', guard?.mismatch_rows ?? null);
  set('v156-enforcer', enforcer?.healthy ? 'HEALTHY' : 'LOCKED');
  set('v156-signal-age', quota?.age_minutes == null ? 'WITHHELD' : `${Number(quota.age_minutes).toFixed(1)}m`);
  set('v156-v1461', downstream?.v1461_state ?? 'WITHHELD');
  set('v156-pressure', Number.isFinite(pressure) ? `${pressure}/100` : 'WITHHELD');
  set('v156-handoff', recovery?.state === 'RECOVERY_CONFIRMED_RESTORED' ? 'CONFIRMED' : recovery?.state === 'QUOTA_RESTRICTED_LOAD_SHEDDING_CONSISTENT' ? 'PROTECTED' : 'LOCKED');
  set('v156-auto-release', 'OFF');
  set('v156-orders', 'OFF');
  set('v156-capital', '0R');

  const host = byId('v156-blockers');
  if (host) {
    host.replaceChildren();
    if (!blockers.length) {
      const chip = document.createElement('span');
      chip.className = 'integrity-chip integrity-chip-clear';
      chip.textContent = 'NO RECOVERY INTEGRITY BLOCKERS';
      host.appendChild(chip);
    } else {
      for (const item of blockers.slice(0, 6)) {
        const chip = document.createElement('span');
        chip.className = 'integrity-chip integrity-chip-warn';
        chip.textContent = item.replaceAll('_', ' ');
        host.appendChild(chip);
      }
    }
  }

  set('v156-detail',
    `State ${String(recovery?.state || 'unknown')} · quota ${String(quota?.state || 'n/a')} · restored ${restored}/${expected} · paused ${Number(guard?.paused_rows || 0)} · mismatches ${Number(guard?.mismatch_rows || 0)} · enforcer ${enforcer?.healthy ? 'healthy' : 'locked'} · V146.1 ${String(downstream?.v1461_state || 'n/a')} · V147 pressure ${Number.isFinite(pressure) ? pressure : 'n/a'}/100 · auto release OFF · capital 0R.`
  );
}

async function loadV154RollbackRehearsalShadow() {
  const rollback = await readLocal('/api/rollback-rehearsal-shadow', 20000);
  if (!rollback?.ok) {
    set('v154-state', 'ROLLBACK · FAIL CLOSED');
    set('v154-copy', 'The rollback rehearsal engine is unavailable. No rollback or further scheduler mutation is permitted.');
    for (const id of ['v154-ready','v154-live','v154-from','v154-to','v154-recommended','v154-identity','v154-consistency','v154-primitive']) set(id, null);
    set('v154-drift-rule', 'REFUSED');
    set('v154-rollback-file', 'WITHHELD');
    set('v154-auto-rollback', 'OFF');
    set('v154-orders', 'OFF');
    set('v154-capital', '0R');
    return;
  }

  const rehearsal = rollback?.rehearsal ?? {};
  const target = rollback?.target ?? {};
  const sim = rollback?.simulated_rollback ?? {};
  const blockers = Array.isArray(rehearsal?.blockers) ? rehearsal.blockers.map((x: unknown) => String(x)) : [];
  const ready = Boolean(rehearsal?.ready);
  const recommended = Boolean(rehearsal?.rollback_recommended);

  set('v154-state', `ROLLBACK · ${first(rollback?.state, 'UNKNOWN')}`);
  set('v154-copy',
    recommended && ready
      ? 'The post-shift observer recommends rollback and V154 has verified the exact rollback path. Automatic rollback remains disabled.'
      : ready
        ? 'The exact rollback path is rehearsed and ready if a governed rollback is later required. No rollback is currently recommended.'
        : 'The rollback path has a blocker. Scheduler mutation remains locked until the rollback contract is restored.'
  );
  set('v154-ready', ready ? 'READY' : 'LOCKED');
  set('v154-live', target?.live_schedule ?? 'WITHHELD');
  set('v154-from', sim?.from_schedule ?? 'WITHHELD');
  set('v154-to', sim?.to_schedule ?? 'WITHHELD');
  set('v154-recommended', recommended ? 'YES' : 'NO');
  set('v154-identity', target?.identity_match ? 'MATCH' : 'LOCKED');
  set('v154-consistency', target?.ledger_state_consistent ? 'CONSISTENT' : 'LOCKED');
  set('v154-primitive', rehearsal?.rollback_primitive_available ? 'AVAILABLE' : 'WITHHELD');
  set('v154-drift-rule', sim?.unknown_drift_refused ? 'REFUSED' : 'WITHHELD');
  set('v154-rollback-file', rehearsal?.rollback_file ? 'READY' : 'WITHHELD');
  set('v154-auto-rollback', 'OFF');
  set('v154-orders', 'OFF');
  set('v154-capital', '0R');

  const host = byId('v154-blockers');
  if (host) {
    host.replaceChildren();
    if (!blockers.length) {
      const chip = document.createElement('span');
      chip.className = 'integrity-chip integrity-chip-clear';
      chip.textContent = 'NO ROLLBACK CONTRACT BLOCKERS';
      host.appendChild(chip);
    } else {
      for (const item of blockers.slice(0, 6)) {
        const chip = document.createElement('span');
        chip.className = 'integrity-chip integrity-chip-warn';
        chip.textContent = item.replaceAll('_', ' ');
        host.appendChild(chip);
      }
    }
  }

  set('v154-detail',
    `State ${String(rollback?.state || 'unknown')} · live ${String(target?.live_schedule || 'n/a')} · simulated ${String(sim?.from_schedule || 'n/a')} → ${String(sim?.to_schedule || 'n/a')} · identity ${target?.identity_match ? 'match' : 'blocked'} · ledger ${target?.ledger_state_consistent ? 'consistent' : 'blocked'} · rollback recommended ${recommended ? 'yes' : 'no'} · auto rollback OFF · capital 0R.`
  );
}

async function loadV153SchedulerMutationAdmission() {
  const gate = await readLocal('/api/scheduler-mutation-admission', 20000);
  if (!gate?.ok) {
    set('v153-state', 'ADMISSION · FAIL CLOSED');
    set('v153-copy', 'The mutation admission governor is unavailable. No further scheduler change is permitted.');
    for (const id of ['v153-gate-score','v153-admitted','v153-cooldown','v153-qa','v153-infra','v153-previous','v153-baseline','v153-next-job','v153-next-move']) set(id, null);
    set('v153-experiments', 'ONE MAX');
    set('v153-human', 'REQUIRED');
    set('v153-orders', 'OFF');
    set('v153-capital', '0R');
    return;
  }

  const admission = gate?.admission ?? {};
  const gates = gate?.gates ?? {};
  const cooldown = gate?.cooldown ?? {};
  const qa = gate?.qa ?? {};
  const previous = gate?.previous_shift ?? {};
  const infrastructure = gate?.infrastructure ?? {};
  const next = gate?.next_candidate ?? {};
  const passed = Number(admission?.gates_passed || 0);
  const total = Number(admission?.gate_count || 0);
  const admitted = Boolean(admission?.admitted);

  set('v153-state', `ADMISSION · ${first(gate?.state, 'UNKNOWN')}`);
  set('v153-copy',
    admitted
      ? 'All scheduler admission gates pass. The next candidate may enter human-controlled planning, but V153 still cannot apply it.'
      : 'A next candidate may exist, but at least one mutation admission gate is locked. No second scheduler change is permitted.'
  );

  set('v153-gate-score', `${passed}/${total}`);
  set('v153-admitted', admitted ? 'REVIEW ELIGIBLE' : 'LOCKED');
  set('v153-cooldown', `${Number(cooldown?.minutes_since_last_mutation || 0).toFixed(1)}m / ${Number(cooldown?.minimum_minutes || 45)}m`);
  set('v153-qa', gates?.qa_fresh_pass ? `PASS · ${Number(qa?.age_minutes || 0).toFixed(1)}m` : 'LOCKED');
  set('v153-infra', gates?.infrastructure_normal ? 'NORMAL' : 'LOCKED');
  set('v153-previous', gates?.previous_shift_healthy ? 'HEALTHY' : String(previous?.state || 'LOCKED'));
  set('v153-baseline', gates?.v1461_still_improved ? 'IMPROVED' : 'LOCKED');
  set('v153-next-job', next?.jobname ?? 'NONE');
  set('v153-next-move', next?.jobname ? `${String(next?.current_schedule || '?')} → ${String(next?.recommended_schedule || '?')}` : 'NONE');
  set('v153-experiments', 'ONE MAX');
  set('v153-human', 'REQUIRED');
  set('v153-orders', 'OFF');
  set('v153-capital', '0R');

  const host = byId('v153-gates');
  if (host) {
    host.replaceChildren();
    const items = [
      [Boolean(gates?.previous_shift_healthy), 'PREVIOUS SHIFT HEALTHY'],
      [Boolean(gates?.cooldown_mature), '45M COOLDOWN'],
      [Boolean(gates?.qa_fresh_pass), 'FRESH QA PASS'],
      [Boolean(gates?.infrastructure_normal), 'INFRA NORMAL'],
      [Boolean(gates?.v1461_still_improved), 'V146.1 IMPROVED'],
      [Boolean(gates?.candidate_exact_schedule_match), 'CANDIDATE EXACT MATCH']
    ];
    for (const [pass,label] of items) {
      const chip = document.createElement('span');
      chip.className = pass ? 'integrity-chip integrity-chip-clear' : 'integrity-chip integrity-chip-warn';
      chip.textContent = `${String(label)} · ${pass ? 'PASS' : 'LOCKED'}`;
      host.appendChild(chip);
    }
  }

  const reasons = Array.isArray(admission?.block_reasons) ? admission.block_reasons.join(', ').replaceAll('_',' ') : 'none';
  set('v153-detail',
    `Admission ${admitted ? 'review eligible' : 'locked'} · gates ${passed}/${total} · cooldown ${Number(cooldown?.minutes_since_last_mutation || 0).toFixed(1)}m · QA ${String(qa?.state || 'n/a')} · infrastructure ${String(infrastructure?.v147_state || 'n/a')} · previous ${String(previous?.state || 'n/a')} · next ${String(next?.jobname || 'none')} · blockers ${reasons} · capital 0R.`
  );
}

async function loadV152PostShiftObserver() {
  const obs = await readLocal('/api/post-shift-observer', 20000);
  if (!obs?.ok) {
    set('v152-state', 'POST-SHIFT · FAIL CLOSED');
    set('v152-copy', 'The post-shift observer is unavailable. A second scheduler mutation is not permitted.');
    for (const id of ['v152-runs','v152-schedule','v152-cron-ok','v152-receipts','v152-gap','v152-cron-fail','v152-business-fail','v152-pressure','v152-age']) set(id, null);
    set('v152-rollback', 'STANDBY');
    set('v152-next-review', 'LOCKED');
    set('v152-orders', 'OFF');
    set('v152-capital', '0R');
    return;
  }

  const plan = obs?.plan ?? {};
  const post = obs?.post_change ?? {};
  const system = obs?.system ?? {};
  const gate = obs?.success_gate ?? {};
  const age = Number(plan?.minutes_since_apply);
  const pressure = Number(system?.v147_pressure_score);
  const rollback = Boolean(gate?.rollback_recommended);
  const eligible = Boolean(gate?.next_plan_review_eligible);

  set('v152-state', `POST-SHIFT · ${first(obs?.state, 'UNKNOWN')}`);
  set('v152-copy',
    rollback
      ? 'The governed target has tripped a rollback condition. Do not advance scheduler changes until the exact V151.1 rollback path is reviewed.'
      : eligible
        ? 'The governed phase has survived the post-change acceptance window. A future scheduler candidate may return to human review, but automatic mutation remains disabled.'
        : 'The governed phase is still collecting real cron and first-party business receipt evidence. The next scheduler mutation remains locked.'
  );

  set('v152-runs', post?.cron_runs ?? 0);
  set('v152-schedule', plan?.live_schedule ?? 'WITHHELD');
  set('v152-cron-ok', post?.cron_succeeded ?? 0);
  set('v152-receipts', post?.business_succeeded ?? 0);
  set('v152-gap', post?.business_receipt_gap ?? 0);
  set('v152-cron-fail', post?.cron_failed ?? 0);
  set('v152-business-fail', post?.business_failed ?? 0);
  set('v152-pressure', Number.isFinite(pressure) ? `${pressure}/100` : 'WITHHELD');
  set('v152-age', Number.isFinite(age) ? `${age.toFixed(1)}m / 45m` : 'WITHHELD');
  set('v152-rollback', rollback ? 'RECOMMENDED' : 'STANDBY');
  set('v152-next-review', eligible ? 'ELIGIBLE' : 'LOCKED');
  set('v152-orders', 'OFF');
  set('v152-capital', '0R');

  const host = byId('v152-gates');
  if (host) {
    host.replaceChildren();
    const gates = [
      [post?.cron_succeeded >= 2, '2 GOVERNED RUNS'],
      [post?.business_succeeded >= 2, '2 BUSINESS RECEIPTS'],
      [Number(post?.cron_failed || 0) === 0, 'ZERO CRON FAILURES'],
      [Number(post?.business_failed || 0) === 0, 'ZERO BUSINESS FAILURES'],
      [Number(post?.business_receipt_gap || 0) === 0, 'ZERO RECEIPT GAP'],
      [Boolean(gate?.zero_schedule_drift), 'ZERO SCHEDULE DRIFT'],
      [Number.isFinite(age) && age >= Number(gate?.minimum_observation_minutes || 45), '45M OBSERVATION']
    ];
    for (const [pass,label] of gates) {
      const chip = document.createElement('span');
      chip.className = pass ? 'integrity-chip integrity-chip-clear' : 'integrity-chip integrity-chip-warn';
      chip.textContent = `${String(label)} · ${pass ? 'PASS' : 'LOCKED'}`;
      host.appendChild(chip);
    }
  }

  set('v152-detail',
    `State ${String(obs?.state || 'unknown')} · schedule ${String(plan?.live_schedule || 'n/a')} · cron ${Number(post?.cron_succeeded || 0)}/${Number(post?.cron_runs || 0)} succeeded · receipts ${Number(post?.business_succeeded || 0)} · failures ${Number(post?.cron_failed || 0) + Number(post?.business_failed || 0)} · receipt gap ${Number(post?.business_receipt_gap || 0)} · V147 pressure ${Number.isFinite(pressure) ? pressure : 'n/a'}/100 · rollback ${rollback ? 'RECOMMENDED' : 'standby'} · next plan ${eligible ? 'review eligible' : 'locked'} · capital 0R.`
  );
}

async function loadV151SingleCandidatePlanShadow() {
  const plan = await readLocal('/api/single-candidate-plan-shadow', 20000);
  if (!plan?.ok) {
    set('v151-state', 'CONTROLLED PLAN · FAIL CLOSED');
    set('v151-copy', 'The single-candidate planner is unavailable. No scheduler mutation is permitted.');
    for (const id of ['v151-shift','v151-job','v151-current','v151-proposed','v151-rollback','v151-relief','v151-coverage','v151-success','v151-v1461-age']) set(id, null);
    set('v151-scope', 'ONE JOB MAX');
    set('v151-rescheduling', 'OFF');
    set('v151-orders', 'OFF');
    set('v151-capital', '0R');
    return;
  }

  const selected = plan?.plan ?? {};
  const deps = plan?.dependencies ?? {};
  const gates = plan?.promotion_gate ?? {};
  const observation = Number(deps?.v1461_observation_minutes);
  const delta = Number(selected?.delta_minutes);
  const relief = Number(selected?.estimated_relief_index);
  const coverage = Number(selected?.receipt_coverage_pct);
  const success = Number(selected?.receipt_success_pct);

  set('v151-state', `CONTROLLED PLAN · ${first(plan?.state, 'UNKNOWN')}`);
  set('v151-copy',
    plan?.state === 'READY_FOR_HUMAN_CONTROLLED_APPLY'
      ? 'Exactly one rollback-ready scheduler candidate has cleared the evidence chain. Automatic application remains disabled.'
      : selected?.jobname
        ? 'A single candidate is selected, but the V146.1 maturity or improvement gate is still locking application.'
        : 'No candidate currently clears the combined collision, dependency, SLA and one-job policy screens.'
  );

  set('v151-shift', Number.isFinite(delta) ? (delta > 0 ? `+${delta}` : String(delta)) : '--');
  set('v151-job', selected?.jobname ?? 'NONE');
  set('v151-current', selected?.current_schedule ?? 'WITHHELD');
  set('v151-proposed', selected?.recommended_schedule ?? 'WITHHELD');
  set('v151-rollback', selected?.rollback_ready ? selected?.rollback_schedule : 'WITHHELD');
  set('v151-relief', Number.isFinite(relief) ? relief.toFixed(2) : 'WITHHELD');
  set('v151-coverage', Number.isFinite(coverage) ? `${coverage.toFixed(0)}%` : 'WITHHELD');
  set('v151-success', Number.isFinite(success) ? `${success.toFixed(0)}%` : 'WITHHELD');
  set('v151-v1461-age', Number.isFinite(observation) ? `${observation.toFixed(1)}m / 60m` : 'WITHHELD');
  set('v151-scope', 'ONE JOB MAX');
  set('v151-rescheduling', 'OFF');
  set('v151-orders', 'OFF');
  set('v151-capital', '0R');

  const host = byId('v151-gates');
  if (host) {
    host.replaceChildren();
    const gateItems = [
      [Number.isFinite(observation) && observation >= Number(gates?.minimum_v1461_observation_minutes || 60), 'V146.1 MATURITY'],
      [deps?.v1461_state === gates?.requires_v1461_state, 'PEAK SPREAD IMPROVED'],
      [Number(deps?.v1461_failures_since_apply || 0) === 0, 'ZERO FAILURES'],
      [Number(deps?.v1461_schedule_drift_jobs || 0) === 0, 'ZERO DRIFT'],
      [Boolean(selected?.rollback_ready), 'ROLLBACK READY'],
      [Boolean(selected?.jobname), 'SINGLE CANDIDATE']
    ];
    for (const [pass,label] of gateItems) {
      const chip = document.createElement('span');
      chip.className = pass ? 'integrity-chip integrity-chip-clear' : 'integrity-chip integrity-chip-warn';
      chip.textContent = `${String(label)} · ${pass ? 'PASS' : 'LOCKED'}`;
      host.appendChild(chip);
    }
  }

  set('v151-detail',
    `Candidate ${String(selected?.jobname || 'none')} · ${String(selected?.current_schedule || 'n/a')} → ${String(selected?.recommended_schedule || 'n/a')} · rollback ${String(selected?.rollback_schedule || 'n/a')} · relief ${Number.isFinite(relief) ? relief.toFixed(2) : 'n/a'} · V146.1 ${Number.isFinite(observation) ? observation.toFixed(1) : 'n/a'}m · auto apply OFF · orders OFF · capital 0R.`
  );
}

async function loadV150NetworkSlaEvidenceShadow() {
  const sla = await readLocal('/api/network-sla-evidence-shadow', 20000);
  if (!sla?.ok) {
    set('v150-state', 'NETWORK SLA · FAIL CLOSED');
    set('v150-copy', 'The network SLA evidence engine is unavailable. No network candidate may advance to controlled scheduling review.');
    for (const id of ['v150-cleared','v150-audited','v150-cleared-count','v150-protected','v150-incomplete','v150-failures','v150-latency','v150-v1461-age']) set(id, null);
    set('v150-payments', 'PROTECTED');
    set('v150-rescheduling', 'OFF');
    set('v150-orders', 'OFF');
    set('v150-capital', '0R');
    return;
  }

  const summary = sla?.summary ?? {};
  const deps = sla?.dependencies ?? {};
  const thresholds = sla?.thresholds ?? {};
  const evidence = Array.isArray(sla?.evidence) ? sla.evidence : [];
  const cleared = Number(summary?.network_sla_cleared_candidates || 0);
  const observation = Number(deps?.v1461_observation_minutes);

  set('v150-state', `NETWORK SLA · ${first(sla?.state, 'UNKNOWN')}`);
  set('v150-copy',
    sla?.state === 'NETWORK_SLA_CANDIDATES_READY_FOR_CONTROLLED_PLAN_REVIEW'
      ? 'Network SLA evidence is strong for at least one non-payment workflow and the V146.1 observation gate has matured. Candidates may proceed only to a rollback-controlled human review plan.'
      : cleared > 0
        ? 'First-party receipts clear the SLA evidence screen for some non-payment workflows, but V146.1 has not yet completed its required observation window.'
        : 'No network workflow currently clears receipt coverage, business success, freshness and latency evidence.'
  );

  set('v150-cleared', cleared);
  set('v150-audited', summary?.network_candidates_audited ?? null);
  set('v150-cleared-count', cleared);
  set('v150-protected', summary?.protected_business_candidates ?? null);
  set('v150-incomplete', summary?.incomplete_evidence_candidates ?? null);
  set('v150-failures', summary?.failure_review_candidates ?? null);
  set('v150-latency', summary?.latency_review_candidates ?? null);
  set('v150-v1461-age', Number.isFinite(observation) ? `${observation.toFixed(1)}m / 60m` : 'WITHHELD');
  set('v150-coverage-threshold', thresholds?.minimum_receipt_coverage_pct == null ? '95%' : `${thresholds.minimum_receipt_coverage_pct}%`);
  set('v150-payments', 'PROTECTED');
  set('v150-rescheduling', 'OFF');
  set('v150-orders', 'OFF');
  set('v150-capital', '0R');

  const host = byId('v150-evidence-list');
  if (host) {
    host.replaceChildren();
    if (!evidence.length) {
      const chip = document.createElement('span');
      chip.className = 'integrity-chip integrity-chip-warn';
      chip.textContent = 'NO NETWORK RECEIPT EVIDENCE';
      host.appendChild(chip);
    } else {
      for (const item of evidence.slice(0, 6)) {
        const chip = document.createElement('span');
        chip.className = item?.network_sla_cleared ? 'integrity-chip integrity-chip-clear' : 'integrity-chip integrity-chip-warn';
        const coverage = Number(item?.receipt_coverage_pct);
        const success = Number(item?.receipt_success_pct);
        chip.textContent = `${String(item?.jobname || 'job')} · ${String(item?.evidence_verdict || 'REVIEW')} · coverage ${Number.isFinite(coverage) ? coverage.toFixed(0) : '?'}% · success ${Number.isFinite(success) ? success.toFixed(0) : '?'}% · p95 ${Number(item?.p95_business_receipt_ms || 0).toFixed(0)}ms`;
        host.appendChild(chip);
      }
    }
  }

  set('v150-detail',
    `Audited ${Number(summary?.network_candidates_audited || 0)} · SLA cleared ${cleared} · protected business ${Number(summary?.protected_business_candidates || 0)} · incomplete ${Number(summary?.incomplete_evidence_candidates || 0)} · failures ${Number(summary?.failure_review_candidates || 0)} · latency review ${Number(summary?.latency_review_candidates || 0)} · V146.1 ${Number.isFinite(observation) ? observation.toFixed(1) : 'n/a'}m · auto apply OFF · orders OFF · capital 0R.`
  );
}

async function loadV149DependencyIsolationShadow() {
  const audit = await readLocal('/api/dependency-isolation-shadow', 20000);
  if (!audit?.ok) {
    set('v149-state', 'DEPENDENCY AUDIT · FAIL CLOSED');
    set('v149-copy', 'The dependency auditor is unavailable. No candidate may advance to controlled schedule planning.');
    for (const id of ['v149-cleared','v149-audited','v149-cleared-count','v149-network','v149-protected','v149-writes','v149-privileged','v149-missing','v149-v1461-age']) set(id, null);
    set('v149-gate', 'LOCKED');
    set('v149-rescheduling', 'OFF');
    set('v149-orders', 'OFF');
    set('v149-capital', '0R');
    return;
  }

  const summary = audit?.summary ?? {};
  const deps = audit?.dependencies ?? {};
  const audits = Array.isArray(audit?.audits) ? audit.audits : [];
  const cleared = Number(summary?.dependency_cleared_candidates || 0);
  const observation = Number(deps?.v1461_observation_minutes);

  set('v149-state', `DEPENDENCY · ${first(audit?.state, 'UNKNOWN')}`);
  set('v149-copy',
    cleared > 0
      ? 'At least one V148 candidate has a lower-risk dependency shape, but it still cannot advance until V146.1 matures and a rollback-controlled plan passes human review.'
      : 'No V148 candidate currently clears dependency and failure-isolation review. Hidden writes, protected data surfaces or network SLAs keep the next schedule mutation locked.'
  );

  set('v149-cleared', cleared);
  set('v149-audited', summary?.audited_candidates ?? null);
  set('v149-cleared-count', cleared);
  set('v149-network', summary?.direct_network_candidates ?? null);
  set('v149-protected', summary?.protected_data_candidates ?? null);
  set('v149-writes', summary?.database_write_candidates ?? null);
  set('v149-privileged', summary?.privileged_function_candidates ?? null);
  set('v149-missing', summary?.missing_function_candidates ?? null);
  set('v149-v1461-age', Number.isFinite(observation) ? `${observation.toFixed(1)}m / 60m` : 'WITHHELD');
  set('v149-gate', cleared > 0 ? 'REVIEW ONLY' : 'LOCKED');
  set('v149-rescheduling', 'OFF');
  set('v149-orders', 'OFF');
  set('v149-capital', '0R');

  const host = byId('v149-audit-list');
  if (host) {
    host.replaceChildren();
    if (!audits.length) {
      const chip = document.createElement('span');
      chip.className = 'integrity-chip integrity-chip-warn';
      chip.textContent = 'NO AUDIT RESULTS';
      host.appendChild(chip);
    } else {
      for (const item of audits.slice(0, 6)) {
        const chip = document.createElement('span');
        chip.className = item?.dependency_cleared ? 'integrity-chip integrity-chip-clear' : 'integrity-chip integrity-chip-warn';
        chip.textContent = `${String(item?.jobname || 'job')} · ${String(item?.dependency_verdict || 'REVIEW')} · relief ${Number(item?.estimated_relief_index || 0).toFixed(2)}`;
        host.appendChild(chip);
      }
    }
  }

  set('v149-detail',
    `Audited ${Number(summary?.audited_candidates || 0)} · cleared ${cleared} · network ${Number(summary?.direct_network_candidates || 0)} · protected data ${Number(summary?.protected_data_candidates || 0)} · writes ${Number(summary?.database_write_candidates || 0)} · privileged ${Number(summary?.privileged_function_candidates || 0)} · V146.1 ${Number.isFinite(observation) ? observation.toFixed(1) : 'n/a'}m · rescheduling OFF · orders OFF · capital 0R.`
  );
}

async function loadV148PredictiveCollisionShadow() {
  const model = await readLocal('/api/predictive-collision-shadow', 20000);
  if (!model?.ok) {
    set('v148-state', 'COLLISION MODEL · FAIL CLOSED');
    set('v148-copy', 'The predictive collision model is unavailable. No scheduler recommendation or mutation is permitted.');
    for (const id of ['v148-candidates','v148-ranked','v148-low','v148-review','v148-protected','v148-relief','v148-v1461-age','v148-v147-pressure']) set(id, null);
    set('v148-reserved', 'RESERVED');
    set('v148-rescheduling', 'OFF');
    set('v148-orders', 'OFF');
    set('v148-capital', '0R');
    return;
  }

  const summary = model?.summary ?? {};
  const deps = model?.dependencies ?? {};
  const candidates = Array.isArray(model?.candidates) ? model.candidates : [];
  const ranked = Number(summary?.ranked_candidates || 0);
  const low = Number(summary?.low_complexity_candidates || 0);
  const review = Number(summary?.review_required_candidates || 0);
  const relief = Number(summary?.best_estimated_relief_index);
  const observation = Number(deps?.v1461_observation_minutes);
  const pressure = Number(deps?.v147_pressure_score);

  set('v148-state', `COLLISION · ${first(model?.state, 'UNKNOWN')}`);
  set('v148-copy',
    low > 0
      ? 'V148 found lower-complexity phase candidates, but all recommendations remain shadow-only until the V146.1 evidence window matures and a rollback-controlled plan is approved.'
      : ranked > 0
        ? 'V148 found potential collision relief, but every current candidate requires nested-call or network-I/O review. No automatic schedule move is allowed.'
        : 'No candidate currently clears the protected-lane, reliability, cadence and load-relief screens.'
  );

  set('v148-candidates', ranked);
  set('v148-ranked', ranked);
  set('v148-low', low);
  set('v148-review', review);
  set('v148-protected', summary?.protected_jobs ?? null);
  set('v148-relief', Number.isFinite(relief) ? relief.toFixed(2) : 'WITHHELD');
  set('v148-v1461-age', Number.isFinite(observation) ? `${observation.toFixed(1)}m / 60m` : 'WITHHELD');
  set('v148-v147-pressure', Number.isFinite(pressure) ? `${pressure}/100` : 'WITHHELD');
  set('v148-ceiling', summary?.recommended_concurrent_ceiling ?? 8);
  set('v148-reserved', model?.promotion_gate?.v1461_controlled_minutes_reserved ? 'RESERVED' : 'WITHHELD');
  set('v148-rescheduling', 'OFF');
  set('v148-orders', 'OFF');
  set('v148-capital', '0R');

  const host = byId('v148-candidate-list');
  if (host) {
    host.replaceChildren();
    if (!candidates.length) {
      const chip = document.createElement('span');
      chip.className = 'integrity-chip integrity-chip-clear';
      chip.textContent = 'NO REVIEW-WORTHY SHIFT FOUND';
      host.appendChild(chip);
    } else {
      for (const item of candidates.slice(0, 6)) {
        const chip = document.createElement('span');
        chip.className = item?.review_class === 'LOW_COMPLEXITY_REVIEW_CANDIDATE'
          ? 'integrity-chip integrity-chip-clear'
          : 'integrity-chip integrity-chip-warn';
        const currentMinutes = Array.isArray(item?.current_trigger_minutes) ? item.current_trigger_minutes.join(',') : '?';
        const targetMinutes = Array.isArray(item?.recommended_trigger_minutes) ? item.recommended_trigger_minutes.join(',') : '?';
        chip.textContent = `${String(item?.jobname || 'job')} · ${currentMinutes} → ${targetMinutes} · relief ${Number(item?.estimated_relief_index || 0).toFixed(2)} · ${String(item?.review_class || 'REVIEW')}`;
        host.appendChild(chip);
      }
    }
  }

  set('v148-detail',
    `Hybrid model ${String(model?.forecast?.model_revision || 'n/a')} · candidates ${ranked} · low complexity ${low} · review required ${review} · protected ${Number(summary?.protected_jobs || 0)} · best relief index ${Number.isFinite(relief) ? relief.toFixed(2) : 'n/a'} · V146.1 ${Number.isFinite(observation) ? observation.toFixed(1) : 'n/a'}m · V147 pressure ${Number.isFinite(pressure) ? pressure : 'n/a'}/100 · auto apply OFF · orders OFF · capital 0R.`
  );
}

async function loadV147ConnectionPressureShadow() {
  const pressure = await readLocal('/api/connection-pressure-shadow', 18000);
  if (!pressure?.ok) {
    set('v147-state', 'PRESSURE · FAIL CLOSED');
    set('v147-copy', 'The private connection-pressure model is unavailable. No pool, scheduler, or execution change is permitted.');
    for (const id of ['v147-score','v147-clients','v147-util','v147-headroom','v147-active','v147-locks','v147-long-tx','v147-cron15','v147-cronfail']) set(id, null);
    set('v147-throttle', 'OFF');
    set('v147-pool', 'OFF');
    set('v147-orders', 'OFF');
    set('v147-capital', '0R');
    return;
  }

  const connections = pressure?.connections ?? {};
  const cron = pressure?.cron_pressure ?? {};
  const actions = Array.isArray(pressure?.actions) ? pressure.actions.map((x: unknown) => String(x)) : [];
  const score = Number(pressure?.pressure_score);
  const util = Number(connections?.utilization_pct);

  set('v147-state', `PRESSURE · ${first(pressure?.state, 'UNKNOWN')}`);
  set('v147-copy',
    pressure?.state === 'NORMAL'
      ? 'Database backend pressure is currently contained. V147 still watches cron concurrency because the recommended eight-job ceiling remains the stricter infrastructure target.'
      : pressure?.state === 'ELEVATED'
        ? 'Backend pressure is elevated but not critical. The engine is isolating cron, locks, long transactions and client-slot usage before recommending any further infrastructure work.'
        : pressure?.state === 'HIGH' || pressure?.state === 'CRITICAL'
          ? 'Connection pressure is materially elevated. V147 keeps all automatic tuning disabled and surfaces diagnostics for governed intervention.'
          : 'Connection pressure is being measured from database backend telemetry with client-idle waits separated from true pressure waits.'
  );
  set('v147-score', Number.isFinite(score) ? `${score}/100` : 'WITHHELD');
  set('v147-clients', `${Number(connections?.client_backends || 0)}/${Number(connections?.effective_client_capacity || 0)}`);
  set('v147-util', Number.isFinite(util) ? `${util.toFixed(1)}%` : 'WITHHELD');
  set('v147-headroom', connections?.headroom ?? null);
  set('v147-active', connections?.active_client_backends ?? null);
  set('v147-locks', connections?.lock_waits ?? null);
  set('v147-long-tx', connections?.long_transactions_over_30s ?? null);
  set('v147-cron15', cron?.peak_concurrent_15m ?? null);
  set('v147-cronfail', cron?.failures_15m ?? null);
  set('v147-throttle', 'OFF');
  set('v147-pool', 'OFF');
  set('v147-orders', 'OFF');
  set('v147-capital', '0R');

  const host = byId('v147-actions');
  if (host) {
    host.replaceChildren();
    const items = actions.length ? actions : ['Maintain current governed load and observe'];
    for (const item of items.slice(0, 6)) {
      const chip = document.createElement('span');
      chip.className = pressure?.state === 'NORMAL' ? 'integrity-chip integrity-chip-clear' : 'integrity-chip integrity-chip-warn';
      chip.textContent = item.replaceAll('_', ' ').toUpperCase();
      host.appendChild(chip);
    }
  }

  set('v147-detail',
    `Client backends ${Number(connections?.client_backends || 0)}/${Number(connections?.effective_client_capacity || 0)} · utilization ${Number.isFinite(util) ? util.toFixed(1) : 'n/a'}% · active ${Number(connections?.active_client_backends || 0)} · lock waits ${Number(connections?.lock_waits || 0)} · long tx ${Number(connections?.long_transactions_over_30s || 0)} · cron peak 15m ${Number(cron?.peak_concurrent_15m || 0)} · failures 15m ${Number(cron?.failures_15m || 0)} · pool tuning OFF · orders OFF · capital 0R.`
  );
}

async function loadV1461ControlledPeakSpreader() {
  const spreader = await readLocal('/api/peak-minute-spreader-status', 18000);
  if (!spreader?.ok) {
    set('v1461-state', 'SPREADER · FAIL CLOSED');
    set('v1461-copy', 'The controlled scheduler experiment status is unavailable. No further scheduler action is permitted from this surface.');
    for (const id of ['v1461-orb','v1461-observation','v1461-compliance','v1461-baseline-quarter','v1461-measured-quarter','v1461-15m-peak','v1461-15m-failures','v1461-runs','v1461-drift']) set(id, null);
    set('v1461-rollback', 'READY');
    set('v1461-auto-rollback', 'OFF');
    set('v1461-orders', 'OFF');
    set('v1461-capital', '0R');
    return;
  }

  const plan = spreader?.plan ?? {};
  const baseline = spreader?.baseline ?? {};
  const since = spreader?.since_apply ?? {};
  const rolling15 = spreader?.rolling?.last_15m ?? {};
  const gate = spreader?.success_gate ?? {};
  const jobs = Array.isArray(plan?.jobs) ? plan.jobs : [];
  const observation = Number(spreader?.observation_minutes);
  const baselineQuarter = Number(baseline?.quarter_hour_peak_starts);
  const measuredQuarter = Number(since?.quarter_hour_peak_starts);
  const peak15 = Number(rolling15?.peak_starts_per_minute);

  set('v1461-state', `SPREADER · ${first(spreader?.state, 'UNKNOWN')}`);
  set('v1461-copy',
    spreader?.state === 'PEAK_SPREAD_IMPROVED'
      ? 'The controlled offsets reduced the measured quarter-hour launch peak without introducing scheduler failures. Rollback remains available.'
      : spreader?.state === 'OBSERVING'
        ? 'The three approved offsets are live and compliant. V146.1 is accumulating the required post-change evidence window before judging the experiment.'
        : spreader?.state === 'ROLLBACK_REVIEW_FAILURES'
          ? 'New scheduler failures appeared after the controlled change. V146.1 is holding further action and surfacing rollback review.'
          : spreader?.state === 'SCHEDULE_DRIFT_BLOCKED'
            ? 'One or more controlled schedules have unexplained drift from the approved plan. Further scheduler changes are blocked.'
            : spreader?.state === 'GUARD_PAUSED_OBSERVATION_DEGRADED'
              ? 'A higher-priority protective guard intentionally paused one or more V146.1 targets. The schedule itself is intact, but experiment certification is withheld until the guard releases the target.'
              : 'The experiment is measured against its frozen baseline; no automatic promotion or rescheduling is allowed.'
  );
  set('v1461-observation', Number.isFinite(observation) ? `${observation.toFixed(1)}m / 60m` : 'WITHHELD');
  set('v1461-compliance', `${Number(plan?.compliant_jobs || 0)}/${Number(plan?.target_jobs || 0)}${Number(plan?.guard_paused_jobs || 0) ? ` · ${Number(plan?.guard_paused_jobs || 0)} GUARD` : ''}`);
  set('v1461-baseline-quarter', Number.isFinite(baselineQuarter) ? `${baselineQuarter}/MIN` : 'WITHHELD');
  set('v1461-measured-quarter', Number.isFinite(measuredQuarter) ? `${measuredQuarter}/MIN` : 'WITHHELD');
  set('v1461-15m-peak', Number.isFinite(peak15) ? `${peak15}/MIN` : 'WITHHELD');
  set('v1461-15m-failures', Number(rolling15?.failures || 0));
  set('v1461-runs', Number(since?.runs || 0));
  set('v1461-drift', Number(plan?.schedule_drift_jobs || 0));
  set('v1461-orb', Number.isFinite(measuredQuarter) && Number(since?.runs || 0) > 0 ? measuredQuarter : '--');
  set('v1461-rollback', spreader?.rollback?.available ? 'READY' : 'WITHHELD');
  set('v1461-auto-rollback', 'OFF');
  set('v1461-orders', 'OFF');
  set('v1461-capital', '0R');

  const host = byId('v1461-target-list');
  if (host) {
    host.replaceChildren();
    if (!jobs.length) {
      const chip = document.createElement('span');
      chip.className = 'integrity-chip integrity-chip-warn';
      chip.textContent = 'CONTROLLED TARGETS UNAVAILABLE';
      host.appendChild(chip);
    } else {
      for (const job of jobs.slice(0, 3)) {
        const chip = document.createElement('span');
        const guardPaused = Boolean(job?.guard_paused);
        chip.className = job?.compliant ? 'integrity-chip integrity-chip-clear' : 'integrity-chip integrity-chip-warn';
        chip.textContent = `${String(job?.jobname || 'job')} · ${String(job?.current_schedule || 'schedule unavailable')} · ${job?.compliant ? 'COMPLIANT' : guardPaused ? 'GUARD PAUSED' : 'DRIFT'}`;
        host.appendChild(chip);
      }
    }
  }

  set('v1461-detail',
    `Baseline quarter-hour peak ${Number.isFinite(baselineQuarter) ? baselineQuarter : 'n/a'} · measured ${Number.isFinite(measuredQuarter) && Number(since?.runs || 0) > 0 ? measuredQuarter : 'collecting'} · observation ${Number.isFinite(observation) ? observation.toFixed(1) : 'n/a'}m · guard-paused ${Number(plan?.guard_paused_jobs || 0)} · unexpected drift ${Number(plan?.schedule_drift_jobs || 0)} · failures since apply ${Number(since?.failures || 0)} · rollback ${spreader?.rollback?.available ? 'ready' : 'withheld'} · result eligible ${gate?.experiment_result_eligible ? 'yes' : 'no'} · orders OFF · capital 0R.`
  );
}

async function loadV145ConnectionAdmissionShadow() {
  const admission = await readLocal('/api/admission-shadow', 18000);
  if (!admission?.ok) {
    set('v145-state', 'ADMISSION · FAIL CLOSED');
    set('v145-copy', 'The private connection-admission planner is unavailable. No bundling or scheduler mutation is permitted.');
    for (const id of ['v145-active','v145-groups','v145-candidates','v145-review','v145-saved','v145-ceiling','v145-best-budget','v145-best-saved']) set(id, null);
    set('v145-bundling', 'OFF');
    set('v145-rescheduling', 'OFF');
    set('v145-orders', 'OFF');
    set('v145-capital', '0R');
    return;
  }

  const summary = admission?.summary ?? {};
  const groups = Array.isArray(admission?.cadence_groups) ? admission.cadence_groups : [];
  const candidates = groups.filter((x: AnyJson) => x?.admission_class === 'SHADOW_SERIALIZATION_CANDIDATE');
  const best = candidates
    .slice()
    .sort((a: AnyJson,b: AnyJson) =>
      Number(b?.projected_slots_saved_per_trigger || 0) - Number(a?.projected_slots_saved_per_trigger || 0)
      || Number(a?.sequential_p95_budget_ms || 0) - Number(b?.sequential_p95_budget_ms || 0)
    )[0] ?? null;

  set('v145-state', `ADMISSION · ${first(admission?.state, 'UNKNOWN')}`);
  set('v145-copy',
    candidates.length
      ? 'V145 has identified same-cadence SQL groups that could reduce connection pressure if they are later bundled sequentially. Every candidate remains shadow-only until call-graph, transaction and failure-isolation review passes.'
      : 'No bundle currently clears the deep shadow screen. V145.2 will not serialize across nested function calls, hidden network I/O, recent failures, or unresolved transaction semantics.'
  );
  set('v145-active', summary?.active_jobs ?? null);
  set('v145-groups', summary?.collision_groups ?? null);
  set('v145-candidates', summary?.shadow_serialization_candidate_groups ?? 0);
  set('v145-review', summary?.review_required_groups ?? 0);
  set('v145-saved', summary?.projected_connection_slots_saved_per_trigger ?? 0);
  set('v145-orb', summary?.projected_connection_slots_saved_per_trigger ?? 0);
  set('v145-ceiling', summary?.recommended_concurrent_ceiling ?? 8);
  set('v145-best-budget', best ? `${Number(best?.sequential_p95_budget_ms || 0).toFixed(1)}ms` : 'NONE');
  set('v145-best-saved', best ? `${Number(best?.projected_slots_saved_per_trigger || 0)} SLOTS` : 'NONE');
  set('v145-bundling', 'SHADOW ONLY');
  set('v145-rescheduling', 'OFF');
  set('v145-orders', 'OFF');
  set('v145-capital', '0R');

  const host = byId('v145-candidate-list');
  if (host) {
    host.replaceChildren();
    const items = candidates.length ? candidates : [];
    if (!items.length) {
      const chip = document.createElement('span');
      chip.className = 'integrity-chip integrity-chip-warn';
      chip.textContent = 'NO LOW-COMPLEXITY BUNDLE CLEARED';
      host.appendChild(chip);
    } else {
      for (const item of items.slice(0, 6)) {
        const chip = document.createElement('span');
        chip.className = 'integrity-chip integrity-chip-clear';
        chip.textContent = `${String(item?.schedule || 'schedule')} · ${Number(item?.job_count || 0)} jobs → save ${Number(item?.projected_slots_saved_per_trigger || 0)} slots · p95 budget ${Number(item?.sequential_p95_budget_ms || 0).toFixed(0)}ms`;
        host.appendChild(chip);
      }
    }
  }

  set('v145-detail',
    `Collision groups ${Number(summary?.collision_groups || 0)} · candidates ${Number(summary?.shadow_serialization_candidate_groups || 0)} · review required ${Number(summary?.review_required_groups || 0)} · projected safe-shadow slot reduction ${Number(summary?.projected_connection_slots_saved_per_trigger || 0)} · automatic bundling OFF · orders OFF · capital 0R.`
  );
}

async function loadV144SchedulerLoadGovernor() {
  const scheduler = await readLocal('/api/scheduler-governor', 15000);
  if (!scheduler?.ok) {
    set('v144-state', 'SCHEDULER · FAIL CLOSED');
    set('v144-copy', 'The private scheduler governor is unavailable. V144 cannot certify load reduction and cannot change execution permission.');
    for (const id of ['v144-score','v144-observation','v144-compliance','v144-peak-concurrency','v144-peak-starts','v144-reduction','v144-failures','v144-active-jobs','v144-running']) set(id, null);
    set('v144-promotion', 'DISABLED');
    set('v144-rescheduling', 'MANUAL ONLY');
    set('v144-orders', 'OFF');
    set('v144-capital', '0R');
    return;
  }

  const plan = scheduler?.plan ?? {};
  const baseline = scheduler?.baseline ?? {};
  const since = scheduler?.since_apply ?? {};
  const rolling15 = scheduler?.rolling?.last_15m ?? {};
  const runtime = scheduler?.runtime ?? {};
  const actions = Array.isArray(scheduler?.actions) ? scheduler.actions.map((x: unknown) => String(x)) : [];

  const observation = Number(scheduler?.observation_minutes);
  const peakNow = Number(since?.peak_concurrent);
  const peakBase = Number(baseline?.peak_concurrent);
  const startsNow = Number(since?.peak_starts_per_minute);
  const startsBase = Number(baseline?.peak_starts_per_minute);
  const reduction = Number(since?.peak_concurrency_reduction_pct);

  set('v144-state', `SCHEDULER · ${first(scheduler?.state, 'UNKNOWN')}`);
  set('v144-copy',
    scheduler?.state === 'LOAD_HEALTHY'
      ? 'The phased scheduler is holding within the recommended concurrency ceiling while preserving the fast capture and safety lanes.'
      : scheduler?.state === 'OBSERVING'
        ? 'V144.1 has phase-staggered the research and legacy autonomy cron graph. It is accumulating telemetry from the latest plan change before calling the load profile stable.'
        : scheduler?.state === 'SCHEDULE_DRIFT_BLOCKED'
          ? 'One or more governed jobs has drifted from the approved phase plan. V144 is fail-closed until schedule integrity is restored.'
          : 'Scheduler pressure is reduced but remains above the target ceiling. V144 keeps observing without weakening any trading gate.'
  );
  set('v144-score', scheduler?.score == null ? 'WITHHELD' : `${scheduler.score}/100`);
  set('v144-observation', Number.isFinite(observation) ? `${observation.toFixed(1)}m` : 'WITHHELD');
  set('v144-compliance', `${Number(plan?.compliant_jobs || 0)}/${Number(plan?.target_jobs || 0)}`);
  set('v144-peak-concurrency', Number.isFinite(peakNow)
    ? `${peakNow} · BASE ${Number.isFinite(peakBase) ? peakBase : '?'}`
    : 'WITHHELD');
  set('v144-peak-starts', Number.isFinite(startsNow)
    ? `${startsNow}/MIN · BASE ${Number.isFinite(startsBase) ? startsBase : '?'}`
    : 'WITHHELD');
  set('v144-reduction', Number.isFinite(reduction) ? `${reduction.toFixed(1)}%` : 'WITHHELD');
  set('v144-failures', `${Number(rolling15?.failures || 0)} · BURST ${Number(rolling15?.failure_burst_max || 0)}`);
  set('v144-active-jobs', runtime?.active_jobs ?? null);
  set('v144-running', runtime?.currently_running_jobs ?? null);
  set('v144-promotion', 'DISABLED');
  set('v144-rescheduling', 'MANUAL ONLY');
  set('v144-orders', 'OFF');
  set('v144-capital', '0R');

  const host = byId('v144-actions');
  if (host) {
    host.replaceChildren();
    const items = actions.length ? actions : ['Continue passive scheduler verification'];
    for (const item of items.slice(0, 7)) {
      const chip = document.createElement('span');
      chip.className = actions.length ? 'integrity-chip integrity-chip-warn' : 'integrity-chip integrity-chip-clear';
      chip.textContent = item.replaceAll('_', ' ').toUpperCase();
      host.appendChild(chip);
    }
  }

  set('v144-detail',
    `Plan ${Number(plan?.compliant_jobs || 0)}/${Number(plan?.target_jobs || 0)} compliant · observation ${Number.isFinite(observation) ? observation.toFixed(1) : 'n/a'}m · peak concurrency ${Number.isFinite(peakNow) ? peakNow : 'n/a'} vs ${Number.isFinite(peakBase) ? peakBase : 'n/a'} baseline · peak starts ${Number.isFinite(startsNow) ? startsNow : 'n/a'} vs ${Number.isFinite(startsBase) ? startsBase : 'n/a'} · 15m failures ${Number(rolling15?.failures || 0)} · orders OFF · capital 0R.`
  );
}

async function loadV143StabilityConfirmation() {
  const stability = await readLocal('/api/stability-confirmation', 15000);
  if (!stability?.ok) {
    set('v143-state', 'STABILITY · FAIL CLOSED');
    set('v143-copy', 'Rolling stability evidence is unavailable. V143 cannot confirm infrastructure health and cannot change execution permission.');
    for (const id of ['v143-score','v143-duration','v143-quota-streak','v143-smoke-streak','v143-cron-15','v143-cron-60','v143-failure','v143-last-failure','v143-connectors']) set(id, null);
    set('v143-promotion', 'DISABLED');
    set('v143-orders', 'OFF');
    set('v143-capital', '0R');
    return;
  }

  const current = stability?.current ?? {};
  const health = stability?.consecutive_health ?? {};
  const rolling = stability?.rolling_reliability ?? {};
  const failure = stability?.failure_classification ?? {};
  const thresholds = stability?.thresholds ?? {};
  const actions = Array.isArray(stability?.actions) ? stability.actions.map((x: unknown) => String(x)) : [];
  const stableMinutes = Number(stability?.stable_minutes);
  const requiredMinutes = Number(thresholds?.post_recovery_stable_minutes || 15);
  const cron15 = Number(rolling?.cron_15m?.reliability_pct);
  const cron60 = Number(rolling?.cron_60m?.reliability_pct);
  const confirmed = stability?.stability_confirmed === true;

  set('v143-state', `STABILITY · ${first(stability?.state, 'UNKNOWN')}`);
  set('v143-copy',
    confirmed
      ? 'Recovery has survived the required observation window with consecutive quota clears, fresh smoke evidence, high cron reliability and no active major incident. This confirms infrastructure stability only.'
      : stability?.state === 'STABILITY_BLOCKED'
        ? 'A current or repeated failure prevents stability confirmation. V143 stays fail-closed until observed recovery satisfies the full rolling window.'
        : 'Recovery is healthy but still earning time. V143 refuses to convert one green check into a stability claim before the rolling confirmation window is satisfied.'
  );
  set('v143-score', stability?.stability_score == null ? 'WITHHELD' : `${stability.stability_score}/100`);
  set('v143-duration', Number.isFinite(stableMinutes) ? `${stableMinutes.toFixed(1)}m / ${requiredMinutes}m` : 'WITHHELD');
  set('v143-quota-streak', `${Number(health?.quota_clear_streak || 0)} CLEAR`);
  set('v143-smoke-streak', `${Number(health?.smoke_success_streak || 0)} PASS`);
  set('v143-cron-15', Number.isFinite(cron15) ? `${cron15.toFixed(3)}%` : 'WITHHELD');
  set('v143-cron-60', Number.isFinite(cron60) ? `${cron60.toFixed(3)}%` : 'WITHHELD');
  set('v143-failure', first(failure?.class, 'UNKNOWN'));
  set('v143-last-failure', failure?.last_cron_failure_job
    ? `${failure.last_cron_failure_job} · ${failure?.last_cron_failure_recovered ? 'RECOVERED' : 'OPEN CHECK'}`
    : 'NONE');
  set('v143-connectors', current?.connectors?.required
    ? `${Number(current?.connectors?.healthy || 0)}/${Number(current?.connectors?.required || 0)}`
    : 'WITHHELD');
  set('v143-promotion', 'DISABLED');
  set('v143-orders', 'OFF');
  set('v143-capital', '0R');

  const host = byId('v143-actions');
  if (host) {
    host.replaceChildren();
    const items = actions.length ? actions : ['Stability window satisfied; continue passive verification'];
    for (const item of items.slice(0, 7)) {
      const chip = document.createElement('span');
      chip.className = confirmed && !actions.length
        ? 'integrity-chip integrity-chip-clear'
        : 'integrity-chip integrity-chip-warn';
      chip.textContent = item.replaceAll('_', ' ').toUpperCase();
      host.appendChild(chip);
    }
  }

  set('v143-detail',
    `Mode ${first(current?.mode, 'unknown')} · stability ${first(stability?.state, 'unknown')} · score ${stability?.stability_score ?? 'n/a'}/100 · stable ${Number.isFinite(stableMinutes) ? stableMinutes.toFixed(1) : 'n/a'}m · quota streak ${Number(health?.quota_clear_streak || 0)} · smoke streak ${Number(health?.smoke_success_streak || 0)} · cron 60m ${Number.isFinite(cron60) ? cron60.toFixed(3) : 'n/a'}% · failure ${first(failure?.class, 'unknown')} · orders OFF · capital 0R.`
  );
}

async function loadV142RuntimeRecoveryEngine() {
  const recovery = await readLocal('/api/runtime-recovery', 36000);
  if (!recovery?.ok) {
    set('v142-state', 'RECOVERY ENGINE · UNAVAILABLE');
    set('v142-copy', 'The live recovery diagnostic could not complete. Canonical execution remains WAIT · 0R.');
    for (const id of ['v142-score','v142-quota','v142-edge','v142-canonical','v142-smoke','v142-qa','v142-release','v142-divergence']) set(id, null);
    set('v142-promotion', 'DISABLED');
    set('v142-orders', 'OFF');
    set('v142-capital', '0R');
    return;
  }

  const evidence = recovery?.evidence ?? {};
  const quota = evidence?.live_quota_probe ?? {};
  const edge = evidence?.external_edge_acceptance ?? {};
  const canonical = evidence?.canonical_state ?? {};
  const qa = evidence?.qa ?? {};
  const release = evidence?.release ?? {};
  const divergence = recovery?.divergence ?? {};
  const actions = Array.isArray(recovery?.actions) ? recovery.actions.map((x: unknown) => String(x)) : [];

  set('v142-state', `RECOVERY ENGINE · ${first(recovery?.state, 'UNKNOWN')}`);
  set('v142-copy',
    divergence?.canonical_edge_restriction_stale
      ? 'Live provider probes have recovered, but the canonical machine still carries the prior quota restriction. V142 isolates that stale-state divergence instead of treating it as fresh truth.'
      : recovery?.state === 'CANONICAL_RECOVERED_SMOKE_RECERTIFICATION_PENDING'
        ? 'Canonical quota recovery is confirmed. The remaining infrastructure task is a fresh production smoke recertification.'
        : recovery?.state === 'RECOVERY_VERIFIED'
          ? 'Runtime recovery evidence is aligned across provider probes, canonical state, smoke, QA and release provenance. Capital permission remains independently governed.'
          : 'Recovery remains incomplete. V142 separates provider transport, canonical state, smoke freshness, QA and release provenance before declaring the infrastructure healthy.'
  );
  set('v142-score', recovery?.recovery_score == null ? 'WITHHELD' : `${recovery.recovery_score}%`);
  set('v142-quota', quota?.clear ? 'LIVE · CLEAR' : 'BLOCKED');
  set('v142-edge', edge?.verified ? `VERIFIED · ${edge?.transport_passed ?? '?'} / ${edge?.total ?? '?'}` : 'DEGRADED');
  set('v142-canonical', first(canonical?.edge_runtime, 'UNKNOWN'));
  set('v142-smoke', canonical?.smoke_state
    ? `${canonical.smoke_state}${canonical?.smoke_age_minutes == null ? '' : ' · ' + Number(canonical.smoke_age_minutes).toFixed(1) + 'm'}`
    : 'WITHHELD');
  set('v142-qa', qa?.pass ? `PASS · ${qa?.passed ?? '?'} / ${qa?.total ?? '?'}` : `DEGRADED · ${qa?.failed ?? '?'} FAIL`);
  set('v142-release', release?.verified ? `VERIFIED · ${release?.commit ?? 'CURRENT'}` : first(release?.state, 'WITHHELD'));
  set('v142-divergence', divergence?.canonical_edge_restriction_stale ? 'STALE CANONICAL FLAG' : 'NONE DETECTED');
  set('v142-promotion', 'DISABLED');
  set('v142-orders', 'OFF');
  set('v142-capital', '0R');

  const host = byId('v142-actions');
  if (host) {
    host.replaceChildren();
    const items = actions.length ? actions : ['No recovery action beyond continued verification'];
    for (const item of items.slice(0, 7)) {
      const chip = document.createElement('span');
      chip.className = actions.length ? 'integrity-chip integrity-chip-warn' : 'integrity-chip integrity-chip-clear';
      chip.textContent = item.replaceAll('_', ' ').toUpperCase();
      host.appendChild(chip);
    }
  }

  set('v142-detail',
    `Live quota clear ${quota?.clear ? 'YES' : 'NO'} · external edge ${edge?.verified ? 'VERIFIED' : 'NOT VERIFIED'} · canonical edge ${first(canonical?.edge_runtime, 'unknown')} · smoke ${first(canonical?.smoke_state, 'unknown')} · QA ${first(qa?.state, 'unknown')} · release ${first(release?.state, 'unknown')} · orders OFF · capital 0R.`
  );
}

async function loadV141RuntimeRecoverySentinel() {
  const state = await readLocal('/api/autonomous-state', 9000);
  const health = state?.health ?? {};
  const governance = state?.governance ?? {};
  const details = state?.details ?? {};
  const blockers = Array.isArray(state?.blockers) ? state.blockers.map((x: unknown) => String(x)) : [];
  const connectors = health?.connectors ?? {};
  const smoke = health?.production_smoke ?? {};

  const edgeRestricted = String(health?.edge_runtime ?? 'UNKNOWN') !== 'HEALTHY';
  const smokeFresh = String(smoke?.state ?? 'UNKNOWN') === 'FRESH';
  const databaseOnline = String(health?.database ?? 'UNKNOWN') === 'ONLINE';
  const evidenceFresh = String(health?.evidence ?? 'UNKNOWN') === 'FRESH';
  const connectorHealthy = Number(connectors?.healthy || 0);
  const connectorRequired = Number(connectors?.required || 0);
  const connectorsReady = connectorRequired > 0 && connectorHealthy >= connectorRequired;
  const criticalIncidents = Number(details?.open_major_critical_incidents || 0);
  const action = first(governance?.action_permitted, 'WAIT');
  const capital = first(governance?.capital_permission, '0R');

  const recoveryReady =
    Boolean(state?.ok) &&
    databaseOnline &&
    evidenceFresh &&
    connectorsReady &&
    !edgeRestricted &&
    smokeFresh &&
    criticalIncidents === 0;

  const recoveryState = !state?.ok
    ? 'FAIL CLOSED · STATE UNAVAILABLE'
    : recoveryReady
      ? 'RECOVERY CONDITIONS CLEAR'
      : 'RECOVERY BLOCKED';

  set('v141-state', recoveryState);
  set('v141-copy',
    recoveryReady
      ? 'Infrastructure recovery conditions are clear. This sentinel still cannot increase capital permission or enable order routing.'
      : 'Infrastructure health is blocking promotion. V141 turns runtime restrictions, smoke freshness and connector health into an explicit fail-closed gate.'
  );
  set('v141-database', databaseOnline ? 'ONLINE' : first(health?.database, 'UNKNOWN'));
  set('v141-evidence', evidenceFresh ? 'FRESH' : first(health?.evidence, 'UNKNOWN'));
  set('v141-connectors', connectorRequired > 0 ? `${connectorHealthy}/${connectorRequired}` : 'WITHHELD');
  set('v141-edge', first(health?.edge_runtime, 'UNKNOWN'));
  set('v141-smoke', first(smoke?.state, 'UNKNOWN'));
  set('v141-smoke-age', smoke?.age_minutes == null ? 'WITHHELD' : `${Number(smoke.age_minutes).toFixed(1)}m`);
  set('v141-incidents', criticalIncidents);
  set('v141-score', state?.system_score == null ? 'WITHHELD' : `${state.system_score}/100`);
  set('v141-action', String(action));
  set('v141-capital', String(capital));
  set('v141-orders', 'OFF');
  set('v141-promotion', 'DISABLED');

  const host = byId('v141-blockers');
  if (host) {
    host.replaceChildren();
    const runtimeBlockers = blockers.length ? blockers : (recoveryReady ? ['No runtime recovery blocker'] : ['Runtime recovery state unresolved']);
    for (const item of runtimeBlockers.slice(0, 7)) {
      const chip = document.createElement('span');
      chip.className = recoveryReady ? 'integrity-chip integrity-chip-clear' : 'integrity-chip integrity-chip-warn';
      chip.textContent = item.replaceAll('_', ' ').toUpperCase();
      host.appendChild(chip);
    }
  }

  set('v141-detail',
    `Runtime sentinel: database ${first(health?.database, 'unknown')} · evidence ${first(health?.evidence, 'unknown')} · connectors ${connectorHealthy}/${connectorRequired || 0} · edge ${first(health?.edge_runtime, 'unknown')} · smoke ${first(smoke?.state, 'unknown')} · incidents ${criticalIncidents} · action ${action} · orders OFF · capital ${capital}.`
  );
}

function renderV140PromotionReviewGate(lab: AnyJson) {
  const cohort = lab?.cohort ?? {};
  const release = lab?.release ?? {};
  const recent = Array.isArray(lab?.recent_matches) ? lab.recent_matches : [];

  const matchedAlloc = Number(cohort?.matched_allocations || 0);
  const matchedResolved = Number(cohort?.matched_resolved || 0);
  const controlAlloc = Number(cohort?.control_allocations_post_launch || 0);
  const challengerAlloc = Number(cohort?.challenger_allocations_post_launch || 0);
  const publicFloor = Math.max(1, Number(release?.public_sample_floor || 10));
  const matureFloor = Math.max(publicFloor, Number(release?.mature_sample_floor || 30));

  const checkedAt = Date.parse(String(lab?.checked_at || ''));
  const ageSeconds = Number.isFinite(checkedAt)
    ? Math.max(0, Math.floor((Date.now() - checkedAt) / 1000))
    : null;

  const stale = ageSeconds == null || ageSeconds > 600;
  const impossibleCounts = matchedResolved > matchedAlloc;
  const inconsistentRecent = recent.filter((row: AnyJson) => row?.outcome_consistent === false).length;
  const balanced = controlAlloc === challengerAlloc;
  const allocationBase = Math.max(controlAlloc, challengerAlloc, 1);
  const alignment = Math.max(0, Math.min(100, Math.round((matchedAlloc / allocationBase) * 100)));
  const publicEarned = matchedResolved >= publicFloor;
  const matureEarned = matchedResolved >= matureFloor;
  const integrityPass = Boolean(lab?.ok) && !stale && !impossibleCounts && inconsistentRecent === 0 && balanced;
  const reviewEligible = integrityPass && matureEarned;

  const state = !integrityPass
    ? 'FAIL CLOSED'
    : !publicEarned
      ? 'LEARNING LOCK'
      : !matureEarned
        ? 'DESCRIPTIVE ONLY'
        : 'HUMAN REVIEW WINDOW';

  const blockers: string[] = [];
  if (!lab?.ok) blockers.push('governed telemetry unavailable');
  if (stale) blockers.push('telemetry freshness >10m');
  if (impossibleCounts) blockers.push('resolved count exceeds matched allocation');
  if (inconsistentRecent > 0) blockers.push(`${inconsistentRecent} outcome consistency check(s)`);
  if (!balanced) blockers.push(`allocation imbalance ${controlAlloc} vs ${challengerAlloc}`);
  if (!publicEarned) blockers.push(`public evidence gate ${matchedResolved}/${publicFloor}`);
  if (publicEarned && !matureEarned) blockers.push(`maturity gate ${matchedResolved}/${matureFloor}`);
  if (reviewEligible) blockers.push('human review required before any policy change');

  set('v140-state', `PROMOTION REVIEW · ${state}`);
  set('v140-copy',
    reviewEligible
      ? 'Prospective evidence has reached the maturity floor and integrity checks are clear. The machine may surface evidence for explicit human review, but it cannot promote itself.'
      : 'V140 compresses experiment integrity, sample maturity and cohort alignment into a fail-closed review gate. No gate can increase capital permission.'
  );
  set('v140-freshness', ageSeconds == null ? 'WITHHELD' : `${ageSeconds}s`);
  set('v140-sample', `${matchedResolved} / ${matureFloor}`);
  set('v140-alignment', `${alignment}%`);
  set('v140-consistency', inconsistentRecent === 0 ? 'CLEAR' : `${inconsistentRecent} CHECK`);
  set('v140-review', reviewEligible ? 'ELIGIBLE · HUMAN ONLY' : 'LOCKED');
  set('v140-orb', reviewEligible ? 'REVIEW' : integrityPass ? `${matchedResolved}/${matureFloor}` : 'LOCK');
  set('v140-promotion', 'HUMAN REVIEW ONLY');
  set('v140-capital', '0R · LOCKED');
  set('v140-live', 'OFF');

  const fill = byId('v140-progress-fill') as HTMLElement | null;
  if (fill) {
    fill.style.width = `${Math.max(0, Math.min(100, (matchedResolved / matureFloor) * 100))}%`;
  }

  const host = byId('v140-blockers');
  if (host) {
    host.replaceChildren();
    const items = blockers.length ? blockers : ['No active blocker beyond mandatory human review'];
    for (const item of items.slice(0, 7)) {
      const chip = document.createElement('span');
      chip.className = reviewEligible && item.startsWith('human review')
        ? 'integrity-chip integrity-chip-clear'
        : 'integrity-chip integrity-chip-warn';
      chip.textContent = item.toUpperCase();
      host.appendChild(chip);
    }
  }

  set('v140-detail',
    `V140 is a review gate, not a promotion engine. Matched ${matchedResolved}/${matchedAlloc || 0} resolved/allocated · public floor ${publicFloor} · mature floor ${matureFloor} · alignment ${alignment}% · live orders OFF · automatic promotion OFF · real capital 0R.`
  );
}

function renderV139ExperimentIntegrity(lab: AnyJson) {
  const cohort = lab?.cohort ?? {};
  const release = lab?.release ?? {};
  const recent = Array.isArray(lab?.recent_matches) ? lab.recent_matches : [];

  const matchedAlloc = Number(cohort?.matched_allocations || 0);
  const matchedResolved = Number(cohort?.matched_resolved || 0);
  const controlAlloc = Number(cohort?.control_allocations_post_launch || 0);
  const challengerAlloc = Number(cohort?.challenger_allocations_post_launch || 0);
  const publicFloor = Number(release?.public_sample_floor || 10);
  const matureFloor = Number(release?.mature_sample_floor || 30);

  const checkedAt = Date.parse(String(lab?.checked_at || ''));
  const ageSeconds = Number.isFinite(checkedAt)
    ? Math.max(0, Math.floor((Date.now() - checkedAt) / 1000))
    : null;
  const stale = ageSeconds == null || ageSeconds > 600;
  const impossibleCounts = matchedResolved > matchedAlloc;
  const inconsistentRecent = recent.filter((row: AnyJson) => row?.outcome_consistent === false).length;
  const allocationBase = Math.max(controlAlloc, challengerAlloc, 1);
  const alignment = Math.max(0, Math.min(100, Math.round((matchedAlloc / allocationBase) * 100)));
  const maturity = matchedResolved >= matureFloor
    ? 'MATURE · HUMAN REVIEW ELIGIBLE'
    : matchedResolved >= publicFloor
      ? 'EARLY · DESCRIPTIVE STATS'
      : `SMALL N · ${matchedResolved}/${publicFloor}`;

  const blockers: string[] = [];
  if (!lab?.ok) blockers.push('V138 telemetry unavailable');
  if (stale) blockers.push('evaluation freshness >10m');
  if (impossibleCounts) blockers.push('resolved count exceeds matched allocations');
  if (inconsistentRecent > 0) blockers.push(`${inconsistentRecent} recent outcome consistency check(s)`);
  if (matchedResolved < publicFloor) blockers.push(`sample gate ${matchedResolved}/${publicFloor}`);
  if (controlAlloc !== challengerAlloc) blockers.push(`allocation imbalance ${controlAlloc} vs ${challengerAlloc}`);

  const integrityState = !lab?.ok || stale || impossibleCounts || inconsistentRecent > 0
    ? 'FAIL CLOSED'
    : matchedResolved >= matureFloor
      ? 'REVIEW READY · HUMAN DECISION ONLY'
      : matchedResolved >= publicFloor
        ? 'OBSERVE · EARLY EVIDENCE'
        : 'LEARNING · SAMPLE GATE ACTIVE';

  set('v139-state', `INTEGRITY · ${integrityState}`);
  set('v139-copy',
    !lab?.ok
      ? 'The challenger experiment cannot be evaluated because its governed telemetry is unavailable.'
      : 'V139 checks freshness, cohort alignment, outcome consistency and evidence maturity before any human review can even be considered.'
  );
  set('v139-freshness', ageSeconds == null ? 'WITHHELD' : `${ageSeconds}s`);
  set('v139-alignment', `${alignment}%`);
  set('v139-maturity', maturity);
  set('v139-consistency', inconsistentRecent === 0 ? 'CLEAR' : `${inconsistentRecent} CHECK`);
  set('v139-promotion', 'DISABLED');
  set('v139-capital', '0R · LOCKED');
  set('v139-orb', integrityState.startsWith('FAIL') ? 'LOCK' : matchedResolved >= matureFloor ? '30+' : `${matchedResolved}/${publicFloor}`);

  const host = byId('v139-blockers');
  if (host) {
    host.replaceChildren();
    const items = blockers.length ? blockers : ['No integrity blocker beyond human review governance'];
    for (const item of items.slice(0, 6)) {
      const chip = document.createElement('span');
      chip.className = blockers.length ? 'integrity-chip integrity-chip-warn' : 'integrity-chip integrity-chip-clear';
      chip.textContent = item.toUpperCase();
      host.appendChild(chip);
    }
  }

  set('v139-detail',
    `V139 does not choose a winner and cannot promote risk. Matched ${matchedResolved}/${matchedAlloc || 0} resolved/allocated · control ${controlAlloc} · challenger ${challengerAlloc} · telemetry ${ageSeconds == null ? 'unknown age' : ageSeconds + 's old'} · live orders OFF · real capital 0R.`
  );
}


async function loadGoldRiskChallengerEvaluation() {
  const lab = await read('public-gold-risk-challenger-evaluation', 9000);
  renderV140PromotionReviewGate(lab);
  renderV139ExperimentIntegrity(lab);
  const matchHost = byId('v138-match-list');
  const progress = byId('v138-progress-fill') as HTMLElement | null;

  if (!lab?.ok) {
    set('v138-state', 'CHALLENGER LAB · FAIL CLOSED');
    set('v138-copy', 'Prospective comparison telemetry is unavailable. No policy conclusion is inferred.');
    for (const id of ['v138-matched','v138-public-gate','v138-mature-gate','v138-control-performance','v138-challenger-performance','v138-control-alloc','v138-challenger-alloc','v138-control-only','v138-challenger-only']) set(id, null);
    set('v138-verdict', 'WITHHELD');
    set('v138-orb', 'LOCK');
    if (progress) progress.style.width = '0%';
    matchHost?.replaceChildren();
    set('v138-detail', 'Fail closed: no winner selection, no policy promotion, live execution OFF, real capital 0R.');
    return;
  }

  const cohort = lab?.cohort ?? {};
  const release = lab?.release ?? {};
  const stats = lab?.matched_statistics ?? null;
  const recent = Array.isArray(lab?.recent_matches) ? lab.recent_matches : [];
  const matched = Number(cohort?.matched_resolved || 0);
  const publicFloor = Number(release?.public_sample_floor || 10);
  const matureFloor = Number(release?.mature_sample_floor || 30);
  const publicProgress = publicFloor > 0 ? Math.min(100, (matched / publicFloor) * 100) : 0;

  set('v138-state', `CHALLENGER LAB · ${first(lab?.state, 'WITHHELD')}`);
  set('v138-copy',
    release?.statistics_withheld
      ? `Matched prospective sample is ${matched}/${publicFloor}. Performance statistics remain withheld until the release floor is earned.`
      : `Matched prospective evidence is public. Descriptive statistics remain non-authoritative and cannot auto-promote a policy.`
  );
  set('v138-matched', matched);
  set('v138-public-gate', `${matched} / ${publicFloor}`);
  set('v138-mature-gate', `${matched} / ${matureFloor}`);
  set('v138-verdict', 'WITHHELD · NO AUTO WINNER');
  set('v138-orb', `${matched}/${publicFloor}`);
  if (progress) progress.style.width = `${publicProgress}%`;

  set('v138-control-alloc', cohort?.control_allocations_post_launch ?? 0);
  set('v138-challenger-alloc', cohort?.challenger_allocations_post_launch ?? 0);
  set('v138-control-only', cohort?.control_only_allocations ?? 0);
  set('v138-challenger-only', cohort?.challenger_only_allocations ?? 0);

  if (stats) {
    const controlR = Number(stats?.control_cumulative_gross_r);
    const challengerR = Number(stats?.challenger_cumulative_gross_r);
    const controlDd = Number(stats?.control_max_drawdown_r);
    const challengerDd = Number(stats?.challenger_max_drawdown_r);
    set('v138-control-performance',
      Number.isFinite(controlR) && Number.isFinite(controlDd)
        ? `${controlR >= 0 ? '+' : ''}${controlR.toFixed(2)}R · DD ${controlDd.toFixed(2)}R`
        : null
    );
    set('v138-challenger-performance',
      Number.isFinite(challengerR) && Number.isFinite(challengerDd)
        ? `${challengerR >= 0 ? '+' : ''}${challengerR.toFixed(2)}R · DD ${challengerDd.toFixed(2)}R`
        : null
    );
    set('v138-control-copy', 'Matched prospective fixed-1R control evidence. Gross R, not money P&L.');
    set('v138-challenger-copy', 'Matched prospective adaptive-risk evidence. No automatic winner or capital promotion.');
  } else {
    set('v138-control-performance', 'WITHHELD · SMALL N');
    set('v138-challenger-performance', 'WITHHELD · SMALL N');
    set('v138-control-copy', `Waiting for ${release?.resolved_until_public_statistics ?? Math.max(0, publicFloor - matched)} more matched resolved outcomes before public statistics.`);
    set('v138-challenger-copy', 'The challenger cannot use historical outcomes to select itself. Only forward matched evidence counts.');
  }

  if (matchHost) {
    matchHost.replaceChildren();
    if (!recent.length) {
      const empty = document.createElement('article');
      empty.className = 'challenger-match challenger-match-empty';
      const title = document.createElement('strong');
      title.textContent = 'WAITING FOR FIRST PROSPECTIVE MATCH';
      const copy = document.createElement('small');
      copy.textContent = 'A row is created only after both control and challenger allocated the same forward signal and its outcome resolved.';
      empty.append(title, copy);
      matchHost.appendChild(empty);
    } else {
      for (const row of recent.slice(0, 4)) {
        const card = document.createElement('article');
        card.className = 'challenger-match';
        const top = document.createElement('div');
        const side = document.createElement('strong');
        side.textContent = `${row?.side ?? '?'} · INTENT #${row?.intent_id ?? 'n/a'}`;
        const state = document.createElement('span');
        state.textContent = row?.outcome_consistent ? 'MATCHED' : 'CHECK';
        top.append(side, state);
        const detail = document.createElement('small');
        const control = Number(row?.control_portfolio_gross_r);
        const challenger = Number(row?.challenger_portfolio_gross_r);
        detail.textContent = Number.isFinite(control) && Number.isFinite(challenger)
          ? `Control ${control >= 0 ? '+' : ''}${control.toFixed(2)}R · Challenger ${challenger >= 0 ? '+' : ''}${challenger.toFixed(2)}R · ${row?.resolution_code ?? 'resolved'}`
          : 'Matched outcome recorded.';
        card.append(top, detail);
        matchHost.appendChild(card);
      }
    }
  }

  set('v138-detail',
    `Scope MATCHED PROSPECTIVE ONLY · matched ${cohort?.matched_allocations ?? 0} allocated / ${matched} resolved · control-only ${cohort?.control_only_allocations ?? 0} · challenger-only ${cohort?.challenger_only_allocations ?? 0} · automatic winner NO · automatic promotion NO · live orders OFF · real capital 0R.`
  );
}

async function loadGoldAdaptivePaperRisk() {
  const adaptive = await read('public-gold-adaptive-paper-risk', 9000);

  if (!adaptive?.ok) {
    set('v137-risk-state', 'ADAPTIVE RISK · FAIL CLOSED');
    set('v137-risk-copy', 'The adaptive paper-risk governor is unavailable. No challenger allocation is promoted.');
    for (const id of ['v137-next-risk','v137-sample','v137-dd','v137-loss','v137-challenger','v137-gross-r','v137-decisions','v137-open']) set(id, null);
    set('v137-risk-orb', '0R');
    set('v137-live', 'OFF');
    set('v137-capital', '0R');
    const fill = byId('v137-risk-fill');
    if (fill) fill.style.width = '0%';
    set('v137-detail', 'Fail closed. Fixed control remains separate; no live order or real-capital authority exists here.');
    return;
  }

  const state = first(adaptive?.state, 'FAIL_CLOSED');
  const nextRisk = Number(adaptive?.next_paper_risk_r);
  const ch = adaptive?.challenger ?? {};
  const gov = adaptive?.governance ?? {};
  const open = ch?.current_open ?? null;
  const gross = Number(ch?.cumulative_gross_r);
  const dd = Number(ch?.max_drawdown_r);
  const loss = Number(ch?.loss_streak ?? 0);

  set('v137-risk-state', `ADAPTIVE RISK · ${state}`);
  set('v137-risk-copy',
    state === 'DRAWDOWN_DEFENSE' || state === 'CONSENSUS_DEFENSE'
      ? 'Paper risk is throttled because resolved evidence shows drawdown or a defensive loss streak. The throttle affects only future V137 challenger decisions.'
      : state === 'DEEP_DRAWDOWN_DEFENSE' || state === 'CONSENSUS_DEEP_DEFENSE'
        ? 'Both independent risk models are at the defensive floor. The challenger stays available for learning while real capital remains locked.'
        : state === 'MODEL_DISAGREEMENT_DEFENSE'
          ? 'The independent risk models disagree, so the consensus firewall automatically uses the smaller paper risk.'
          : 'The challenger is sizing future paper opportunities from resolved evidence and sample maturity.'
  );
  set('v137-next-risk', Number.isFinite(nextRisk) ? `${nextRisk.toFixed(2)}R` : null);
  set('v137-risk-orb', Number.isFinite(nextRisk) ? `${nextRisk.toFixed(2)}R` : '0R');
  set('v137-sample', ch?.resolved_events ?? 0);
  set('v137-dd', Number.isFinite(dd) ? `${dd.toFixed(2)}R` : null);
  set('v137-loss', loss);
  set('v137-gross-r', Number.isFinite(gross) ? `${gross >= 0 ? '+' : ''}${gross.toFixed(2)}R · GROSS` : 'WITHHELD');
  set('v137-decisions', ch?.total_decisions ?? 0);
  set('v137-open', ch?.open_allocations ?? 0);
  set('v137-live', gov?.order_submission_enabled ? 'CHECK REQUIRED' : 'OFF');
  set('v137-capital', first(gov?.real_capital_permission, '0R'));

  if (open) {
    set('v137-challenger', `${open.side ?? 'PAPER'} · ${Number(open.allocated_paper_r ?? 0).toFixed(2)}R`);
    set('v137-challenger-copy',
      `Prospective challenger decision #${open.id ?? '—'} · entry ${open.source_price ?? 'withheld'} · stop ${open.stop_price ?? 'withheld'} · target ${open.target_price ?? 'withheld'}. Research only.`
    );
  } else {
    set('v137-challenger', 'WAITING FOR NEW SIGNAL');
    set('v137-challenger-copy', 'Only new post-launch signals can enter the adaptive challenger. Existing V133 paper positions are not resized.');
  }

  const fill = byId('v137-risk-fill');
  if (fill) {
    const pct = Number.isFinite(nextRisk) ? Math.max(0, Math.min(100, nextRisk * 100)) : 0;
    fill.style.width = `${pct}%`;
  }

  set('v137-risk-memory-copy',
    `Resolved evidence ${ch?.resolved_events ?? 0} · loss streak ${loss} · max drawdown ${Number.isFinite(dd) ? dd.toFixed(2) + 'R' : 'n/a'}. Gross R is not money P&L; measured execution costs are still required for net R.`
  );
  const consensus = adaptive?.risk_consensus ?? {};
  set('v137-detail',
    `Adaptive challenger: next risk ${Number.isFinite(nextRisk) ? nextRisk.toFixed(2) + 'R' : 'withheld'} · models ${consensus?.models_agree ? 'AGREE' : 'DISAGREEMENT→MIN'} · adaptive ${consensus?.adaptive_model_r ?? 'n/a'}R · independent ${consensus?.independent_model_r ?? 'n/a'}R · decisions ${ch?.total_decisions ?? 0} · open ${ch?.open_allocations ?? 0} · retroactive allocation OFF · live execution OFF · real capital ${first(gov?.real_capital_permission, '0R')}.`
  );
}

async function loadGoldExecutionFirewall() {
  const firewall = await read('public-gold-execution-firewall', 9000);
  const host = byId('v136-checks-grid');

  if (!firewall?.ok) {
    set('v136-firewall-state', 'ORDER FIREWALL · FAIL CLOSED');
    set('v136-firewall-copy', 'Execution qualification is unavailable. No order envelope is promoted and all real-money paths remain blocked.');
    for (const id of ['v136-order','v136-side','v136-risk','v136-entry','v136-stop','v136-target','v136-rr','v136-quote','v136-idempotency','v136-paper-resolved','v136-paper-gross-r','v136-paper-dd','v136-paper-loss-streak']) set(id, null);
    set('v136-real-orders', '0');
    set('v136-broker', 'NOT CONNECTED');
    set('v136-route', 'ABSENT');
    set('v136-submit', 'BLOCKED');
    set('v136-capital', '0R');
    set('v136-orb', 'LOCK');
    host?.replaceChildren();
    set('v136-detail', 'Fail closed: no live broker call, no order transmission, no real capital.');
    return;
  }

  const order = firewall?.order ?? null;
  const qualification = firewall?.qualification ?? {};
  const governance = firewall?.governance ?? {};
  const performance = firewall?.paper_portfolio ?? {};
  const checks = Array.isArray(qualification?.checks) ? qualification.checks : [];
  const blockers = Array.isArray(order?.blocker_codes) ? order.blocker_codes : [];

  set('v136-firewall-state', `ORDER FIREWALL · ${first(firewall?.state, 'FAIL_CLOSED')}`);
  set('v136-firewall-copy',
    order
      ? `Dry-run ${order.side ?? ''} envelope ${order.client_order_id ?? ''} is frozen for audit. Live submission remains blocked by ${blockers.length} prerequisites.`
      : 'No active paper allocation is available to qualify. The firewall is waiting without inventing an order.'
  );
  set('v136-order', order?.client_order_id ?? 'WAITING');
  set('v136-side', order?.side ?? 'NONE');
  set('v136-risk', order?.requested_r == null ? '0R' : `${order.requested_r}R · DRY RUN`);
  set('v136-real-orders', governance?.real_orders_sent ?? 0);
  set('v136-paper-resolved', performance?.resolved_events ?? 0);
  const grossR = Number(performance?.cumulative_gross_r);
  set('v136-paper-gross-r', Number.isFinite(grossR) ? `${grossR >= 0 ? '+' : ''}${grossR.toFixed(2)}R · GROSS` : null);
  const maxDd = Number(performance?.max_drawdown_r);
  set('v136-paper-dd', Number.isFinite(maxDd) ? `${maxDd.toFixed(2)}R` : null);
  set('v136-paper-loss-streak', performance?.loss_streak ?? 0);
  set('v136-entry', order?.reference_entry);
  set('v136-stop', order?.reference_stop);
  set('v136-target', order?.reference_target);
  set('v136-rr', order?.reference_rr == null ? null : `${order.reference_rr}R`);
  set('v136-quote', first(order?.quote_class, 'DELAYED_RESEARCH_REFERENCE'));
  const idem = String(order?.idempotency_key ?? '');
  set('v136-idempotency', idem ? `${idem.slice(0,12)}…` : null);
  set('v136-broker', governance?.broker_adapter_state === 'CONNECTED' ? 'CONNECTED' : 'NOT CONNECTED');
  set('v136-route', governance?.order_submission_enabled ? 'CHECK REQUIRED' : 'ABSENT');
  set('v136-submit', qualification?.live_submission_permitted ? 'CHECK REQUIRED' : 'BLOCKED');
  set('v136-capital', first(governance?.real_capital_permission, '0R'));
  set('v136-orb', qualification?.live_submission_permitted ? 'REVIEW' : 'LOCK');

  if (host) {
    host.replaceChildren();
    if (!checks.length) {
      const empty = document.createElement('article');
      empty.className = 'firewall-check firewall-check-block';
      const dot = document.createElement('span');
      dot.className = 'firewall-check-dot';
      const copy = document.createElement('div');
      const label = document.createElement('strong');
      label.textContent = 'QUALIFICATION EVIDENCE';
      const state = document.createElement('small');
      state.textContent = 'WITHHELD · LOCKED';
      copy.append(label, state);
      empty.append(dot, copy);
      host.appendChild(empty);
    } else {
      for (const check of checks) {
        const passed = check?.passed === true;
        const card = document.createElement('article');
        card.className = `firewall-check ${passed ? 'firewall-check-pass' : 'firewall-check-block'}`;
        const dot = document.createElement('span');
        dot.className = 'firewall-check-dot';
        const copy = document.createElement('div');
        const label = document.createElement('strong');
        label.textContent = String(check?.label || check?.code || 'CHECK');
        const state = document.createElement('small');
        state.textContent = passed ? 'VERIFIED' : 'LOCKED';
        copy.append(label, state);
        card.append(dot, copy);
        host.appendChild(card);
      }
    }
  }

  set('v136-detail',
    `Qualified ${qualification?.passed ?? 0}/${qualification?.total ?? checks.length} checks · blockers ${qualification?.live_blockers ?? blockers.length} · research sample ${qualification?.resolved_research_sample ?? 0}/${qualification?.mature_sample_required ?? 30} · paper gross R ${Number.isFinite(grossR) ? grossR.toFixed(2) : 'n/a'} · live orders ${governance?.order_submission_enabled ? 'CHECK' : 'OFF'} · real capital ${first(governance?.real_capital_permission, '0R')}.`
  );
}

async function loadGoldOpportunityGovernor() {
  const governor = await read('public-gold-opportunity-governor', 10000);
  const host = byId('v135-prereq-grid');
  if (!governor?.ok) {
    set('v135-state', 'OPPORTUNITY GOVERNOR · FAIL CLOSED');
    set('v135-copy', 'Governor evidence is unavailable. Paper allocation and live execution are treated as locked.');
    for (const id of ['v135-paper-action','v135-slot','v135-sample','v135-blockers','v135-position','v135-entry','v135-mark','v135-stop','v135-target','v135-paper-r','v135-rr','v135-lab','v135-infra']) set(id, null);
    set('v135-orb', 'LOCK');
    set('v135-live-action', 'LOCKED');
    set('v135-capital', '0R');
    host?.replaceChildren();
    set('v135-detail', 'Fail closed: no live route, no real order, no automatic real capital.');
    return;
  }

  const decision = governor?.decision ?? {};
  const paper = governor?.paper_portfolio ?? {};
  const evidence = governor?.evidence ?? {};
  const governance = governor?.governance ?? {};
  const position = paper?.current_position ?? null;
  const prereqs = governor?.production_prerequisites ?? {};
  const blockers = Array.isArray(governor?.blocker_codes) ? governor.blocker_codes : [];

  set('v135-state', `OPPORTUNITY GOVERNOR · ${first(governor?.state, 'LOCKED')}`);
  set('v135-copy',
    decision?.autonomous_mode === 'PAPER_ONLY'
      ? position
        ? `Paper autonomy is holding one ${position.side} Gold slot while live execution remains locked behind ${blockers.length} prerequisites.`
        : `Paper autonomy is armed for the next eligible event. Live execution remains locked behind ${blockers.length} prerequisites.`
      : 'Governor is fail-closed. No autonomous allocation or live action is permitted.'
  );
  set('v135-paper-action', first(decision?.paper_action, 'PAPER_LOCKED'));
  set('v135-slot', position ? `OCCUPIED · ${first(position?.side, '?')}` : 'FREE');
  set('v135-sample', `${evidence?.resolved_shadow_sample ?? 0} / ${evidence?.mature_sample_required ?? 30}`);
  set('v135-blockers', blockers.length);
  set('v135-position', position ? `${first(position?.side, '?')} · ${first(position?.strategy_code, 'SHADOW EVENT')}` : 'NO OPEN PAPER POSITION');
  set('v135-position-detail',
    position
      ? `Intent #${position?.intent_id ?? 'n/a'} · 1-slot policy · paper risk ${position?.paper_risk_r ?? 'n/a'}R · executable quote NO.`
      : 'The one-slot paper portfolio is free. Overlapping opportunities are still prevented.'
  );
  set('v135-entry', position?.entry_price ?? 'n/a');
  set('v135-mark', position?.delayed_mark == null ? 'n/a' : `${position.delayed_mark} · DELAYED`);
  set('v135-stop', position?.stop_price ?? 'n/a');
  set('v135-target', position?.target_price ?? 'n/a');
  set('v135-paper-r',
    position?.unrealized_paper_r == null
      ? 'WITHHELD'
      : `${Number(position.unrealized_paper_r) >= 0 ? '+' : ''}${position.unrealized_paper_r}R`
  );
  set('v135-rr', position?.reference_rr == null ? 'n/a' : `${position.reference_rr}R`);
  set('v135-lab', `${evidence?.broker_lab_tests_passed ?? 0}/${evidence?.broker_lab_tests_total ?? 6} · SIM`);
  set('v135-infra', `${evidence?.infrastructure_verified ?? 0}/${evidence?.infrastructure_total ?? 6}`);
  set('v135-live-action', first(decision?.live_action, 'LOCKED'));
  set('v135-capital', first(governance?.real_capital_permission, '0R'));
  set('v135-orb', decision?.autonomous_mode === 'PAPER_ONLY' ? 'PAPER' : 'LOCK');

  if (host) {
    host.replaceChildren();
    const labels = {
      mature_research_sample: 'MATURE RESEARCH SAMPLE',
      execution_blockers_zero: 'ZERO EXECUTION BLOCKERS',
      all_infrastructure_verified: 'INFRASTRUCTURE VERIFIED',
      production_broker_verified: 'PRODUCTION BROKER VERIFIED',
      real_broker_connected: 'REAL BROKER CONNECTED',
      live_order_route_present: 'LIVE ORDER ROUTE',
      execution_grade_quote_available: 'EXECUTION-GRADE QUOTE',
      measured_spread_available: 'MEASURED SPREAD',
      measured_slippage_available: 'MEASURED SLIPPAGE',
      human_release_review_complete: 'HUMAN RELEASE REVIEW'
    };
    for (const [key, labelText] of Object.entries(labels)) {
      const passed = prereqs?.[key] === true;
      const card = document.createElement('article');
      card.className = `governor-prereq ${passed ? 'governor-prereq-pass' : 'governor-prereq-block'}`;
      const dot = document.createElement('span');
      dot.className = 'governor-prereq-dot';
      const copy = document.createElement('div');
      const label = document.createElement('strong');
      label.textContent = labelText;
      const state = document.createElement('small');
      state.textContent = passed ? 'VERIFIED' : 'LOCKED';
      copy.append(label, state);
      card.append(dot, copy);
      host.appendChild(card);
    }
  }

  set('v135-detail',
    `Mode ${first(decision?.autonomous_mode, 'LOCKED')} · paper ${first(decision?.paper_action, 'LOCKED')} · live ${first(decision?.live_action, 'LOCKED')} · production broker ${first(evidence?.production_broker_readiness, 'NOT_TESTED')} · human release required ${governance?.human_control_required_for_any_future_live_release ? 'YES' : 'CHECK'} · real capital ${first(governance?.real_capital_permission, '0R')}.`
  );
}

async function loadGoldBrokerAdapterLab() {
  const lab = await read('public-gold-broker-adapter-lab', 7000);
  const host = byId('v134-tests-grid');
  if (!lab?.ok) {
    set('v134-lab-state', 'BROKER ADAPTER LAB · UNAVAILABLE');
    set('v134-lab-copy', 'Adapter self-test telemetry is unavailable. Live broker execution remains absent.');
    for (const id of ['v134-tests','v134-orphans','v134-mode','v134-quote','v134-production']) set(id, null);
    set('v134-real-orders', '0');
    set('v134-capital', '0R');
    set('v134-orders', 'OFF');
    set('v134-orb-score', '0/6');
    if (host) host.replaceChildren();
    set('v134-detail', 'Fail closed: no live route, no broker call, no real order.');
    return;
  }

  const sim = lab?.lab ?? {};
  const boundary = lab?.production_boundary ?? {};
  const governance = lab?.governance ?? {};
  const tests = Array.isArray(sim?.tests) ? sim.tests : [];
  const passed = Number(sim?.tests_passed || 0);
  const total = Number(sim?.tests_total || tests.length || 6);

  set('v134-lab-state', `BROKER ADAPTER LAB · ${first(lab?.state, 'WAITING_FOR_SELFTEST')}`);
  set('v134-lab-copy',
    lab?.state === 'PASS_SIMULATION_ONLY'
      ? 'The simulated adapter mechanics passed. Production broker readiness remains a separate, untested boundary.'
      : 'The adapter lab is fail-closed until every deterministic safety test passes.'
  );
  set('v134-tests', `${passed} / ${total}`);
  set('v134-real-orders', sim?.real_orders_sent ?? 0);
  set('v134-orphans', sim?.orphan_event_count ?? 0);
  set('v134-capital', first(governance?.real_capital_permission, '0R'));
  set('v134-mode', first(sim?.adapter_mode, 'SIMULATED_ONLY'));
  set('v134-quote', first(sim?.quote_source, 'DETERMINISTIC_TEST_VECTOR'));
  set('v134-production', first(boundary?.production_broker_readiness, 'NOT_TESTED'));
  set('v134-orders', governance?.order_submission_enabled ? 'CHECK REQUIRED' : 'OFF');
  set('v134-orb-score', `${passed}/${total}`);

  if (host) {
    host.replaceChildren();
    for (const test of tests) {
      const card = document.createElement('article');
      card.className = `adapter-test ${test?.passed ? 'adapter-test-pass' : 'adapter-test-fail'}`;
      const pulse = document.createElement('span');
      pulse.className = 'adapter-test-pulse';
      const copy = document.createElement('div');
      const label = document.createElement('strong');
      label.textContent = String(test?.label || test?.code || 'TEST');
      const state = document.createElement('small');
      state.textContent = test?.passed ? 'PASS · SIMULATION' : 'FAIL · LOCKED';
      copy.append(label, state);
      card.append(pulse, copy);
      host.appendChild(card);
    }
  }

  set('v134-detail',
    `Mode ${first(sim?.adapter_mode, 'SIMULATED_ONLY')} · real broker ${boundary?.real_broker_connected ? 'CONNECTED' : 'NOT CONNECTED'} · live route ${boundary?.live_order_route_present ? 'PRESENT' : 'ABSENT'} · production readiness ${first(boundary?.production_broker_readiness, 'NOT_TESTED')} · real orders sent ${sim?.real_orders_sent ?? 0}.`
  );
}

async function loadGoldExecutionReality() {
  const reality = await read('public-gold-execution-reality', 7000);
  const gateHost = byId('v133-gates');
  if (!reality?.ok) {
    set('v133-reality-state', 'EXECUTION REALITY · UNAVAILABLE');
    set('v133-reality-copy', 'Readiness evidence is unavailable. Live execution remains locked.');
    for (const id of ['v133-sample','v133-blockers','v133-infra','v133-low','v133-mod','v133-high']) set(id, null);
    set('v133-capital', '0R');
    set('v133-orders', 'OFF');
    if (gateHost) gateHost.replaceChildren();
    const fill = byId('v133-readiness-fill');
    if (fill) fill.style.width = '0%';
    set('v133-detail', 'Fail closed: no broker route, no order submission, no real capital.');
    return;
  }

  const research = reality?.research ?? {};
  const gate = reality?.execution_gate ?? {};
  const governance = reality?.governance ?? {};
  const stats = research?.public_statistics;
  const sample = Number(research?.resolved_sample || 0);
  const publicFloor = Number(research?.minimum_public_sample || 10);
  const matureFloor = Number(research?.mature_research_sample || 30);
  const infraPassed = Number(gate?.infrastructure_passed || 0);
  const infraTotal = Number(gate?.infrastructure_total || 6);
  const blockerCount = Number(gate?.blocker_count || 0);

  set('v133-reality-state', `EXECUTION REALITY · ${first(reality?.state, 'LOCKED')}`);
  set('v133-reality-copy',
    sample < publicFloor
      ? `Shadow evidence is still small (n=${sample}). Performance remains withheld while execution gates stay locked.`
      : sample < matureFloor
        ? `Research evidence is visible but not mature (n=${sample}/${matureFloor}). Broker and risk gates remain independent blockers.`
        : 'Research maturity reached its minimum floor. Live execution still requires every infrastructure gate plus human release review.'
  );
  set('v133-sample', `${sample} / ${matureFloor}`);
  set('v133-blockers', blockerCount);
  set('v133-infra', `${infraPassed} / ${infraTotal}`);
  set('v133-capital', first(governance?.real_capital_permission, '0R'));
  set('v133-orders', governance?.order_submission_enabled ? 'CHECK REQUIRED' : 'OFF');

  if (research?.statistics_withheld || !stats) {
    set('v133-low', 'WITHHELD · n<10');
    set('v133-mod', 'WITHHELD · n<10');
    set('v133-high', 'WITHHELD · n<10');
  } else {
    set('v133-low', `${stats.average_low_friction_stress_r ?? 'n/a'}R`);
    set('v133-mod', `${stats.average_moderate_friction_stress_r ?? 'n/a'}R`);
    set('v133-high', `${stats.average_high_friction_stress_r ?? 'n/a'}R`);
  }

  if (gateHost) {
    gateHost.replaceChildren();
    for (const item of Array.isArray(gate?.infrastructure) ? gate.infrastructure : []) {
      const card = document.createElement('article');
      card.className = `execution-gate ${item?.passed ? 'execution-gate-pass' : 'execution-gate-block'}`;
      const dot = document.createElement('span');
      dot.className = 'execution-gate-dot';
      const copy = document.createElement('div');
      const label = document.createElement('strong');
      label.textContent = String(item?.name || 'GATE');
      const state = document.createElement('small');
      state.textContent = item?.passed ? 'VERIFIED' : 'BLOCKED';
      copy.append(label, state);
      card.append(dot, copy);
      gateHost.appendChild(card);
    }
  }

  const fill = byId('v133-readiness-fill');
  if (fill) {
    const samplePct = Math.min(100, Math.max(0, (sample / matureFloor) * 100));
    const infraPct = infraTotal > 0 ? (infraPassed / infraTotal) * 100 : 0;
    const researchEdge = stats && Number(stats.average_high_friction_stress_r) > 0 ? 100 : 0;
    const readiness = Math.min(100, Math.max(0, samplePct * .35 + infraPct * .50 + researchEdge * .15));
    fill.style.width = `${readiness.toFixed(1)}%`;
  }

  set('v133-detail',
    `${first(research?.execution_evidence_state, 'NOT_EXECUTION_GRADE')} · friction stress is simulated, not broker-measured · broker ${first(gate?.broker_adapter_state, governance?.broker_adapter_state, 'NOT_CONNECTED')} · live orders ${governance?.order_submission_enabled ? 'ON' : 'OFF'} · automatic real capital ${governance?.automatic_real_capital ? 'ON' : 'OFF'}.`
  );
}

async function loadGoldAutonomousShadowTrader() {
  const shadow = await read('public-gold-autonomous-shadow-trader', 7000);
  if (!shadow?.ok) {
    set('v132-state', 'SHADOW EXECUTION · UNAVAILABLE');
    set('v132-copy', 'Shadow execution telemetry is unavailable. No trade state is inferred and real orders remain disabled.');
    for (const id of ['v132-intents','v132-open','v132-resolved','v132-stats','v132-price','v132-latest-study','v132-broker','v132-capital']) set(id, null);
    const host = byId('v132-open-studies');
    host?.replaceChildren();
    set('v132-detail', 'Fail closed: shadow telemetry unavailable · live orders OFF · real capital 0R.');
    return;
  }

  const pipeline = shadow?.pipeline ?? {};
  const performance = shadow?.performance ?? {};
  const market = shadow?.market ?? {};
  const governance = shadow?.governance ?? {};
  const resolved = Array.isArray(shadow?.recent_resolved) ? shadow.recent_resolved : [];
  const latestResolved = resolved[0] || null;

  set('v132-state', `AUTONOMOUS SHADOW · ${first(shadow?.state, 'COLLECTING')}`);
  set('v132-copy',
    Number(pipeline?.open_shadow_intents || 0) > 0
      ? `${pipeline.open_shadow_intents} shadow studies are tracking autonomously against governed stop/target geometry.`
      : 'V132 is waiting for the next level-transition event while preserving the real-capital firewall.'
  );
  set('v132-intents', pipeline?.total_shadow_intents ?? 0);
  set('v132-open', pipeline?.open_shadow_intents ?? 0);
  set('v132-resolved', pipeline?.resolved_shadow_outcomes ?? 0);
  set('v132-stats',
    performance?.statistics_withheld
      ? `WITHHELD · n<${pipeline?.minimum_public_sample ?? 10}`
      : performance?.public_statistics
        ? `AVG ${performance.public_statistics.average_gross_r}R · ${performance.public_statistics.gross_positive_rate_pct}% +R`
        : 'WITHHELD'
  );
  set('v132-price', market?.latest_delayed_price == null ? null : `${market.latest_delayed_price} · DELAYED`);
  set('v132-latest-study',
    latestResolved
      ? `${latestResolved.side} · ${latestResolved.resolution_code} · ${latestResolved.gross_r}R`
      : 'OPEN STUDIES ONLY'
  );
  set('v132-broker', first(governance?.broker_adapter_state, 'NOT_CONNECTED'));
  set('v132-capital', first(governance?.real_capital_permission, '0R'));
  set('v132-detail',
    `Event capture ${shadow?.methodology?.autonomous_event_capture ? 'AUTONOMOUS' : 'CHECK'} · entry basis ${first(shadow?.methodology?.entry_basis, 'WITHHELD')} · broker spread ${shadow?.methodology?.broker_spread_measured ? 'MEASURED' : 'NOT MEASURED'} · slippage ${shadow?.methodology?.slippage_measured ? 'MEASURED' : 'NOT MEASURED'} · live orders ${governance?.order_submission_enabled ? 'ON' : 'OFF'} · real capital ${first(governance?.real_capital_permission, '0R')}.`
  );

  renderV132ShadowStudies(shadow);
}

async function loadGoldReviewFreshness() {
  const freshness = await read('public-gold-review-freshness', 7000);
  if (!freshness?.ok) {
    set('v131-freshness-state', 'UNAVAILABLE');
    set('v131-freshness-copy', 'Review freshness telemetry is unavailable. Queue age is not inferred.');
    for (const id of ['v131-pending','v131-over','v131-p1-over','v131-oldest-p1','v131-p1-target','v131-p2-target','v131-latency','v131-capital']) set(id, null);
    set('v131-detail', 'Unavailable review freshness cannot grant execution or capital authority.');
    return;
  }

  const pipeline = freshness?.pipeline ?? {};
  const governance = freshness?.governance ?? {};
  const methodology = freshness?.methodology ?? {};
  const targets = methodology?.targets_minutes ?? {};
  const latency = freshness?.response_latency ?? {};

  set('v131-freshness-state', `REVIEW FRESHNESS · ${first(freshness?.state, 'COLLECTING')}`);
  set('v131-freshness-copy',
    freshness?.state === 'P1_OVER_TARGET'
      ? `${pipeline?.over_target_p1 ?? 0} P1 review items are beyond the operational attention target.`
      : freshness?.state === 'REVIEW_QUEUE_AGING'
        ? `${pipeline?.over_target_total ?? 0} review items are beyond their operational attention targets.`
        : 'Review queue is currently within operational attention targets.'
  );
  set('v131-pending', pipeline?.pending_directional_reviews ?? 0);
  set('v131-over', pipeline?.over_target_total ?? 0);
  set('v131-p1-over', pipeline?.over_target_p1 ?? 0);
  set('v131-oldest-p1', pipeline?.oldest_p1_minutes == null ? 'n/a' : `${pipeline.oldest_p1_minutes}m`);
  set('v131-p1-target', `${targets?.P1_HIGH_ATTENTION ?? 30}m`);
  set('v131-p2-target', `${targets?.P2_PRIORITY ?? 60}m`);
  set('v131-latency',
    latency?.statistics_withheld
      ? `WITHHELD · n<${latency?.minimum_public_sample ?? 5}`
      : latency?.public_statistics
        ? `AVG ${latency.public_statistics.average_minutes}m · n=${latency.public_statistics.sample_count}`
        : 'WITHHELD'
  );
  set('v131-capital', first(governance?.capital_permission, '0R'));
  set('v131-detail',
    `Target type: operational attention only · oldest-first ${methodology?.oldest_first_within_equal_priority ? 'ON' : 'OFF'} · performance data ${methodology?.performance_evidence_used ? 'ON' : 'OFF'} · future market data ${methodology?.market_future_data_used ? 'ON' : 'OFF'}.`
  );
}

async function loadGoldReviewPriority() {
  const priority = await read('public-gold-review-priority', 7000);
  if (!priority?.ok) {
    set('v130-priority-state', 'UNAVAILABLE');
    set('v130-priority-copy', 'Review routing telemetry is unavailable. The private review queue remains authoritative.');
    for (const id of ['v130-assignments','v130-pending','v130-p1','v130-top-score','v130-p1-band','v130-p2-band','v130-model','v130-capital']) set(id, null);
    set('v130-detail', 'Unavailable routing data never grants execution or capital authority.');
    return;
  }

  const pipeline = priority?.pipeline ?? {};
  const governance = priority?.governance ?? {};
  const methodology = priority?.methodology ?? {};
  const bands = Array.isArray(priority?.bands) ? priority.bands : [];
  const byBand = (name) => bands.find((x) => x?.priority_band === name) || {};
  const p1 = byBand('P1_HIGH_ATTENTION');
  const p2 = byBand('P2_PRIORITY');

  set('v130-priority-state', `REVIEW ROUTING · ${first(priority?.state, 'COLLECTING')}`);
  set('v130-priority-copy',
    Number(pipeline?.pending_directional_reviews || 0) > 0
      ? `${pipeline.pending_directional_reviews} directional reviews are pending; ${pipeline.high_attention_pending ?? 0} are P1 high-attention.`
      : 'No pending directional review candidates are currently routed.'
  );
  set('v130-assignments', pipeline?.assignments ?? 0);
  set('v130-pending', pipeline?.pending_directional_reviews ?? 0);
  set('v130-p1', pipeline?.high_attention_pending ?? 0);
  set('v130-top-score', pipeline?.top_pending_score ?? 'n/a');
  set('v130-p1-band', `${p1?.pending_reviews ?? 0} pending`);
  set('v130-p2-band', `${p2?.pending_reviews ?? 0} pending`);
  set('v130-model', first(methodology?.scoring_version, 'WITHHELD'));
  set('v130-capital', first(governance?.capital_permission, '0R'));
  set('v130-detail',
    `Inputs: direction + event class + stated severity + transition specificity · performance data ${methodology?.performance_evidence_used ? 'ON' : 'OFF'} · reviewer reputation ${methodology?.reviewer_reputation_used ? 'ON' : 'OFF'} · auto execution ${governance?.automatic_execution ? 'ON' : 'OFF'}.`
  );
}

async function loadGoldContextualDisagreement() {
  const context = await read('public-gold-contextual-disagreement', 7000);
  if (!context?.ok) {
    set('v129-context-state', 'UNAVAILABLE');
    set('v129-context-copy', 'Contextual disagreement evidence is unavailable. No cohort result is inferred.');
    for (const id of ['v129-events','v129-scorable','v129-cohorts','v129-sample','v129-session','v129-structure','v129-signal','v129-capital']) set(id, null);
    set('v129-detail', 'Context weighting remains disabled when evidence is unavailable.');
    return;
  }

  const pipeline = context?.pipeline ?? {};
  const governance = context?.governance ?? {};
  const dimensions = Array.isArray(context?.dimensions) ? context.dimensions : [];
  const byName = (name) => dimensions.find((x) => x?.context_dimension === name) || {};
  const session = byName('SESSION_STATE');
  const structure = byName('DAILY_STRUCTURE');
  const signal = byName('SIGNAL_FAMILY');
  const maxN = Number(pipeline?.max_cohort_sample || 0);

  set('v129-context-state', `CONTEXT LAB · ${first(context?.state, 'WAITING_FOR_HUMAN_REVIEW')}`);
  set('v129-context-copy',
    context?.state === 'WAITING_FOR_HUMAN_REVIEW'
      ? 'No human disagreement exists yet, so no contextual cohort is manufactured.'
      : maxN < 10
        ? 'Context events are collecting prospectively. Cohort statistics remain withheld until each cohort reaches n≥10.'
        : 'Context cohorts crossed the publication floor. Results remain descriptive and cannot alter capital.'
  );
  set('v129-events', pipeline?.context_events ?? 0);
  set('v129-scorable', pipeline?.scorable_context_events ?? 0);
  set('v129-cohorts', pipeline?.cohort_cells ?? 0);
  set('v129-sample', maxN);
  set('v129-session', `${session?.cohort_count ?? 0} · max n=${session?.max_scorable_sample ?? 0}`);
  set('v129-structure', `${structure?.cohort_count ?? 0} · max n=${structure?.max_scorable_sample ?? 0}`);
  set('v129-signal', `${signal?.cohort_count ?? 0} · max n=${signal?.max_scorable_sample ?? 0}`);
  set('v129-capital', first(governance?.capital_permission, '0R'));
  set('v129-detail',
    `Frozen anchor context ${context?.methodology?.context_frozen_from_post_review_anchor_snapshot ? 'YES' : 'NO'} · hindsight reconstruction ${context?.methodology?.outcome_context_not_reconstructed_after_resolution ? 'OFF' : 'CHECK'} · context weight ${governance?.automatic_context_weighting ? 'ON' : 'OFF'} · human override ${governance?.automatic_human_override ? 'ON' : 'OFF'} · machine override ${governance?.automatic_machine_override ? 'ON' : 'OFF'}.`
  );
}

async function loadGoldDisagreementIntelligence() {
  const disagreement = await read('public-gold-disagreement-intelligence', 7000);
  if (!disagreement?.ok) {
    set('v128-disagreement-state', 'UNAVAILABLE');
    set('v128-disagreement-copy', 'Human × Machine evidence is unavailable. No disagreement result is inferred.');
    for (const id of ['v128-reviews','v128-outcomes','v128-events','v128-sample','v128-15m','v128-30m','v128-override','v128-capital']) set(id, null);
    set('v128-detail', 'Neither human nor machine gains override authority when evidence is unavailable.');
    return;
  }

  const pipeline = disagreement?.pipeline ?? {};
  const governance = disagreement?.governance ?? {};
  const horizons = Array.isArray(disagreement?.horizons) ? disagreement.horizons : [];
  const h15 = horizons.find((x) => Number(x?.horizon_minutes) === 15) || {};
  const h30 = horizons.find((x) => Number(x?.horizon_minutes) === 30) || {};
  const maxN = Number(pipeline?.max_scorable_disagreement_sample || 0);
  const floor = Number(h15?.minimum_public_sample || h30?.minimum_public_sample || 10);

  set('v128-disagreement-state', `HUMAN × MACHINE · ${first(disagreement?.state, 'WAITING_FOR_HUMAN_REVIEW')}`);
  set('v128-disagreement-copy',
    disagreement?.state === 'WAITING_FOR_HUMAN_REVIEW'
      ? 'No human review exists yet, so no agreement or disagreement evidence is manufactured.'
      : maxN < floor
        ? `Disagreement evidence is collecting prospectively. Comparative statistics remain withheld until n≥${floor}.`
        : 'Disagreement evidence crossed the publication floor. Results remain descriptive and cannot override either side.'
  );
  set('v128-reviews', pipeline?.human_review_events ?? 0);
  set('v128-outcomes', pipeline?.review_outcomes ?? 0);
  set('v128-events', pipeline?.disagreement_events ?? 0);
  set('v128-sample', maxN);
  set('v128-15m', `n=${h15?.scorable_disagreements ?? 0} · ${h15?.disagreement_statistics_withheld ? 'WITHHELD' : 'AVAILABLE'}`);
  set('v128-30m', `n=${h30?.scorable_disagreements ?? 0} · ${h30?.disagreement_statistics_withheld ? 'WITHHELD' : 'AVAILABLE'}`);
  set('v128-override',
    governance?.automatic_human_override || governance?.automatic_machine_override
      ? 'CHECK REQUIRED'
      : 'NONE'
  );
  set('v128-capital', first(governance?.capital_permission, '0R'));
  set('v128-detail',
    `Explicit contradiction required ${disagreement?.methodology?.disagreement_requires_explicit_human_contradiction ? 'YES' : 'NO'} · supportive=agreement · human override ${governance?.automatic_human_override ? 'ON' : 'OFF'} · machine override ${governance?.automatic_machine_override ? 'ON' : 'OFF'} · auto weighting ${governance?.automatic_weighting ? 'ON' : 'OFF'}.`
  );
}

async function loadGoldReviewIntelligence() {
  const review = await read('public-gold-review-intelligence', 7000);
  if (!review?.ok) {
    set('v127-review-state', 'UNAVAILABLE');
    set('v127-review-copy', 'Review Intelligence is unavailable. No reviewer evidence is inferred.');
    for (const id of ['v127-reviews','v127-anchors','v127-outcomes','v127-sample','v127-15m','v127-30m','v127-public-stats','v127-capital']) set(id, null);
    set('v127-detail', 'Human evidence remains separate from execution authority.');
    return;
  }

  const pipeline = review?.pipeline ?? {};
  const governance = review?.governance ?? {};
  const horizons = Array.isArray(review?.horizons) ? review.horizons : [];
  const h15 = horizons.find((x) => Number(x?.horizon_minutes) === 15) || {};
  const h30 = horizons.find((x) => Number(x?.horizon_minutes) === 30) || {};
  const maxN = Number(pipeline?.max_scorable_sample || 0);
  const floor = Number(h15?.minimum_public_sample || h30?.minimum_public_sample || 10);

  set('v127-review-state', `REVIEW INTELLIGENCE · ${first(review?.state, 'WAITING_FOR_HUMAN_REVIEW')}`);
  set('v127-review-copy',
    review?.state === 'WAITING_FOR_HUMAN_REVIEW'
      ? 'No human evidence judgment has been recorded yet. The system will not fabricate one.'
      : maxN < floor
        ? `Prospective review outcomes are collecting. Public reviewer statistics remain withheld until n≥${floor}.`
        : 'Review evidence crossed the public sample floor. Statistics remain descriptive and cannot grant capital.'
  );
  set('v127-reviews', pipeline?.human_review_events ?? 0);
  set('v127-anchors', pipeline?.post_review_anchors ?? 0);
  set('v127-outcomes', pipeline?.resolved_review_outcomes ?? 0);
  set('v127-sample', maxN);
  set('v127-15m', `n=${h15?.scorable_count ?? 0} · ${h15?.statistics_withheld ? 'WITHHELD' : 'AVAILABLE'}`);
  set('v127-30m', `n=${h30?.scorable_count ?? 0} · ${h30?.statistics_withheld ? 'WITHHELD' : 'AVAILABLE'}`);
  set('v127-public-stats', maxN < floor ? 'WITHHELD · SMALL N' : 'DESCRIPTIVE ONLY');
  set('v127-capital', first(governance?.capital_permission, '0R'));
  set('v127-detail',
    `Post-review anchor ${review?.methodology?.post_review_server_capture_anchor ? 'ON' : 'OFF'} · identity public ${review?.methodology?.reviewer_identity_public ? 'YES' : 'NO'} · notes public ${review?.methodology?.reviewer_notes_public ? 'YES' : 'NO'} · auto weighting ${governance?.automatic_weighting ? 'ON' : 'OFF'} · auto promotion ${governance?.automatic_promotion ? 'ON' : 'OFF'}.`
  );
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
      loadV162ProspectiveCollisionRevalidation(),
      loadV161SchedulerExperimentRegistry(),
      loadV160LatestRollbackRehearsal(),
      loadV159LatestExperimentAdmission(),
      loadV158MemberAlertPostShiftObserver(),
      loadV156QuotaGuardRecoveryShadow(),
      loadV154RollbackRehearsalShadow(),
      loadV153SchedulerMutationAdmission(),
      loadV152PostShiftObserver(),
      loadV151SingleCandidatePlanShadow(),
      loadV150NetworkSlaEvidenceShadow(),
      loadV149DependencyIsolationShadow(),
      loadV148PredictiveCollisionShadow(),
      loadV147ConnectionPressureShadow(),
      loadV1461ControlledPeakSpreader(),
      loadV145ConnectionAdmissionShadow(),
      loadV144SchedulerLoadGovernor(),
      loadV143StabilityConfirmation(),
      loadV142RuntimeRecoveryEngine(),
      loadV141RuntimeRecoverySentinel(),
      loadGoldRiskChallengerEvaluation(),
      loadGoldAdaptivePaperRisk(),
      loadGoldExecutionFirewall(),
      loadGoldOpportunityGovernor(),
      loadGoldBrokerAdapterLab(),
      loadGoldExecutionReality(),
      loadGoldAutonomousShadowTrader(),
      loadGoldReviewFreshness(),
      loadGoldReviewPriority(),
      loadGoldContextualDisagreement(),
      loadGoldDisagreementIntelligence(),
      loadGoldReviewIntelligence(),
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