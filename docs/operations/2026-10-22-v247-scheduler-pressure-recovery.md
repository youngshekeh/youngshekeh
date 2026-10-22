# V247 · Database pressure audit and release readiness incident record

**Date:** October 22, 2026 (Thursday). **Environment:** Supabase `mpcelmjiycjpdyyflisn` / `eu-west-1`, Vercel project `the-father-analytics`. **Change class:** offline research tooling, no database mutation.

## Launch reality and observed evidence

The public website and independent reference Gold/BTC prices are available on supported sampled checks, but the private continuous runtime is *not certified*. At **18:39:29 UTC** the production V246 heartbeat still returned HTTP **503**, `KERNEL_SEAL` with `DATABASE_SEAL_TRANSPORT_TIMEOUT`. At 18:34 a heartbeat also timed out after its 70-second request budget. The Edge private kernel v9 is active, but this is not evidence of successful kernel execution.

A direct read-only `command_kernel_seal_status()` call succeeded with `sealed=true`, version v180.6, while nearby SQL management queries frequently returned connection timeouts. At 18:43:08 UTC the server reported **21 current connections of 60 max_connections**, **0 lock waiters**. Thus we have no grounds to assert max connections were reached.

During the 17:30–19:10 UTC querying window (limited by actual log availability at capture), observed:
- `pg_cron` startup timeout counts across job IDs 20 and 21: **10 each**; jobs 13, 16, 17: **9 each**; jobs 33 and 39: **8 each**. These are log events, not necessarily consecutive complete cycles.
- Supavisor logged **9 backend authentication timeouts at 15000ms**, **5 ECHECKOUTFAILED / PostgreSQL SQLSTATE 08006** authentication failures, and **4 EAUTHQUERY** backend-unavailable failures. These are heterogeneous evidence and should not be summed as unique failed requests.
- A separate earlier interval (16:20–16:55 UTC) contained PostgREST timeout-manager kills and pg_cron startup timeouts on jobs 32, 33, 39, 81, and 95.
- The 58 active cron schedules were read-only inspected. Representative market capture jobs **13,16,17** all use `*/5 * * * 1-5`, job 20 uses `1-59/5`, job 21 `2-59/5`, job 33 `3-59/5` and job 39 `4-59/5`. Startup collisions are plausible but not yet proven to be the underlying infrastructure cause.

## V247 changes

A versioned **static** 58-job `cron.job` schedule snapshot (names/IDs/schedules only; commands, auth, credentials and customer content withheld) was checked into `docs/operations/data/v247-cron-job-schedules-2026-10-22.json`.

A reusable offline calculation and command were built:

```bash
node scripts/v247-cron-collision-audit.mjs
node --test tests/v247-scheduler-pressure-audit.test.mjs
```

The audit enumerates scheduled starts per minute for an explicitly selected weekday/hour and previews exactly one proposed canary shift: job **16** `live_markets_snapshot_capture`, `*/5 * * * 1-5` to `3-59/5 * * * 1-5`. It **does not apply** the timing change. Both schedules retain 12 starts/hour on weekdays. The simulation explicitly records job count unchanged and `cron_modified:false`. It refuses any change to day-of-week, hour, cadence, or job identity.

**Interpretation:** an apparent reduction in coincident scheduled start times is not a reduction in measured concurrent running jobs. Every job can take different execution time. Supabase [Cron docs](https://supabase.com/docs/guides/cron) recommend no more than 8 *concurrently running* jobs, which cannot be proven or disproven from this schedule snapshot alone.

## What is required before any canary schedule edit

1. Verify reliable 20–30-minute *prechange* runtime observation of each candidate job's start-time and completion, and database CPU/RAM/IO and Supavisor auth/checkout latencies from [Supabase Database Observability](https://supabase.com/dashboard/project/mpcelmjiycjpdyyflisn/observability/database). Fail closed when the query source remains timing out.
2. Check downstream consumers and snapshot freshness impact of moving the job phase. Do not alter Gold spot job 17 ahead of gold shadow (20) or finalization (21) without proving ordering.
3. Request explicit operational approval of *that exact job* and its verified schedule change, preserving command, name, permissions, weekday and five-minute cadence. Record the old value and a concrete rollback plan first.
4. Only then use the supported `cron.alter_job` API according to [Supabase's pg_cron debugging guide](https://supabase.com/docs/guides/troubleshooting/pgcron-debugging-guide-n1KTaz), verify exactly one schedule row changed, and collect postchange error rate over multiple cycles. Revert on degradation.
5. Never globally pause cron or reset the database to address isolated errors; preserve all engines. The private kernel must still earn **two consecutive certified fresh run receipts** before release; public broker evidence, auth, billing entitlement acceptance and QA remain independent.

## Infrastructure escalation, sanitized support message

> Supabase project `mpcelmjiycjpdyyflisn` (EU-West-1, PostgreSQL 17.6) intermittently fails simple SQL queries with connection timeouts while Supavisor logs `DbHandler: Authentication timeout after 15000ms`, ECHECKOUTFAILED SQLSTATE 08006, and EAUTHQUERY backend-unavailable errors. Postgres logs contain repeat pg_cron job startup timeouts across many independent active jobs, and PostgREST request timeouts. At 18:43 UTC on October 22, 2026, 21 connections of max 60 were visible with no lock waiters, so we cannot attribute this to exhausted max_connections alone. Can Supabase support inspect compute pressure, pooler authentication, CPU/I/O, pg_cron background worker constraints and internal network around 17:30–18:45 UTC? We have sanitized UTC timestamps and can provide logs; no service credentials included.

**Launch controls remain unchanged:** public research separated, live orders OFF, `WAIT/0R`, private kernel unverified, checkout LOCKED. This release provides an auditable basis for safe decisions and is **not itself a database repair**.
