# V308: Read-only diagnostic bridge load shedding during verified DB incidents

25 Oct 2026. Built on production V307 commit 59cb04be4e3a5cba245df02d29884c82f071d1bb.

## Why
Supabase is still logging multiple pg_cron job startup timeouts and SSL connection resets. The source-locked V304 SQL repair is not approved for application while shared job startup is failing. A live V307 Vercel heartbeat receipt at 14:19:22 UTC confirmed current outage and **kernel attempted: false**, preserving the schedule and WAIT / 0R. No provider-level recovery has been proved.

Two operator diagnostic bridges (V147 connection pressure and V146.1 peak spreader) make independent, uncached, up-to-35-second private Edge requests. In an established provider incident, running them repeatedly can add requests which cannot certify database recovery.

## Implementation
Only for a fresh, internally consistent, public canonical DATABASE INCIDENT REPORTED verdict, each bridge now skips the expensive private request, returns HTTP 503 with Retry-After 300 and a factual deferred code. Existing response schema and fail-closed WAIT / 0R remain unchanged.

Any stale, missing, cleared, non-200 or contradictory public evidence triggers the previous signed Vercel OIDC flow and preserves its independent private verification. The separate public triage diagnostic remains available for operators. No credentials are included in the incident GET. Incident-deferred routes do not mint new OIDC tokens, query database, pause cron or alter billing/trading.

## Limitations
This cannot diagnose Disk I/O from HTTP data, establish actual pg_cron health, certify a paid customer, or automatically repair Supabase. Two independent remote diagnostic checks might be deferred during a real incident; operators can still consult Supabase logs, read-only triage and provider ticket SU-523502. Do not interpret a deferred diagnostic as a private check result.

## Acceptance and rollback
Require Node 22 V308/V307/V306/V231 tests, complete exact-head CI and Chromium, and direct public route validation. Preserve source fingerprint, all schedules, billing locks, production alias and report true Vercel build status. Roll back by reverting only the guarded import and incident branch if regressions arise. Launch still HOLD and trading WAIT / 0R.
