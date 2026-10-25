# V302 / V302.1 Production incident: Postgres cron history bottleneck | 2026-10-25

## Verified facts, UTC
- V301: core cron 44 schedule confirmed changed to `11,26,41,56 * * * *`, ops watch 41 kept `7,22,37,52 * * * *`; latest stored autonomous_machine_state.updated_at still `09:22:00.091342Z` at checks after 10:45. The last *stored* database_state ONLINE is stale, **not** proof of healthy current database.
- V70 `public.refresh_autonomous_machine_state()` contains a two-hour failed-cron COUNT query. `EXPLAIN (FORMAT JSON)` on that exact query chose a **parallel sequential scan**, cost ~21112.51.
- `cron.job_run_details` stats estimated 21,988 tuples, ~130 MB including indexes, with only a runid primary index. Stats suggest ~2% non-success. One indexed runid boundary (`maxrunid - 4000`) corresponded to ~28.8 hours back, over the 2-hour required check.
- V302 reviewed partial index `cron.v302_failed_runs_by_time_idx`, tested with **68/68** exact-head CI; source merged in PR #267 / SHA `7956716f9b8e266bf4546aa515b236fa1ce32d1b`. Live preflight at 10:53 UTC showed job44 correct, no index, 12 DB sessions, 0 lock waiters and 0 open severe status incidents. **Migration was rejected** with SQLSTATE 42501: `must be owner of table job_run_details`. No index was created. Do not attempt role escalation or forced ownership via SQL. Source-control migration is **NOT deployed**.
- Subsequent queries to retrieve the existing V70 function definition or calculate its MD5 failed with database `Connection terminated due to connection timeout`. Stop retrying automated DDL while database admission remains intermittent. Supabase project control plane previously reported ACTIVE_HEALTHY, which does not disprove SQL admission failures.

## Independent indexed audit candidate, not deployed as a function rewrite
`v3021_recent_cron_failure_readonly.sql` is a SELECT-only diagnostic. It uses existing runid primary index to select a bounded **1024** recent-run window and a preceding boundary record. Only emits an actionable failed-2h count when the boundary is strictly older than two hours. If the run rate increases and coverage becomes inadequate, emits `HOLD_INCOMPLETE_AUDIT` with a **NULL count**, not fabricated zero failures. Independent JS policy and CI tests mirror this. Not wired into V70 refresh and NOT proof of restored autonomous operation.

Changing production V70 `SECURITY DEFINER` function must await a verifiable complete baseline definition, precise diff/rollback and stable SQL admission. Do not splice function source blindly or run it manually during saturation.

## Escalation (Supabase infrastructure / database owner)
Project ref: `mpcelmjiycjpdyyflisn`, region eu-west-1, PostgreSQL 17.6.1.166, 58 active scheduled jobs, `cron.max_running_jobs=32`, `max_connections=60`.
Share with support: repeated `cron job XX job startup timeout` at ~09:52–10:22 UTC October 25, 2026, SSL connection resets, recurring SQL statement and connection timeouts, V70 job44 stale since 09:22 despite correct active 15m schedule, `cron.job_run_details` full-scan estimate ~21113, permission error 42501 on targeted partial index. Request live CPU, RAM/swap, disk IO, Postgres active/idle connection saturation and pg_cron extension owner/indexing strategy. Seek provider-admin concurrent index creation **only after capacity review** or approved compute remedy. Do not suggest a restart as certain fix.

## Launch guards
Website remains V300 READY, Gold private engine LOAD_SHED, full private QA 77/107 and smoke 8/9; checkout HOLD, data redistribution restrictions enforced, trading WAIT / 0R. No change to user finances or secret keys in this incident work. Full QA and smoke require fresh actual re-execution before closing incident.

References:
- https://supabase.com/kb/troubleshooting/failed-to-run-sql-query-connection-terminated-due-to-connection-timeout
- https://supabase.com/kb/troubleshooting/pgcron-debugging-guide-n1KTaz
- https://supabase.com/docs/guides/database/postgres/indexes
