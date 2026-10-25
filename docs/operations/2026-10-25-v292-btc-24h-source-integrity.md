# V292 · Independent BTC 24/7 source integrity (2026-10-25)

## Why
A real V291 production smoke passed **8/9** at 2026-10-25 07:05 UTC (audit `10bc3073-5d68-4be0-9064-c6f77863c870`). Previously failing V55 and V50 passed at 5765ms and 4691ms. The sole remaining failure is `live-markets-snapshot-store`, whose last combined asset capture was from Friday Oct 23 20:55 UTC (34.17h old). Its `*/5 * * * 1-5` schedule intentionally skips weekends. The combined feed includes BTC and cannot be declared fresh during 24/7 crypto trading, nor backdated as `MARKET_CLOSED`.

## Source proof and the actual new module
At 2026-10-25 07:06 UTC, a read-only public Coinbase Exchange `BTC-USD` ticker request returned a numeric last trade price and an explicit `time` field on Sunday. This does not establish contractual commercial redistribution rights or uptime SLAs.

Add a **pure read-only research adapter** `src/v292-btc-24h-source.mjs`. It:
- Allows only the fixed Coinbase Exchange `BTC-USD` ticker endpoint (no caller URL, secrets, orders, subscriptions or user tokens).
- Requires a positive finite USD last-trade price and UTC source trade timestamp.
- Gates price at maximum 90-second source age and 5-second future clock tolerance.
- Never upgrades a stale source by using the HTTP response time; never returns a previously cached stale price as live.
- Marks output as indicative exchange-trade research only, `commercial_redistribution_approved:false`, `WAIT / 0R`, no live orders.
- Remains **unpublished and unwired** to public market displays or paid products until provider terms, explicit rights, independent tests and customer data disclosure have passed. The 8/9 production smoke and existing Friday combined snapshot remain unchanged.

## V292 follow-on release gates
1. Verify provider licensing and commercial market-data use rights. Do not assume public unauthenticated endpoints allow paid display/redistribution.
2. Introduce an isolated, source-provenance-verified 24/7 BTC ingestion lane under explicit cadence, incident admission and budget, after rights.
3. Enforce separate 24/7 BTC age from session-specific Gold/FX/Oil source freshness, with independent source timestamps and a real weekend smoke. Do NOT change existing Gold or multi-asset records to fake recency.
4. CI passes source/parser tests; maintain previous private QA (77/107) as separate launch HOLD, plus all billing and trading locks.

This PR is groundwork for a licensed real crypto data lane, not a 9/9 smoke fix or a live commercial BTC feed.
