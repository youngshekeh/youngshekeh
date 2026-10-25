# V288 · Read-only private-state canonical RPC de-amplification

Date: 2026-10-25. Baseline: V287 deployment commit `22b6ad8b060c39c0ef3b04e0d51b39096a9feda6`.

## Evidence and diagnosis
- Supabase function `runtime-v70-autonomous-state` version 7 is active, with `verify_jwt=false` intentionally because it invokes the internal Vercel OIDC verifier on **every** GET before reading the database.
- Recent Supabase Edge logs included 54 HTTP 200 and 28 HTTP 503 responses for the private state service, and many OIDC verifier HTTP 200 responses. HTTP 200 alone is not a signed identity receipt.
- The canonical `get_v70_autonomous_state` PostgREST RPC was observed in pg_stat_statements with 11,751 executions, mean ~75 ms and maximum >20s over the collected statistics lifetime; the observation is not a same-hour error-rate estimate.
- Existing source snapshots use a 10-minute time-based freshness gate and preserve WAIT / 0R governance. Existing per-isolate successful PostgREST RPC cache was only 10 seconds.

## Minimal remediation
- Increase only the private canonical RPC **positive per-isolate cache** from 10 to 30 seconds.
- Do not cache auth decisions. Every request still makes the OIDC verifier request.
- Every return still checks source timestamp `STATE_TTL_MS=10 minutes`, exact WAIT / 0R, and `can_self_promote=false`. Cached data cannot pass when stale.
- A failed refresh after cache expiry returns 503 and opens existing 30-second negative cooldown. No stale-success fallback.
- The response is still `Cache-Control: no-store` and redacts arbitrary private fields.
- No scheduling, RLS, payments, trading orders, Supabase SQL or system permissions are modified.

## Release requirements
1. New V288 and retained V237/V238 tests pass, plus full exact-head repository CI.
2. Confirm deployed Edge function is still the baseline version/source before any isolated deployment.
3. Deploy only the two original Edge function files with the one-line cache change and constant; keep `verify_jwt=false` because caller is verified in the handler.
4. Verify new Edge version and static source, monitor read-only logs and regression behavior. No expensive 107-check QA run just for deployment.
5. If regressions are observed, restore the exact baseline Edge function source without changing the database.

This is bounded **load reduction**, not private OIDC certification, DB incident resolution, 107-test QA acceptance or commercial launch permission. The 30 private QA failures remain open until a real full rerun passes.
