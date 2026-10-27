# V330 | Persistent Database Pressure Recovery and Launch Safety

**October 27, 2026, UTC.** Status: REVIEW ONLY. `security/v330-db-pressure-circuit-breakers`, draft PR #297. **Production V311 remains unchanged.**

## Evidence: systemic fault, exact cause still unknown

Direct Supabase SQL connection attempts timed out even when project management returned `ACTIVE_HEALTHY`. Aggregated immutable **08:45–09:25 UTC** records:

| Producer | Observed events | Meaning |
|---|---:|---|
| `postgres_logs` | 12 SQLSTATE `57014` | Statement cancellations, 10 from `postgres_exporter`, 1 `mgmt-api`, 1 `pg_cron` |
| `postgres_logs` | 27 SQLSTATE `08006` | SSL/client broken connection, reset, broken pipe or management client lost |
| `postgres_logs` | 11 SQLSTATE `08P01` | SSL handshake EOF / protocol errors, clients not attributed |
| `postgrest_logs` | 18 messages | All classified as `Warp server error: Thread killed by timeout manager` |
| `supavisor_logs` | UNKNOWN | This query did not return pooler rows. UNKNOWN does **not** mean zero incidents |

This corroborates a **shared infrastructure or connection-pressure incident** that impacts management, export metrics, scheduled jobs and REST, but none of the above proves precisely whether the origin is connection saturation, CPU/memory pressure, slow queries, locks, ephemeral network interruption or the host's Postgres/SSL health.

The real redacted evidence is in `docs/operations/evidence/v330-20261027-cross-client-db-pressure.json`. No raw events, statement text, account data, user identifiers, keys or private IPs are committed.

## V330 implemented containment

- `src/v330-kernel-pressure-circuit.mjs`: warm-isolate fail-closed singleflight + repeated-private-backend-error cooldown. Two real failed private calls within 15 minutes open a 10-minute breaker, escalating a failed half-open attempt up to 30 minutes; never exceed that bound. No permanent disable, no global lock, no claims of DB healing.
- `api/ops-heartbeat.js`: actual authorized Vercel cron handler retains CRON_SECRET and OIDC and the prior V307 incident-first read-only short circuit; adds V330 admission **before** the expensive private Supabase kernel call. Overlap or cooldown returns **HTTP 503, Retry-After** with capital `0R`; never fakes a 200 success and never stops `pg_cron`. Only a genuine verified healthy signed/sealed kernel receipt closes the breaker. All other data, payment and order locks remain unchanged.
- `tests/v330-kernel-pressure-circuit.test.mjs`: isolated policy and **actual Vercel handler** in a synthetic JavaScript VM, including private HTTP failures, gate overlap, unauthorized access and verified-only half-open recovery.
- All V317–V329 PostgreSQL 17 atomic billing, licensed-market price controls, browser and other regression suites remain in GitHub CI.

These steps **mitigate additional load** under repeated outages. They do **not** remove the primary failure and **are staged, not deployed**. Warm-isolate memory does not coordinate every Vercel instance, and cannot replace durable database-level admission controls.

## Permanent infrastructure remedy decision tree

1. **Obtain genuine runtime evidence.** Supabase Observability Database Reports for CPU, RAM/swap, disk I/O, Postgres backend sessions, Supavisor connections, PostgREST pool queue and statement execution between 08:45–09:25 UTC. Escalate `57014` cancellations from `postgres_exporter` and `pg_cron`, `08006/08P01` SSL resets, and PostgREST Warp timeouts to Supabase support with exact timestamps. Do not assert the metrics exporter is the cause merely because it encountered cancellation.
2. **Restore at least read-only SQL availability.** Probe `SELECT now()` on separate attempts at least 60 seconds apart. Once reliable, inspect *aggregate only*:
   ```sql
   SELECT current_setting('max_connections')::int AS max_connections,
          (SELECT count(*) FROM pg_stat_activity) AS total_sessions,
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') AS active_sessions,
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction') AS idle_in_transaction,
          (SELECT count(*) FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid)) > 0) AS blocked_sessions;
   ```
   If session/pool limits are exhausted, use measured client concurrency and Supavisor mode evidence to choose a bounded pooler/client adjustment. If CPU/RAM/swap or I/O is the cause, size workload/compute only with cost approval. If queries or locks dominate, optimize *identified statements/indexes* only after nonproduction replay.
3. **Measure actual cron runtime, not schedules alone.** Use `cron.job_run_details` read-only aggregate: duration, simultaneous runs, failures and long-running job IDs for the incident window. The old 58-job scheduled inventory and load spreading are static: schedule collision alone is **not proof** of saturated Postgres. Review workloads individually; do not globally disable cron or selectively suppress billing/reconciliation without data.
4. **Verify backup capability and restore in an isolated target.** Never assume an enabled backup equals a successful restore. Before restarting database or adjusting broad connection parameters, confirm a project-specific snapshot/recovery point, test restore into a nonproduction instance, and document rollback time and owner approval.
5. **Stage and canary V330.** Only after isolated validation and explicit release approval, canary the authenticated heartbeat. Verify 503 when circuit OPEN, exactly one warm-instance private probe after cooldown, 200 only for fresh sealed kernel receipt, zero data mutations/orders/checkout. Monitor separate Vercel instances independently. Keep real management SQL and provider logs under observation.
6. **Accept continuous recovery, not a single green request.** A clean recent 5–15-minute independent Postgres/PostgREST/Supavisor log window, at least **two stable separated management SQL probes** with database UTC evidence, authenticated REST read, two genuine healthy signed/sealed kernel cycles, billing signed merchant sandbox, independently reviewed owner MFA, and license-cleared market data must all pass. Only then propose launch, still requiring manual commercial signoff.

## Safety boundary

**DO NOT restart Supabase Postgres, pause a project, run `pg_terminate_backend`, alter pool limits or change compute/payments in this review.** Those actions could worsen an active outage, lose work and/or incur costs without an isolated restore and measured root cause. V330 GitHub branch is the full deliverable until production-safe acceptance and owner release signoff.

Commercial status **HOLD**, charges **OFF**, trading **OFF**, capital **WAIT / 0R**. Production V311 unchanged.
