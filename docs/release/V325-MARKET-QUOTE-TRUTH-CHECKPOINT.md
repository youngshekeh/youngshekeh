# V325 · Per-Asset Market Quote Truth, Provenance and Readiness Gate

**Date:** October 27, 2026 UTC
**Branch:** `security/v325-market-quote-integrity`
**Pull request:** #292 (draft, review only)
**Production:** V311 remains live. No production deployment or database migration in V325.

## Verified live production diagnostics

Read-only inspection of Supabase project `mpcelmjiycjpdyyflisn` showed:
- `public.live_markets_snapshots`: 3,248 existing rows, most recent observed **2026-10-27 06:15:18 UTC**.
- `public.gold_live_snapshots`: 3,148 rows, most recent observed **2026-10-27 06:15:19 UTC**; another sample at **06:20:11 UTC** explicitly marked `DELAYED_LIVE` with `quote_age_minutes=10.9`.
- `public.gold_spot_snapshots`: **373** rows; most recent **2026-09-15 07:10:07 UTC**. This historical spot snapshot stream is over a month stale and cannot be advertised as current.
- `public.gold_live_xauusd_ticks`: **zero** stored MT5 broker tick rows. This does not prove the broker terminal is disconnected everywhere, but there is no persisted live tick proof from this table.
- The latest observed market engine `source_times` are *not* equal to the snapshot creation time. One sample created 06:20:11 UTC contained **Gold 06:09:58, DXY 06:10:03, Brent 06:09:13, US10Y 2026-10-26 18:59:52, EURUSD 06:19:42 and Bitcoin 06:20:01 UTC**. Each asset must have its own quote age; a new record with old quotes is not “live.”
- The deployed `public-live-markets-api` v11 uses the `public-gold-live-xauusd` Gold spine and shows Gold spot when available, or Gold futures as fallback; some data is sourced from the deployed `public-gold-live-api` v12’s Yahoo Finance delayed market indicators and indicative spot providers. **No current commercial redistribution/resale licence was verified.** Source timestamps are distinct from permission to redistribute or execute.

These are timestamped production observations, not a claim that the new V325 code is deployed or that current market prices/market-time quotes remain unchanged.

## V325 source under review

1. `docs/release/V325-REVIEW-ONLY-public-live-markets-api.ts` is forked from real deployed v11, preserving existing score and market regime structure, but enforcing independent Gold, DXY, US10Y, Brent, EURUSD and Bitcoin quote-age checks based on the **provider quote `market_time`**, rather than its `generated_at` or snapshot `captured_at`.
   - Valid numeric price required; absent/unparseable/future-skewed timestamps are `UNVERIFIED`, 10–30m are `DELAYED_INDICATIVE`, older than 30m are `STALE`, and at most 10m are `FRESH_INDICATIVE`.
   - Nonfresh asset prices are suppressed from the main `price` field, preserved only as explicitly `last_observed_price`. Nonfresh asset confidence, bias, change, and directional drivers are gated.
   - If Gold, DXY or Brent is not individually fresh (or the session/market spine is unavailable/closed), the global quote gate is `BLOCKED`, market status `DATA_GATED`, capital permission `WAIT / 0R`, and regime `DATA_GATED` without stale directional drivers. Bitcoin and EURUSD remain independently gated if stale even if critical assets are recent.
   - The Gold context also gates secondary `spot_price`, `futures_price`, and `basis_usd` fields so an unrelated UI card cannot accidentally display stale prices as fresh. Historical-only spot/futures references are separately named `last_observed_*`.
   - XAUUSD indicative spot is **not** silently substituted for COMEX futures and vice versa. Read-only broker tick age is checked separately. **Even an independently fresh broker tick never enables automated trading or claims licensed redistribution**.
   - On market spine outage, return HTTP 503 `Cache-Control: no-store` with `WAIT / 0R`, instead of falsely advertising a successful live quote.
2. `docs/release/V325-REVIEW-ONLY-MARKET-QUOTE-EVIDENCE.sql`: private service-role-only, stable read-only PostgreSQL `market_quote_evidence_v325()`; exposes only snapshot age, source times, per-asset stale status, spot archival age and MT5 tick count, not prices/credentials. Always `commercial_activation_permitted=false`, `machine_execution_allowed=false`, `WAIT / 0R`.
3. `tests/v325-market-quote-integrity.test.mjs`: 15 Node24 VM tests using **actual staged Edge source** with fake market prices/time. Covers all market assets, missing/future/tardy quotes, stale Gold spot vs recent futures, delayed oil, independent Bitcoin staleness, stale global risk/basis backdoors, no MT5 verification, simulated read-only fresh broker tick with execution disabled, upstream failures and method denial.
4. `tests/fixtures/v325-market-evidence-schema.sql`, `tests/v325-market-quote-evidence-acceptance.sql`: disposable PostgreSQL 17 fixture tests fresh database snapshot masking 45-minute-old DXY, 40-day-old Gold spot, no stored broker ticks, one synthetic broker tick never authorizing trading, invalid timestamps, role access and private redaction.
5. `.github/workflows/v317-atomic-payment-ledger.yml`: cumulative verification now runs V317–V324 atomic payment, cancellation, webhook, reconciliation, billing incident owner-AAL2 and V325 quote tests. Review-only; no prod SQL applied.

## Launch signoffs not resolved

- Confirm permitted professional/commercial redistribution and usage terms for live Gold, Oil/Brent, DXY, Bitcoin and supporting yield/FX sources; paid subscriptions must not represent a delayed public website quote as licensed live exchange/broker data.
- Integrate and verify authenticated direct MT5 quote ingestion and freshness; zero recorded XAUUSD tick rows in current production at the audit. Execution remains OFF.
- Gold spot archival collector must be diagnosed and reactivated only after data provider authorization; old Sep 15 rows never refreshed by this candidate.
- Verify actual Supabase backup inventory and rehearse restore into an isolated project before production migrations; do not restore in place.
- Real Flutterwave signed sandbox merchant payment/cancellation/refund/renewal, owner/member MFA, incident recovery runbook, historical billing timeout reconciliation, private RLS and hosted browser security/rollback.
- Avoid claim of retail or institutional quote execution quality without verified latency, attribution and licensing.

**Hard safety boundary:** V311 production READY; V325 draft unmerged. Commercial billing OFF. Live trading OFF. Capital WAIT / 0R. No production code, database, cron, API key, user account, or trade changed by this build.
