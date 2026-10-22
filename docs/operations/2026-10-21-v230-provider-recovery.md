# V230 | Provider-level production recovery and bounded SQL diagnostics

2026-10-21, 14:18 UTC (15:18 WAT), source-specific live checks.
Production V229 deployed on commit 418b43308ccc6c852481e05920ea3e367f734445. Supabase management SQL still timed out. Vercel kernel returned KERNEL_SEAL failures through 14:15 UTC. Read-only Supabase logs requested for 13:00–15:00 UTC yielded up to observed 14:17 UTC: 149 pg_cron startup-timeout events, 20 Supavisor auth timeouts and five PostgREST 57014 timeouts. Zero PGRST002 events in this partial query does NOT certify recovery. Public Gold HTTP 503 at 14:17:23 UTC, V204 activation DATA_DEGRADED with 0/6 passed at 14:18:03 UTC.

## What V230 adds
Offline-only deterministic support ticket draft based on an explicitly redacted snapshot, strongly typed evidence validator, tightly bounded read-only diagnostic SQL worksheet, regression tests and CI. Ticket remains a DRAFT and requires operator submission. Neither this build nor a passing CI run claims a database or market-data recovery.

## Provider-directed diagnosis
Official Supabase pg_cron documentation recommends no more than 8 concurrent jobs in typical operation. Investigate actual concurrent executing jobs and compare against compute capacity. Inspect pooler authentication, max connections, CPU, RAM and I/O with Supabase support. Also verify exposed schemas in Data API settings have not been removed, since current PostgREST PGRST002 guidance identifies that possible cause; don't infer all prior schema-cache errors were caused by load.

Diagnostic SQL is not run by this build. Only execute individual READ ONLY transaction blocks after Supabase support authorizes a short, safe diagnostic during stable connections. It reports aggregated state and job IDs, not customer queries or auth credentials.

## Release safety
No cron schedule changes, database migrations, restarts, credential rotation, payment collection or trading. Checkout guard stays hard-locked, WAIT / 0R. Completion requires provider connection stability and cron success, distinct sealed V180 receipts, fresh real broker Gold, passing authenticated private QA, end-to-end identity and actual billing entitlements before commercial launch.

Support URL: https://supabase.com/support
Connections: https://supabase.com/docs/guides/database/connection-management
Cron: https://supabase.com/docs/guides/cron
PostgREST: https://supabase.com/docs/guides/troubleshooting/postgrest-error-pgrst002-could-not-query-the-database-for-the-schema-cache-c396e9
