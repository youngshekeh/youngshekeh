# V302 · Targeted cron failure lookback index recovery
**October 25, 2026; production base V301: bf914dc7be90ebc8e051d6523d6feecc7d102227.**

## What was actually measured
- V301 safely shifted the autonomous-core cron job 44 from :07/:22/:37/:52 to :11/:26/:41/:56, without changing the 15-minute period; later production read-back confirmed both schedules and their active flags.
- At 10:45 UTC 2026-10-25, machine-state `updated_at` was still `09:22:00Z`, >83 minutes stale. Cron scheduler status and old `ONLINE` machine_state alone do not certify recovery.
- Core SQL `public.refresh_autonomous_machine_state()` directly computes `count(*)` from `cron.job_run_details` filtered by `start_time >= now()-interval '2 hours' and status NOT IN ('succeeded','running')`. Its query plan (read-only EXPLAIN, no ANALYZE) is a **parallel sequential scan** with ~21,113 planner cost, not an indexed recent-failure lookup.
- The pg_cron `job_run_details` has a `runid` primary index only, total relation size ~130MB, estimated ~21,988 rows; stats report non-success rows ~2%. Hence a small partial timestamp index can reduce repeated table scans and preserve every historical run.
- Continued service connection and statement timeouts were observed after V301, along with past cron job startup timeouts. This is a plausible contributing workload, NOT proof it caused every Postgres connection timeout. Broader CPU/memory/I/O metrics must also be checked in the Supabase Dashboard.

## One narrow reversible fix
- Add only `cron.v302_failed_runs_by_time_idx` on `cron.job_run_details(start_time DESC) WHERE status NOT IN ('succeeded','running')`; no index on the 98% successful-run rows.
- Supabase migration uses transaction-local `lock_timeout=1500ms` and `statement_timeout=15s` so it gives up rather than indefinitely blocking core cron writes. Standard CREATE INDEX may block writers during that bounded window. **Do not replace it with a permanent table lock or turn off cron.**
- Preflight verifies exact V301 job 44 schedule/command, absence of conflicting index name and expected source table. Postflight verifies a valid ready index and predicate. Transaction must roll back if these assertions fail.
- A separate reviewed rollback drops only the exact index name and type after a definition check; it does not truncate cron history or modify pg_cron jobs.
- This release is database-only. No Vercel [deploy], source/data access, private OIDC, Gold/Bitcoin prices, events, billing, checkout or trading changes.

## Acceptance
1. Full exact PR HEAD CI including V302 tests, V240 regression, Supabase source-safety and Chromium acceptance. Check only expected release files.
2. Production preflight: exact name and absent index, current 0R locks, DB admission within reasonable latency. If errors prevent connection, **withhold DDL** rather than flood.
3. Apply audited SQL through Supabase migration tool. If the lock or execution timeout rejects, stop and prefer off-peak provider-assisted `CREATE INDEX CONCURRENTLY` outside a transaction; Supabase branching migrations cannot execute CONCURRENTLY inside transactions.
4. Verify PG catalog `indisvalid`, `indisready` and schema/definition. Run a read-only `EXPLAIN` of the *same* V70 failure lookup and confirm indexed access vs baseline, without changing optimizer flags.
5. Verify a genuine successful cron core run and renewed autonomous_machine_state.updated_at after one scheduled execution before claiming autonomous recovery. If failures persist, investigate CPU, memory, disk, connection pool and pg_cron startup errors with Supabase support.
6. Previous private QA 77/107, production smoke 8/9, market licensing HOLD, paid checkout HOLD and trading WAIT / 0R remain closed.

## Current docs
Supabase: https://supabase.com/docs/guides/database/postgres/indexes
PostgreSQL: https://www.postgresql.org/docs/current/sql-createindex.html
Supabase pg_cron: https://supabase.com/kb/troubleshooting/pgcron-debugging-guide-n1KTaz
