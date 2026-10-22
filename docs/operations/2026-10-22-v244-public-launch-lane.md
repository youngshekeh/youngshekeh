# V244 · Launch-facing public research lane

Date: 2026-10-22. Base V243 production 99d7ba53300f7dc9a50702da382941b2e53817c5.

## Grounded production facts
- At 2026-10-22 14:16 UTC, GET /api/public-market-reference returned independent Gold API XAUUSD and Coinbase BTCUSD observations with source attribution and strict read-only WAIT/0R governance. Gold carries a provider timestamp; Bitcoin only a local receipt timestamp and must never be labeled source-timestamped. None constitute broker execution quotes.
- Supabase project eu-west-1 reported ACTIVE_HEALTHY but SQL intermittently returned connection terminated due to connection timeout and 57014 statement timeout; database scheduler read showed 58 active jobs, including Gold, market, monitoring, and reconciliation tasks. Database root cause and continuous private kernel health remain unverified.
- A single snapshot of Postgres sessions at 14:17 UTC saw 15 total, 2 active, no lock or I/O wait; max_connections previously 60. This does not substantiate a persistent max-connections exhaustion claim.

## Shipped changes
1. Light, warm ivory editorial homepage and clear dark-ink typography, understated purple identity, flat buttons and a white spot observatory. All CSS is scoped to `body.home-public`, leaving Gold, private, status, and other deep trading dashboards untouched; market prices still come from the same audited independent API.
2. On /status, the Gold/BTC public feed now updates via a separate asynchronous lane. Slow private auth, database/readiness and billing probes no longer delay or erase the public result. The private release decision and all seven gates remain independently verified, and fail closed without valid current receipts.
3. V244 tests reject stale sources, verify provider outages don't erase page delivery, and verify the private requests cannot block the public status lane. Existing launch test suite is preserved.

## Non-goals / launch blockers
- This is NOT repair or certification of Supabase SQL, private V180 kernel, MT5 tick feed, QA matrix, or active paid entitlements.
- Do not claim full commercial launch from a green website or indicative spot receipt. Keep automated trade execution OFF, action WAIT, capital 0R, and checkout LOCKED.
- Preserve all existing Gold engine identifiers and automation assets. No pg_cron jobs were modified; no secrets were moved to the client.

## Validation
- Run the V241–V244 workflow, full repository build and critical governance workflows.
- After merge, verify Vercel production READY and GET /status and / homepage rendering. Verify /api/public-market-reference still returns properly labeled current independent sources before describing provider reachability.
