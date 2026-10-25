# V306 | Incident-first operator diagnostics, zero extra private load

Production base commit `a2c746ffb11e03ec1c522cbb2dbf407654dbe665`, 2026-10-25 UTC.

## Real incident observed
- Two live Supabase management SQL calls failed with `Connection terminated due to connection timeout`.
- Live `/api/public-recovery-triage` reported `DATABASE INCIDENT REPORTED`, source generated at 2026-10-25T13:14:32.998Z. Auth HTTP health timed out; REST root returned 401; canonical public-final-readiness explicitly reported `POSTGREST_RUNTIME_UNAVAILABLE`. SQL health, real login and private kernel remained unverified.
- V305 /status already correctly showed DB incident. New incident warning alone would not repair anything. Existing triage triggers three concurrent fixed-host Supabase HTTP requests per operator click (90-second per-worker cache), including an Auth probe that often stalls during incident.

## V306 targeted pressure mitigation
- Probe **only** canonical `public-final-readiness` first, read-only and <=9 seconds. Reuse current `assessRecoveryTriage` semantic freshness and incident validity checks.
- When and **only** when a current valid readiness payload explicitly reports an active DB incident, omit the two redundant Auth/REST calls. Mark both `DEFERRED_BY_DATABASE_INCIDENT`, `transport_reachable:false`, `service_ready:false`. This protects the overloaded Auth and REST planes while they cannot admit private QA anyway.
- If readiness is missing, stale, invalid, reports incident clear, or a timeout occurs, still request both fixed-host Auth and REST in parallel with original bounded 4.7-second budgets. Do not infer health from their HTTP status alone.
- The triage operator UI still requires a manual click, stays cached 90s per Vercel worker, and has a 15-second client budget for the healthy/unknown sequential path; other status requests remain at 7s.
- No private OIDC or QA, no Supabase table/grant/schedule migrations, and no new endpoints or credentials. Existing guard `assessProviderEdgeAdmission` still rejects incident, deferred or unverified transports; no payment or trading unlock.
- **Not a fix for the original Postgres startup timeouts.** It saves at most two public operator-triggered probes while the incident is confirmed, and prevents one known Auth timeout source from wasting diagnostic time. Connection/pg_cron resource diagnosis and V304 privileged function migration remain separately blocked on stable Supabase admission.

## Production acceptance
1. Exact-head full GitHub CI, frontend build, Chromium and safety tests.
2. Merge with `[deploy]` only after exact changed files and CI, Vercel READY correct SHA and production aliases.
3. Production manual operator GET should show `DATABASE INCIDENT REPORTED` with `auth_http.state=DEFERRED_BY_DATABASE_INCIDENT` and `postgrest_http.state=DEFERRED_BY_DATABASE_INCIDENT` **if incident is still reported**, or genuine independent statuses if the incident has cleared. HTTP 200 means diagnostic delivered, not SQL or Auth service certified.
4. Preserve private V304 migration unapplied until new DB source and capacity preflight succeed; 77/107 QA, 8/9 smoke and commercial licensing/payments/trading HOLD.
