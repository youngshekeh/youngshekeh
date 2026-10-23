# V261 | Database connectivity and scheduler diagnostic repair

Baseline: V260 production commit `7f52d8cb0c3fc1e145892dbe28b184ffb4f4ff80`.

At 22:05–22:15 UTC, management SQL and recent V180 kernel runs succeeded, but application diagnostics timed out. Postgres logs identified repeated history scans in `private.compute_v1461_peak_spreader_status()` and `private.compute_v147_connection_pressure_shadow()` within the failing RPC call chains. A recent-hour aggregation on `cron.job_run_details` took 14,559.631 ms and read 15,329 shared blocks. The table was about 134 MB with approximately 315,000 rows and only its `runid` primary-key index. Connection samples were well below `max_connections=60` and had no lock waiters; this evidence does not establish connection exhaustion as the cause.

## Applied database repair

Migration `20261023222452_v261_scheduler_history_single_scan` replaces only the two owned private compute functions, guarded by their original definition hashes. V1461 reads the complete since-apply history and rolling windows from one materialized history scan instead of four scans. V147 computes running jobs, concurrency and failures from one shared recent-hour scan instead of three. Its advisory V1461 summary reads an existing cache only when it is within the existing ten-minute freshness limit. A missing or old summary remains UNAVAILABLE; the dedicated V1461 reader retains its normal refresh behavior. This summary does not determine the pressure score.

No history was discarded or bounded by run ID. All metric names and governance fields are preserved. Owner `postgres`, SECURITY DEFINER, search paths and function ACLs were verified unchanged. No cron definition, schedule, active state, role setting, RLS rule or entitlement was changed. Job-definition fingerprint before and after was `06d5520a8f2ed15e58c655b4b0bd518f` (96 configured, 58 active).

The repair and exact guarded rollback are in `supabase/recovery/v261-scheduler-query-repair{,-rollback}.sql`. Run either as one transaction through the migration tool. Rollback refuses to overwrite subsequent function edits. The migration's local 30-second statement limit and 2-second lock limit apply only to the migration transaction; runtime authenticator `statement_timeout=25s` is unchanged.

## Bounded application reads

Only `/api/connection-pressure-shadow` and `/api/peak-minute-spreader-status` get the measured cold-query allowance: Edge RPC 26 seconds, API bridge 35 seconds, browser read 38 seconds and shared transport 40 seconds. Vercel explicitly allows 40 seconds for these two handlers. The existing five-second Edge workload-auth check fits inside the API budget. PostgreSQL still cancels at 25 seconds. No retry, new result cache or broad timeout change was added. Price readers, bounded concurrency, cancellation, circuit backoff and workload authentication remain intact.

## Verification observations

The read-only PostgreSQL fixtures assert 16 manually counted scalar metrics and five exact hot-minute records, covering overlapping jobs, both window boundaries, NULL status/start/end values and completed/failed/running jobs. The Node regression also compares those fixture expressions against the repaired SQL so they cannot silently diverge.

Local validation passed 753/753 Node tests, the Vite production build and the PostgreSQL fixture assertions. Both diagnostic Edge Functions were deployed as version 2 with the existing body authentication and `verify_jwt=false` configuration preserved.

After the migration, direct cold computations completed with valid results: V147 in 22,219.74 ms (NORMAL), V1461 in 11,669.97 ms (SCHEDULE_DRIFT_BLOCKED). A subsequent V147 getter refreshed its two-minute cache in 5,039.65 ms. At 22:26–22:27 UTC, production API GETs returned HTTP 200 / `ok=true` for V147 in 8.94 seconds and V1461 in 8.84 seconds. These observations precede the V261 application deployment and are samples, not a permanent availability guarantee. The schedule-drift result remains a real launch blocker.

The separate recovery-triage sample returned PRIVATE READINESS UNVERIFIED. Auth HTTP 200 and PostgREST root HTTP 401 show reachable transports; neither proves authenticated data access, real sign-in or paid entitlement. Preserve BUILD_HOLD, WAIT/0R, checkout's deployment lock and disabled live trading until their independent evidence passes.

## Remaining provider work

`cron.job_run_details` is owned by `supabase_admin`. The available `postgres` connection neither owns the table nor has CREATE in the cron schema, so no index was attempted and no privilege escalation was made. A provider-owned index review is prepared below. This is not part of the applied migration:

```sql
-- Provider owner only, outside a transaction; review platform support first.
CREATE INDEX CONCURRENTLY v261_job_run_details_start_cover
  ON cron.job_run_details (start_time DESC)
  INCLUDE (jobid, status, end_time);
ANALYZE cron.job_run_details;
```

The provider should check existing/invalid indexes before running this, then compare EXPLAIN ANALYZE BUFFERS and cold application responses. The index targets the recent-window scans; V1461's complete since-apply aggregation can still require substantial work. Remove an invalid failed build or roll back only this new index using the owner connection, never the table or primary key. No support message or provider change has been sent or executed by this release.

Production release completion requires the Node regressions, build, all GitHub checks (including browser acceptance), READY deployment at the exact merged commit, and fresh API/database observations. Record final results in the release PR.
