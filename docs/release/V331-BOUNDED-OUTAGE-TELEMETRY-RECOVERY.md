# V331 · Bounded Outage Telemetry and Safe Public-Recovery Pressure Control

**Date:** 2026-10-27 UTC | **Status:** REVIEW ONLY, not merged or deployed.

## Root-cause investigation, updated

Supabase control plane still described `mpcelmjiycjpdyyflisn` as `ACTIVE_HEALTHY`, but SQL was inconsistent: one aggregate read at **09:48:24.065073 UTC** showed `20` total PostgreSQL sessions against configured `max_connections=60`, while a larger six-hour `cron.job_run_details` aggregate was canceled with SQLSTATE `57014` and a separate grouped `pg_stat_activity` query failed due to connection timeout. A later metadata-only request also timed out.

**Interpretation:** 20/60 from one moment does **not** establish a permanently uncongested pool, and does **not** establish connection exhaustion either. The expensive cron history query is unsafe to repeat during this incident. Existing independent 09:20-09:55 UTC log aggregation showed **81** timeout-containing PostgreSQL entries out of 232, and **20** timeout-containing PostgREST entries out of 21. These are *message totals*, not unique affected end users or proof of the root cause. The provider must verify compute resource pressure, real pool queues and lock/slow-query metrics independently.

### Changes committed

- `src/v331-outage-probe-cache.mjs`: strict pure policy selects **90 seconds** for normal/read-only healthy diagnostic sampling and **180 seconds** for verified incident or missing/timeout evidence. Cached statuses cannot certify private SQL, broker licensing, merchant payments or launch.
- `api/public-recovery-triage.js`: actual existing public Vercel API now respects this bounded cache. Previously a degraded or timed-out provider would be re-probed every 90 seconds per warm isolate; V331 halves that retry frequency during known degradation while preserving the strict immutable `WAIT / 0R` acceptance and the same maximum 9-second readiness and 4.7-second Auth/REST deadlines.
- `tests/v331-outage-probe-cache.test.mjs`: executable pure-policy and **actual Vercel route** VM tests for old healthy cadence, incident negative caching, absent readiness, unauthorized HTTP methods, 20 repeat clients in one warm isolate, source outage, concurrency coalescing and immutable capital locks.
- Cumulative billing payment atomicity, broker read-only symbol provenance, database incident, kernel single-flight and actual Chromium UI tests remain in GitHub CI.

**This is pressure containment in one warm serverless instance, not a global database fix.** Because serverless instances have separate memory, it is not a durable shared rate limit and **does not by itself resolve the PostgreSQL root cause**.

## Bounded SQL: support-only instruction while the database flaps

**Do not repeat broad hours-long `cron.job_run_details` aggregate scans during a connection incident.** That exact attempt timed out at PostgreSQL's statement limit. A safer first step, only when read-only management SQL is stable, is to verify whether the expected `runid` index exists using catalogue metadata. If confirmed, inspect a bounded `ORDER BY runid DESC LIMIT 240` sample **before** aggregating in a nonproduction or supervised environment. Do not create new indexes, remove old runs, run `VACUUM FULL`, terminate backend sessions, restart the database or alter PostgREST pool limits without operator proof, an isolated restorable backup and explicit approval.

```sql
-- Read-only, short, and deliberately bounded by runid *before* aggregation.
-- Run only after the relevant runid index has been independently verified.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '2000ms';
WITH recent AS MATERIALIZED (
  SELECT runid, jobid, status, start_time, end_time
  FROM cron.job_run_details
  ORDER BY runid DESC LIMIT 240
)
SELECT jobid, status, count(*)::integer AS observed_runs
FROM recent
GROUP BY jobid, status
ORDER BY observed_runs DESC LIMIT 30;
ROLLBACK;
```

A 240-row `runid` **sample is not equivalent to six hours of all cron executions**. It can identify symptoms, not justify changing job schedules. The entire transaction must cancel on timeout rather than retry in a tight loop.

## Acceptance remains unchanged

1. Confirm actual database CPU, RAM, swap, I/O, lock waits, PG backend sessions, pooled waiting clients and slow query samples from Supabase Observability.
2. Confirm genuine backup inventory and isolated restore. A control-plane `ACTIVE_HEALTHY` badge is not a database readiness guarantee.
3. Obtain **two separate stable SQL reads at least 60 seconds apart**, current authenticated read-only PostgREST proof, and complete clean PG/PostgREST/Supavisor logs. Then verify actual kernel sealed receipts, owner MFA and merchant sandbox independently.
4. Review controlled deployment/rollback to production. Until explicit approval: checkout and trading OFF, capital **WAIT / 0R**, public launch **HOLD**.

Production V311 unchanged; V331 merely extends review branch source and automated verification.