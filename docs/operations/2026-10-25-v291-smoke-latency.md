# V291 • Cold-cache smoke timeout alignment | 2026-10-25

## Source evidence
Production smoke worker `production-smoke-sweep` version 62 was verified ACTIVE. The latest completed authentic run (2026-10-25 06:46 UTC) was **6/9**, with timeouts for:
- `public-v55-executive-market-board`: HTTP status 0 after ~3,002 ms. Its internal V56 upstream budget is 18,000 ms.
- `public-v50-production-integrity`: HTTP status 0 after ~3,001 ms. It computes bounded current-state evidence from multiple public services.
- `live-markets-snapshot-store`: stale Friday October 23 combined snapshot on Sunday October 25. This is a genuine separate data-age deficiency and is **not** changed by this patch.

## Change
The first two existing public-core probes receive bounded 12,000 ms fetch budgets. Other public-core probes retain 3,000 ms. Authentication-denial checks stay 2,500 ms, individual PostgREST reads stay 2,500 ms, no new retries or endpoints, and the nine-probe verdict remains strictly fail-closed. Each expensive path is still called at most once per scheduled smoke invocation, under existing minimum 10-minute interval and live cleared database incident shield. Both expensive requests remain concurrently bounded so this changes only probe timeout (not request count).

These deadlines do **not** replace performance optimization of V55/V50 upstream dependency graphs. A >12-second service continues to fail honestly; increased tolerance cannot grant merchant, kernel or capital access. Source and completion timestamps remain unchanged.

## After-deployment acceptance
- Full exact-head CI, V289/V291 targeted tests and Chromium build workflows pass.
- Confirm live Edge v62 source matches merged baseline; deploy only this three-file function bundle, retain prior verify_jwt setting and Vault-backed cron authorization.
- Observe one *real* scheduled or controlled smoke run after prior minimum interval, inspect `agent_runs` individual probe results, verify no added database pressure. Never synthesize passing runs.
- Confirm remaining combined weekend cross-asset capture remains labeled stale; develop a separate independently timestamped 24/7 Bitcoin lane without altering Friday's snapshot.
- Preserve full private 107-QA and billing HOLD until separately certified.

No live trading, payment enablement, SQL migration, cron schedule or RLS change.
