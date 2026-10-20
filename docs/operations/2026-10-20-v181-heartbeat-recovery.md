# V181 non-disruptive heartbeat recovery

**Observed on 2026-10-20 (UTC)**

- Vercel project: `the-father-analytics` (production `thefatheranalytics.com`).
- The `/api/ops-heartbeat` cron endpoint is reached every five minutes.
- V180 then repeatedly reports `RECOVERY_QUIESCE_BLOCKED`, `NO_DATABASE_ROUTE`, or `TimeoutError`. Production logs show at least 279 grouped occurrences through 15:50 UTC.
- Supabase control plane reports `ACTIVE_HEALTHY`, but numerous SQL data-plane queries time out. This does **not** prove that the private kernel can reach PostgREST or that scheduled tasks complete.
- Independent pg_cron jobs are configured and many remain marked active. A configured schedule is not proof of successful execution.

## Rationale for V181

The previous heartbeat attempted `cron-launch-gate?mode=off` after a kernel failure. That internal gate executes a cluster-wide PostgreSQL `ALTER SYSTEM ... cron.launch_active_jobs = 'off'`, which could stop unrelated ingestion, billing, signals and integrity jobs if backend connectivity fails. It may not be possible to resume if the same failure prevents reaching the gate. This is inappropriate as automatic recovery from transient connectivity errors.

V181 changes only the public Vercel cron shell:
1. Preserve `CRON_SECRET` authentication and Vercel OIDC.
2. Call the existing private, sealed V180 kernel normally.
3. On kernel success, preserve the existing healthy response.
4. On kernel failure, return HTTP 503 with a machine-readable fail-closed state **without changing any PostgreSQL scheduler state**.
5. Preserve trading locks: `WAIT`, `0R`, no external execution.

V181 **does not** claim to fix underlying database connectivity. It removes one dangerous failure-side effect; actual restoration requires diagnosis and verification.

## Recovery checklist (manual, owner-authorized)

- Verify PostgreSQL connection capacity, pooler availability, postgrest logs, and Supabase project resource utilization.
- Confirm `cron.launch_active_jobs` setting and verify run details for representative 5-minute jobs. Do not globally toggle this setting as a generic fix.
- Review Supabase Edge Function logs for `runtime-v180-continuous-kernel`, `runtime-v180-cron-launch-gate` and `runtime-v179-resource-governor`.
- Investigate PostgREST request failures and upstream timeouts. Use bounded retries and per-task circuit breakers, never global cron shutdown.
- Ensure the V180 seal is valid. Any seal repair requires a separate authorized change.
- After a reviewed merge, verify the next two scheduled heartbeats, database job completions and absence of any unapproved trades before declaring recovery.

**Acceptance:** heartbeat HTTP 200 and a recent verified kernel-success receipt on two consecutive cycles; representative ingestion, publication and alert tasks complete; all capital controls remain `WAIT/0R`. If those conditions fail, report degraded status instead of claiming the machine is running.
