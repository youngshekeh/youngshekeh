# V290 · Production acceptance ledger (2026-10-25)

## Immutable release references

- V289 real smoke restore: GitHub PR #250, merged commit `814c16a9895de897361beb5d046605b43666af8a`, initial Edge version 61.
- V289.1 hosted Supabase secret-key header fix: GitHub PR #251, merged commit `4601ffed44cea2e49b180c034893eebb73d2cbc9`, Edge version **62 ACTIVE**.
- V289.1 **68/68** exact-head CI workflows succeeded including repository-wide tests and Chromium browser contract checks.
- No Postgres migrations, RLS changes, cron schedule edits, payment activation, or live trading orders were made.
- The public website remains on its previously verified V287 frontend, not a new frontend release.

## Genuine V289.1 production smoke (not a simulation)

At **2026-10-25 06:46 UTC**, a single controlled, Vault-backed invocation of `public.run_production_smoke_sweep()` enqueued pg_net request **72404**. The `net._http_response` had HTTP **503** with a real 9-probe verdict, and the worker wrote a completed `public.agent_runs` audit row:
- Audit ID `85f2d3b6-f398-4e13-ae0a-475bc7ec9f73`
- Status `failed`, **6 passed / 9 total**, 3 failed, p95 3002 ms
- **3/3** anonymous protected auth boundaries correctly rejected requests as HTTP 401
- **1/3** public Edge core checks passed
- **2/3** governed store checks passed

### Remaining failures

1. `public-v55-executive-market-board`: timeout at 3002 ms. V55 internally waits up to 18s for V56 signal-integrity. Investigate upstream cold-cache cost, point-in-time truthfulness, and carefully bounded deadline alignment. Do not silently remove the check or convert timeout into a pass.
2. `public-v50-production-integrity`: timeout at 3001 ms. V50 internally requests several independently validated sources, with its own latency budgets. Optimize response cost or adjust the smoke probe deadline with an overall fail-closed budget.
3. `live-markets-snapshot-store`: ~33.85h old; captured **2026-10-23 20:55:22 UTC**; latest record says `DELAYED_LIVE`, not `MARKET_CLOSED`. Cron `live_markets_snapshot_capture` runs every five minutes **weekdays only**: `*/5 * * * 1-5`. Do not present its weekend stale Gold/BTC/Oil/DXY bundle as live, especially Bitcoin which trades 24/7. Independently check the BTC weekend data lane with genuine exchange timestamps and source provenance. Gold's separate store shows `MARKET_CLOSED` and passed its check.

### Continuing launch gates

- `public.autonomous_machine_state.smoke_state = STALE` remains accurate, because the latest completed smoke **failed**. Do not override it or insert synthetic passing rows.
- Last full private QA matrix: **77 passed / 107, 30 failed** at **2026-10-25 06:27 UTC**. The synthetic `v78-unknown 0/1` transport records are NOT replacements for the full QA.
- Production DB state `ONLINE`; required active source connectors reported **8/8** recent success within two hours, which is not execution-grade or 24/7 asset freshness proof.
- Public Vercel frontend V287 remains READY; private V288 canonical state function version 8 remains active.
- Full commercial checkout remains **HOLD**. No paid entitlements or private kernel cycles certified. All capital permissions stay **WAIT / 0R**.

## V290 engineering acceptance criteria

1. Preserve nine source-specific smoke checks and present honest failures; gain 9/9 in a real run only after optimizing source and deadline behavior. Keep hashed cron-secret admission, current incident shield and bounded low-frequency cadence.
2. Separate multi-asset historical snapshots from market-specific live lanes: Gold weekday/session-aware, Bitcoin always-on. Require verifiable vendor source timestamps and age; no synthetic refresh of old prices.
3. Refactor slow V55/V50 read paths where safe, avoid thundering-herd dependencies, test the cold-cache and degraded-case latency budget under load.
4. After dependable source readings, execute exact-head tests, Chromium journey verification, and independent freshness checks. Only then attempt the expensive private 107-check QA under controlled pre-admission.
5. Require authentic payment schema/provider parity, signed charge evidence, active entitlement and account isolation before lifting paid launch HOLD. Live trading remains excluded from launch scope.

**Scope of this document:** records evidence and blockers only. It certifies neither full research smoke nor private kernel, merchant, or trading readiness.
