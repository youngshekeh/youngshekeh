# V283 · P0 Supabase provider escalation and public-side incident load containment
2026-10-24 UTC. Baseline production SHA `cbeb74010b65f3504b5f946e1bbf00553e136e41`, Supabase `mpcelmjiycjpdyyflisn`, eu-west-1, Postgres 17.6.1.166, project Pro.

## Provider case is urgent and has NOT BEEN FILED
Official submission: https://supabase.com/dashboard/support/new. This installation's connected Supabase tools expose project health, read-only SQL and logs but **no support case creation action**. The connected browser has no confirmed signed-in Supabase support session. **Do not invent a case ID or claim submitted.**

### New 60-minute log evidence from 2026-10-24 ~11:29–12:29 UTC
Read-only ClickHouse aggregates through Supabase management logs:
- PostgREST: 134 logged messages, **15** containing `PGRST003` (internal pool-acquisition timeout), **11** containing statement timeout.
- Supavisor: 116 logged messages, **18** containing `Authentication timeout`, including `DbHandler: Authentication timeout after 15000ms`.
- PostgreSQL: 304 logged messages, **80** containing `cron job N job startup timeout`, **23** containing statement timeout.
- Startup failures span dozens of distinct pg_cron job IDs, including 33 (7), 39 (7), 22 (5), 23 (5), 73 (4), 24 (4), 61 (4), 95 (4). **These are log text counts, not request failure rates, not mutually exclusive, and not evidence of which specific jobs may safely be rescheduled.**
- Project control plane reported `ACTIVE_HEALTHY`, database Postgres 17.6.1, but read-only management SQL and both advisor probes independently returned `Connection terminated due to connection timeout`. No test database branches exist.
- Original historical data: 58 enabled cron jobs / 24 sessions in one earlier successful read, **not** evidence that 58 were concurrently running. Supabase documentation describes a default pg_cron concurrent-job capacity of 32; 58 scheduled jobs are not themselves proof that this limit was reached.
- The production public triage previously reported `DATABASE INCIDENT REPORTED`, Auth HTTP TIMEOUT and unauthenticated PostgREST 401. HTTP 401 on `/rest/v1/` alone is **not** a database query proof or evidence of a broken privileged JWT.

Refer to https://supabase.com/docs/guides/api/rest/postgrest-error-codes (`PGRST003`), https://supabase.com/kb/troubleshooting/pgcron-debugging-guide-n1KTaz (job concurrency), https://supabase.com/kb/troubleshooting/failed-to-run-sql-query-connection-terminated-due-to-connection-timeout (DB resource pressure).

### Copy-ready support ticket
Subject: **P0 / Supabase Pro eu-west-1: repeated PostgREST PGRST003 + Supavisor authentication + pg_cron startup timeouts**

Hello Supabase Support,

Please investigate a sustained production Postgres data-plane incident for project **mpcelmjiycjpdyyflisn**, region **eu-west-1**, Postgres 17.6.1, Pro plan. The control plane reports `ACTIVE_HEALTHY`, but direct management SQL `SELECT` attempts and security/performance advisor checks are intermittently failing with `Connection terminated due to connection timeout`. Our Auth HTTP transport times out; PostgREST logged `PGRST003`; Supavisor logged `DbHandler: Authentication timeout after 15000ms`. Our private sealed kernel is fail-closed. Public read-only Vercel research pages remain separately deployable.

Read-only last-60-minute log sample (~11:29–12:29 UTC Oct 24): PostgREST 15 PGRST003 hits / 134 log records, Supavisor 18 authentication timeout hits / 116, PostgreSQL 80 pg_cron job startup timeout hits and 23 statement timeout hits / 304. Many cron job IDs are affected. These are sampled log events, not request error rates. 58 jobs were previously listed active, not necessarily running at once. No proof that a particular job causes the outage.

Please help identify **the root cause** and a safe recovery plan, including:
1. Database compute memory/swap, CPU saturation, disk I/O budget, Postgres backend process health and maximum/current connections.
2. PostgREST internal connection-pool acquisition and Supavisor authentication/backend lookup; determine whether any backend, region or pooler restart is advised.
3. `pg_cron` worker concurrency, scheduled overlap at failure minutes and supported safe rescheduling *only after identifying noncritical jobs*.
4. Actual backup/PITR availability and tested restore procedure before any potentially disruptive recovery action.
5. Recommended non-destructive low-risk change, whether a temporary compute upgrade or service restart is warranted, and clear verification and rollback steps.

Please provide a case/incident ID, confirmed cause and instructions. We are deliberately not deleting jobs, relaxing RLS, resetting credentials, applying unreviewed SQL or processing new charges. No credentials or customer data are in this report.

## V283 mitigation implemented in the app
Existing public `/api/provider-edge-acceptance` previously launched 2×3 Supabase provider checks on *every* uncached anonymous GET, even during a known incident; V282 only gated calls through the recovery route, not direct callers.

V283 first reads the independently cached, anonymous read-only `/api/public-recovery-triage` from a fixed HTTPS origin with 6.5s deadline. **If any incident, unavailable Auth transport, stale/governance-invalid triage, missing evidence or unknown state is reported, NO provider probes execute** (HTTP 503 with Retry-After 60s). Provider attempts run only after current stable triage admission; backend failures fail fast after the first unavailable provider, avoiding five further calls. Source transport and semantic success are separated and no authenticated login, private kernel, paid term or trading is certified even when all provider GETs succeed.

A per-Vercel-instance 60-second cache and single-flight promise reduce anonymous repeated calls. We do not reset or modify Supabase itself. All pre-existing 58 scheduled jobs, SQL, RLS, keys, user data, API sources and checkout locks remain untouched. Capital permission is permanently `WAIT / 0R`.

## Public launch acceptance distinction
- Free public research/market evidence can remain deployed with clear historical/delayed/market-closed labels, verified source times, no guarantees of execution-grade price or market-data redistribution licensing.
- **Full commercial public launch is NOT cleared** until SQL and Auth are stable across distinct probes, verified backup and restore, owner/member browser authentication and paid entitlements, provider HMAC plus renewal/refund/cancel flows, 2 independent sealed healthy private kernel cycles and redistribution rights documented.
- Last independently successful GitHub exact-SHA public smoke: https://github.com/youngshekeh/youngshekeh/actions/runs/40093001992 . A separately attempted latest public fetch timed out from the external observer, so do NOT assert real-time website availability based on that failed observation alone. Verify again after deployment from independent CI.

Provider case path: https://supabase.com/dashboard/support/new . Do not send tokens, connection strings or event payloads.
