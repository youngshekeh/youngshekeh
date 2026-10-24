# V267 · P0 Supabase PostgREST / Supavisor / PostgreSQL incident

**Recorded:** 2026-10-24 ~04:45 UTC. **Baseline:** V266 production `5b2a7f9d7f0617abf34b162c03c617db6f0571f3`.
**Project:** Supabase Pro `mpcelmjiycjpdyyflisn`, region `eu-west-1`.
**Production:** https://thefatheranalytics.com · public status https://thefatheranalytics.com/status .
**Security:** No customer data, credentials, raw event JSON, auth headers or transaction payloads copied here.
**GitHub Issues:** Repository Issues are DISABLED (API 410). Keep this tracked by immutable source-control history and provider support case.

## Data-plane failure, evidence not hypothesis
- Management control-plane reports project `ACTIVE_HEALTHY`, but simple Supabase management SQL `SELECT now()` failed `Connection terminated due to connection timeout`. This does not prove that PostgreSQL is responding.
- `postgrest_logs`: at 2026-10-24 **04:34:38 and 04:34:46 UTC**, events included `PGRST003` with "Timed out acquiring connection from connection pool." Official code reference: https://supabase.com/docs/guides/api/rest/postgrest-error-codes ; **PGRST003 corresponds to HTTP 504 / PostgREST internal pool acquisition timeout**.
- `supavisor_logs`: on **04:39–04:40 UTC**, repeated `DbHandler: Authentication timeout after 15000ms`.
- `postgres_logs`: **04:36–04:37 UTC**, multiple `cron job <id> job startup timeout` events and statement timeouts. Do not infer cron is uniquely to blame from this alone.
- Vercel heartbeat `/api/ops-heartbeat` reported `V180_HEARTBEAT_FAIL_CLOSED` with `KERNEL_SEAL` / `DATABASE_SEAL_TRANSPORT_TIMEOUT`. This is a safety catch, not a proof of a healthy private kernel.
- Independent public `/api/public-recovery-triage` returned `DATABASE INCIDENT REPORTED` / `POSTGREST_RUNTIME_UNAVAILABLE`, Auth TIMEOUT; the browser status should remain LAUNCH HOLD.
- The public market-feed, independent Gold/BTC research references and quarterly OHLC proxies remain reachable; source licenses and execution-grade quotes are not certified. Closed-market Oil/DXY references fail closed.
- A separate Supabase public status incident affecting management operations in eu-west-1 had been resolved on Oct 22; **no causal link to these DB pool timeouts is established**.

## Requested provider investigation
Support entry point: https://supabase.com/dashboard/support/new .
Request case ID plus root cause and non-destructive recovery steps for:
1. PostgREST pool acquisition/wait time, Postgres active/idle connections, blocked queries, slow query/statement plans and compute/IO availability.
2. Supavisor authentication database/backend reachability, auth-query failures and pooled connection starvation.
3. PostgreSQL backend worker availability, 58 existing enabled jobs and cron startup contention; inspect owner/schedule/overlap after data-plane recovery.
4. Any regional host or project-specific infrastructure issues, including separate management-plane degradation.

### Copy-ready, sanitized support handoff
> Our Supabase Pro project in eu-west-1 is impacted by reproducible data-plane timeouts while management status reports ACTIVE_HEALTHY. On Oct 24 at 04:34 UTC, PostgREST logged PGRST003 (pool connection acquisition timeout); at 04:39–04:40 UTC, Supavisor logged repeated 15-second backend authentication timeouts; at 04:36–04:37 UTC PostgreSQL logged cron job startup timeouts. A management `SELECT now()` timed out. Our Vercel private sealed kernel fails `KERNEL_SEAL/DATABASE_SEAL_TRANSPORT_TIMEOUT`; public read-only services remain accessible. Please investigate pool/worker pressure, Postgres CPU/IO/connection state, Supavisor auth backend and scheduling contention and provide a safe remediation preserving all data and existing jobs. We have not changed RLS, credentials, database schemas, cron schedules or live trading. Please return an incident/case ID and root cause.

**The support packet on /status/** includes date-labeled static historical observations as context. Its newly captured diagnostic timestamp applies to the HTTP checks only; historical observations are never portrayed as current log snapshots. A GitHub issue was not created because Issues is disabled.

## V267 change and proof
- Extend local database incident classifier to detect `PGRST003` and the exact `DbHandler: Authentication timeout after <milliseconds>ms` pattern.
- These classified current observations block `READY_FOR_OPERATOR_FINAL_QA`; they never authorize an automatically green kernel, checkout or capital.
- Strengthen source-safe support report with clearly dated evidence, classification tests, redaction checks, and fail-closed acceptance tests.
- Maintain explicit proof before final launch: management SQL and PostgREST queries, valid kernel seal with two distinct fresh EXECUTE/HEALTHY receipts, 58 expected active jobs, working Auth, fully signed paid entitlement, source rights and browser acceptance.
- No production SQL/DDL, cron job modification, credential rotation, private kernel bypass, provider pool setting change, order placement or merchant activation in this release.

## Storage and rollback
This document, source changes, and CI logs live in GitHub commit history. Vercel's prior `5b2a7f9d` is the rollback reference. **This is not a database data backup.** An actual backup must be confirmed independently once DB is responsive; do not claim "all data stored" from a Git commit.
