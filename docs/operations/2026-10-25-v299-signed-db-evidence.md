# V299 | Bounded Signed Mission Database Evidence

2026-10-25. Production base V298 (1a21755cf8c714b917505c45bda65524ab703702).

## Actual upstream issue
The original mission engine is intentionally disabled by the Supabase Edge function runtime-v115-mission-brief, which returns LOAD_SHED_DB_RECOVERY and does not touch PostgREST. Directly redeploying the archived 124KB engine would revive multiple database and market API calls with unverified public rights and without confirmed load safety. The V298 production canary proved signed Vercel-to-Supabase OIDC against private oidc verifier and confirmed the load-shed (HTTP 200 with NOT restored). It did NOT establish ability to read the private database from a bounded workload.

## New isolated private evidence service
- New Supabase Edge endpoint `runtime-v299-mission-evidence`, deployed with `verify_jwt=false` **only because it individually verifies a Vercel OIDC token** using the existing private `runtime-v115-oidc-probe`; never accepts an unchecked service role in its caller or a public anonymous token.
- Only after verified production owner, project, environment and authentication-only 0R claims, Edge obtains its internal Supabase service credential and calls a single fixed, read-only PostgREST request for ID 1 from `autonomous_machine_state`, with exact allowlisted fields, `limit=1`, a 3.5s fetch cap, and no retries.
- Requires snapshot not older than 10 minutes, database ONLINE, action WAIT, and final permission 0R. Returns only coarse machine state, no keys, records, personal/customer information, source market prices or trading signals.
- Vercel `/api/mission-db-evidence` is separate from all cron, frontend, QA and legacy mission routes. Uses V285 strict preflight **before obtaining** private OIDC. One 4.5s signed fetch, no fallback, 20s hosting cap, process-local 90s cache/singleflight. Public output remains fail-closed and explicitly says mission NOT restored and registry NOT certified.
- No database schema, RLS, schedules, grant, existing Edge function, source connector, billing, market-data redistributions or live trading modifications.
- If no verified record / stale incident, reply 503 and keep WAIT/0R. An HTTP 200 is successful **observation** only, not a certified engine or a repaired 77/107 QA result.

## Commercial gates
- 70+ exact HEAD CI workflows including Chromium, full repo regression, source and auth safety.
- Supabase new Edge function must preserve `verify_jwt=false` and internally verify a signed Vercel token; direct unauthenticated call must return 401. Do not touch `runtime-v115-mission-brief`.
- Vercel deploy exact SHA via explicit `[deploy]` marker, verify READY and both production aliases.
- Run one read-only live V299 GET. If successful, it establishes a bounded authenticated database path, not the 44 module registry or a private QA pass. If 503, inspect without relaxing safety or flooding.
- Preserve full QA 77/107, production smoke 8/9, vendor licensing HOLD, checkout HOLD and trading WAIT/0R pending independently verified evidence.
