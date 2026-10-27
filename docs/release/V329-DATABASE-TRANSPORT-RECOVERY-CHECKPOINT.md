# V329 · Supabase Database Transport Recovery Gate and Incident Evidence

**Date:** 27 October 2026 UTC  
**Project:** `mpcelmjiycjpdyyflisn` | **Region:** `eu-west-1`  
**Status:** **DATABASE RECOVERY HOLD**  
**Release scope:** cumulative V313–V329 draft PR, no production changes.

## Verifiable live incident diagnosis

The Supabase project-management API reports **`ACTIVE_HEALTHY`**, but multiple independent direct database SQL attempts, including `SELECT now(),1` and a query against `pg_stat_activity`, failed with `Connection terminated due to connection timeout`. A performance advisor read also timed out (`Query read timeout`). Management-plane health is therefore insufficient to certify Postgres/PostgREST readiness, and the *latest successful private kernel state* from before the incident does not supersede these failed SQL checks.

The read-only **Supabase Log Explorer / ClickHouse** path still worked. The following is a **historical aggregate**, not a current heartbeat:

- UTC window: **2026-10-27 07:15 to 08:35**. Counts are from queries against Supabase's unified logs, using `postgres_logs`, `postgrest_logs`, and `supavisor_logs`.
- `postgres_logs`: **32** `ERROR / SQLSTATE 57014` events, all attributed to `PostgREST 14.5` in the available parsed `application_name` field; 4 `LOG / 08006` connection exceptions and 4 `LOG / 08P01` protocol errors were also recorded. Many other `LOG / 00000` messages are routine and are not counted as failures.
- `postgrest_logs`: **272** messages classified by an exact case-insensitive **`timeout`** substring, with a sample `Warp server error: Thread killed by timeout manager`. This is not a claim that all are independent transactions or that each represents a separate failed customer request.
- `supavisor_logs`: 76 messages contained `connection`, including `ClientHandler: Connection authenticated`. **These are not by themselves connection-pool saturation or authentication failures.** Independent Supavisor timeout count remains **unknown**.
- The exact timing and cause of the database failure remain unverified; a connection bottleneck, expensive queries, resource pressure, PostgREST workers, pooler or a provider event are all hypotheses.

No raw SQL query strings, customer IDs, access tokens, server-generated request details or private IPs are retained in the evidence snapshot:
`docs/operations/evidence/v329-20261027-redacted-sql-transport.json`.


## Follow-up: 09:03 UTC single successful SQL, then three failures

A read-only `SELECT now()` succeeded at **2026-10-27 09:03:46.448238 UTC**, the first observed response after multiple management connection timeouts. This is **not recovery certification**: three subsequent separate read-only SQL queries (`pg_stat_activity` aggregate, connection counts, and kernel/tick counts) immediately failed with `Connection terminated due to connection timeout`. None of these statements performed database writes.

In an independent historical **08:35–09:05 UTC** ClickHouse window: `postgres_logs` contained 167 events, including **11** SQLSTATE `57014` cancellations, **17** `08006` connection failures, and **12** `08P01` protocol events; `postgrest_logs` contained 16 events, **all 16** with timeout text. There were no `supavisor_logs` rows returned in this particular filtered window. Its state is **UNKNOWN**, not zero failures. Counts can overlap by event and should not be summed as distinct end-user requests.

Redacted follow-up: `docs/operations/evidence/v329-20261027-sql-flapping-followup.json`. This 30-minute/incomplete-source log window fails the V329 current clean 5–15-minute criteria, and the one good SQL sample fails the existing two-distinct-probe requirement. **Commercial HOLD unchanged.**

## V329 staged safety code

- `src/db-incident-acceptance.mjs`: extend the pre-existing V217/V270 error classifier to recognize `POSTGREST_WARP_TIMEOUT`, `08006` and `08P01`. These errors must count as **recent database errors** when present in the checked evaluation window.
- `src/v329-database-transport-evidence.mjs`: new strict **read-only, no-network** cross-plane transport evaluator. The management API reporting `ACTIVE_HEALTHY` is informational, never sufficient evidence for a green database status. Requires: a *complete 5–15 minute log window* sampled less than 2 minutes ago and containing **all three independent log sources**, no classified transport errors, **two genuinely distinct successful Supabase SQL probes** with independently verified database UTC timestamps at least 60 seconds apart (reuses the existing V270 proof), and a recent **authenticated read-only PostgREST** status probe. Missing, inconsistent, stale, incomplete, future-dated or unknown log categories block confirmation.
- A successful transport assessment returns **`TRANSPORT_EVIDENCE_REVIEWABLE` only**, not commercial ready or trading enabled. Payments and trading remain explicitly false even on all-green synthetic test data.
- `scripts/v329-db-transport-triage.mjs`: offline deterministic command that reads only the checked-in aggregate, emits an allowlisted support summary and confirms **DATABASE RECOVERY HOLD**. No database calls and no writes of any kind.
- `tests/v329-database-transport-recovery.test.mjs`: 16 synthetic Node24 tests of error classification, time windows, missing sources, zero-vs-unverified, fake green management status, incomplete SQL probes, stale REST data, redaction and independent capital locks.
- CI retains all V317–V328 billing, broker, market-data, Chromium and isolated PostgreSQL 17 tests.

## Safe human operating runbook

Do these **read-only** actions first:

1. In Supabase project Observability, inspect **Database Reports** CPU, RAM, swap, disk I/O, active sessions, connection counts and PostgREST / Supavisor throughput for a window covering **07:15–08:35 UTC**. Save redacted screenshots or aggregated figures only. Correlate spikes with the 5-minute timeout pattern.
2. In Log Explorer, compare `postgres_logs` SQLSTATE `57014`, `08006`, `08P01`, `postgrest_logs` Warp timeouts, and Supavisor login/backend connection errors. Do not confuse a normal `Connection authenticated` log with a failure.
3. If a simple **read-only** SQL command works again, run two separate probes at least a minute apart, and independently inspect **aggregate-only** connection state:
   ```sql
   SELECT now() AS database_time, current_setting('max_connections')::integer AS max_connections;
   SELECT application_name, state, count(*)::integer AS sessions
   FROM pg_stat_activity
   WHERE datname=current_database()
   GROUP BY application_name, state
   ORDER BY sessions DESC LIMIT 25;
   ```
   Do not include the `query`, client IP, user information or session details in public exports.
4. Inspect connection pool capacity, blocked queries, idle-in-transaction sessions and database compute saturation with operator privileges as needed. Avoid running expensive `EXPLAIN ANALYZE` in production. Do not terminate processes or restart Postgres solely because a bucket has timeouts.
5. Independently verify an authenticated **read-only** PostgREST endpoint and new kernel *sealed* receipts. Continue using existing V217/V270 two-SQL and two-kernel-cycle acceptance. A single new success cannot clear a flapping incident.
6. Before any change that could interrupt operations, obtain a project-specific **backup inventory and isolated restore rehearsal**, review the blast radius and get explicit operational approval. A database restart or compute upgrade may be useful only after diagnosis and approval, not as an automatic V329 action.

Provider reference: [Supabase timeout troubleshooting](https://supabase.com/kb/troubleshooting/failed-to-run-sql-query-connection-terminated-due-to-connection-timeout), [connection management](https://supabase.com/docs/guides/database/connection-management), [database performance](https://supabase.com/docs/guides/platform/performance).

## Release lock

V329 is staged on a draft GitHub branch only. It does **not** deploy SQL/Edge code, change a database pool size, upgrade compute, restart Postgres, disable cron, rotate customer credentials, modify payment state or connect the broker relay.

**Production V311 remains intentionally unchanged**; checkout and merchant charges **OFF**, automatic trading **OFF**, capital permission **WAIT / 0R**. The commercial HOLD persists irrespective of control-plane status or synthetic CI passes. Actual DB root cause and live recovery are *not yet fixed or certified*.
