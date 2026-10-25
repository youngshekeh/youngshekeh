# V300 · Gold State-Machine Semantic Transport Fix | October 25, 2026

## Production root cause
- Private Supabase `runtime-v79-liquidity` Edge version 5 remains intentionally parked: HTTP **200** but JSON `ok=false, usable=false, state=LOAD_SHED_DB_RECOVERY`, `capital_permission=0R`. The public signed bridge `api/gold-liquidity-state-machine.js` previously copied HTTP 200 regardless of `body.ok`, falsely advertising a healthy HTTP endpoint.
- Job 61 `tfa-v80-gold-state-capture`, every ten minutes at :03/:13/:23/:33/:43/:53, and job 62 `...-reconcile`, one minute later, remain active and report `succeeded` SQL invocations. Recent probe `v80_gold_state` records have `http_status=200` but `ok=false` and missing `quality_state/observed_at/phase` fields. Cron succeeded is NOT a successful engine.
- Last genuine `gold_state_machine_snapshots.observed_at=2026-10-08T08:06:37Z`, ~17 days old. Likewise V82 and V83 last substantive records October 7. Do not revive these historical PASS flags as live.
- Production SQL diagnostic experienced an independent connection timeout during investigation. No database schema, cron schedule, Edge runtime or provider configuration should be changed to create fake freshness.

## Scope and safeguards
- The public Vercel bridge still sends exactly one signed `@vercel/oidc` GET to the original private v79 Edge function; no extra queries, callbacks, cron, provider feeds, historical edits or traffic fan-out.
- Add pure `classifyGoldStateBridge`. Only complete `ok=true` and quality `PASS` v79 response with governed WAIT/0R, broker/execution disabled, phase/direction present and a real observation no more than 13 minutes old (10m schedule + 3m margin) receives HTTP 200.
- Upstream load-shed, missing data, inaccurate risk, stale observation and network errors now return HTTP **503**, `Retry-After:60`, `X-TFA-Gold-State-Policy`, with safe source `LOAD_SHED_DB_RECOVERY` and source HTTP status distinguished. Do not copy market levels, signature tokens or raw unverified fields to a failed response.
- The existing v80 reconciler will now faithfully record `http_status=503` and `ok=false` instead of the misleading `200/false`, without changing schedules or deleting previous audit entries.
- Browser/status QA tests, source rights and trading/checkout hard guards preserved. No direct restoration of the 124KB mission engine or expired stock/crypto feeds.
- The original mission engine remains LOAD_SHED and private QA 77/107, production smoke 8/9. The fix improves upstream **truth**, not core availability.

## Release acceptance
1. Exact-head full CI including Chromium and Supabase release/safety gates.
2. Vercel production deployment exact merged SHA via `[deploy]` marker, custom domains READY.
3. Real production `/api/gold-liquidity-state-machine` should respond HTTP 503 while private v79 is parked, with state `LOAD_SHED_DB_RECOVERY`, `capital_permission=0R`, and no market prices.
4. Observe subsequent naturally scheduled v80 probe for `http_status=503` and `ok=false`, without manually invoking expensive engine or changing cron.
5. Public BTC licensing holds, all payments HOLD, trading WAIT/0R persist; no QA marks changed.

Next: obtain licensed, current Gold source and a bounded signed v79 research worker before restoring real engine evidence. No automatic execution.
