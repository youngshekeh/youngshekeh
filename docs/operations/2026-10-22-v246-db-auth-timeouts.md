# V246 | Kernel transport incident classification and launch diagnostics
**Observed:** October 22, 2026. Latest sampled UTC times below. **Release status:** diagnostics only, not a database fix.

## Direct evidence
- A direct database check at **15:20:17Z** returned `command_kernel_seal_status().sealed = true`, version `v180.6`. This confirms a seal existed for that read only. It is not a verified V180 continuous run.
- Supabase Edge kernel **version 9** deployed at ~16:37Z with prior comprehensive CI passing. At **16:39:29Z**, the Edge log recorded `V180_CONTINUOUS_KERNEL_ERROR KERNEL_SEAL Error: DATABASE_SEAL_TRANSPORT_TIMEOUT`, and the Vercel heartbeat HTTP 503 used error code `KERNEL_SEAL_UNVERIFIED` because the V231 classifier recognized older `timed out` strings but not this newer canonical code.
- Supavisor recorded `ECHECKOUTFAILED` / PostgreSQL SQLSTATE **08006**, with `authentication did not complete within 15000ms` at **16:39:35Z**. Additional auth query unavailability seen at 16:34:30Z.
- Postgres logs around **16:39:59Z - 16:40:08Z** contain job-startup timeouts for jobs **32, 33, 39, 81, 95**. Other jobs **13,16,17,22** completed at approximately **16:40:14-15Z**. PostgREST reported `Warp server error: Thread killed by timeout manager`.
- `cron.job` directly reported **58 active schedules**, including gold/live-market capture, gold transition, enterprise monitor/webhook, mail, capital safety. Neither V245 nor V246 mutates or disables pg_cron schedules.
- Supabase control plane returned `ACTIVE_HEALTHY` while some SQL requests timed out. Health metadata and individual successful SQL do not certify database access reliability. Root cause (CPU, per-minute contention, internal network, pooler limits, PostgREST saturation) remains under investigation.

## Code fix
- `src/v231-kernel-admission.mjs` maps **explicit** V245 `DATABASE_SEAL_TRANSPORT_TIMEOUT`, legacy deadline/abort failures, and sanitized pooler timeout classes to `DATABASE_SEAL_TRANSPORT_TIMEOUT` *only* for HTTP 503 in `KERNEL_SEAL`.
- An explicit missing/failed security seal always takes priority as `SECURITY_SEAL_NOT_VERIFIED`. Unrelated phases remain `PRIVATE_KERNEL_UNAVAILABLE`. All outcomes preserve seal_verified=false and WAIT/0R.
- Five tests validate the new error, legacy errors, negative seals, unrelated stages and non-execution.
- The V180 Edge function, credentials, source fetch, cron cadence, broker quote checks, checkout, trading governors and all website engines are unchanged.

## Safe remediation and escalation
1. Use Supabase Database Observability to compare CPU/RAM/disk/connection pressure, auth latencies and Supavisor connection checkout around **16:34–16:40 UTC**. The existence of 15-second auth timeout in Supavisor logs is much stronger evidence than a hypothetical `max_connections` error, but does not by itself establish the primary cause.
2. Review pg_cron **job startup timeout** by job ID and concurrent schedule minute; do **not** disable the global scheduler, delete unrelated jobs, or shrink forecast data collection solely based on these logs.
3. Request Supabase infrastructure support if recurring: project `mpcelmjiycjpdyyflisn` (region `eu-west-1`), SQLSTATE `08006`, Supavisor backend auth 15s, PostgreSQL scheduled job startup timeouts, PostgREST timeout-manager events and SQL management query timeouts. Reference UTC timestamps above and attach **redacted** event logs, not secrets.
4. Require independent genuine private kernel run receipts on at least two consecutive cycles, fresh broker MT5 quote evidence, full QA, current paid-entitlement proof and human approval before any commercial release. Keep capital WAIT/0R and trade submission OFF throughout.

**This release improves diagnosis only.** No successful private kernel execution or resolution of the database incident has been certified.
