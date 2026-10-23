# V250 · Incident-aware private status admission, public research unaffected

Date: 2026-10-23. Scope: Vercel public `/status/` UX and client-side request scheduling. **No Supabase database, Edge function, cron, auth secrets, billing or trading mutation.**

## Verified problem
- At 13:29 UTC, a public readiness response had `ok:true`, `generated_at` current and `database_incident.active:true`, with `POSTGREST_RUNTIME_UNAVAILABLE`, `AUTH_UNAVAILABLE` and `BILLING_LEDGER_UNAVAILABLE` as hard blockers.
- The status page still launched **four** concurrent prechecks on every page load/refresh, including two distinct auth/billing calls, even with central readiness already declaring their database dependency unavailable. A private QA admission guard already avoids 107 costly QA checks.
- Supabase management SQL timed out; Supavisor logs at 12:50–13:40 UTC included 6 `EAUTHQUERY` backend unavailable events and 1 auth secret timeout; pg_cron again logged multi-job startup timeout. Project control-plane `ACTIVE_HEALTHY` is not equivalent to healthy DB connections.
- Gold public fallback returned **200** with a Gold API indicative source quote, NOT a broker bid/ask. Independent public BTC/Gold reference API also returned 200. Broker, paid checkout and private kernel remained unverified/blocked.

## Code shipped
1. Load one **central final-readiness** check and the read-only public Gold fixed-path check first, in parallel. The public research lane remains a distinct independent fetch which renders without waiting for any private checks.
2. If `public-final-readiness` is unavailable, stale (evidence older than 10 minutes), lacks a verified no-incident statement, or explicitly has `database_incident.active:true`, the public status page **does not request** `public-auth-runtime-check` or `public-billing-acceptance`. It displays `DEFERRED · READINESS UNAVAILABLE` or `DEFERRED · DB INCIDENT`, never green or passed.
3. If central readiness explicitly reports a recent `database_incident.active:false`, both auth and billing checks automatically resume in parallel and the original `evaluateLaunchReadiness` must independently verify them. No time-based auto-green, no caching of success.
4. Auth, billing, private QA, kernel, broker and commercial checkout status remain **unverified** when deferred. Keep `WAIT / 0R` and live orders OFF. The UI records whether it requested 0 or 2 dependent reads and central DB reason.
5. Dedicated tests assert deferred behavior, stale/malformed readiness, recovery to complete checking, independent failure safety and unchanged public lane; run alongside full application regressions and all previous status integrity checks.

## Expected impact / limitations
- During an observed DB incident, status page triggers **2 fewer private Edge HTTP requests per page visit/refresh** compared with V249. This reduces unnecessary status-probe traffic but is NOT a proven fix for 58 concurrent pg_cron schedules, PostgREST availability or Supavisor connection failures.
- While central readiness itself is unhealthy, this page deliberately sacrifices independent auth/billing diagnostic detail to avoid query amplification; the central readiness response still lists hard blockers. A healthy readiness response automatically restores diagnostics.
- The source of truth remains the independent Supabase Auth service, verified broker quotes, active entitlement ledger and certified V180 receipts. Public indicative references do not authorize trading.
- Rollback: revert V250 `src/status.ts` and remove pure `status-dependency-admission.mjs` from status import. No persistent data or DB schema to undo.

## Follow-up infrastructure finding
The Supabase database performance advisor on 2026-10-23 lists **46 unindexed foreign keys**, **151 currently unused indexes**, and **Auth DB connection limit 10**. These are observations, *not* proof of the current transport timeouts. Do not mass-add/drop indexes while DB connections are unstable; profile slow queries and concurrency first. See [Supabase performance advisor documentation](https://supabase.com/docs/guides/database/database-linter).
