# V243 · Incident-safe Gold first paint and private database triage

Date: 2026-10-22. Production base: V242 `64bb8e9ea2056a5c72f0972f4242bf35b5b8abe9`.

## Verified observations
- Vercel production V242 was READY. Private scheduled kernel heartbeat continued returning 503, particularly `KERNEL_SEAL` / `DATABASE_SEAL_TRANSPORT_TIMEOUT`. An authenticated HTTP request or green Vercel build does not constitute a successful private kernel execution receipt.
- Supabase project reported ACTIVE_HEALTHY while direct read-only SQL succeeded intermittently. On 2026-10-22 one short query observed 19 sessions against `max_connections=60`, so a snapshot does **not** prove connections were exhausted.
- An independent read-only SQL query counted **58 active cron jobs of 96 configured**. Follow-up pg_cron run-history and advisor queries timed out. Earlier PostgreSQL logs recorded repeated cron job startup timeouts. The exact bottleneck (compute, connection routing, internal extensions, or workload contention) remains **unproven**.
- Public research reference prices are independent of the private kernel; neither is proof of broker-live prices, trading permission, or paid entitlements.

## Change
- Gold Live previously initialized multiple unavailable data counters at literal 0 and source status as `NOT CONNECTED`. When JS or the database fails, the browser exposes these defaults as factual observations. Nineteen first-paint placeholders now say `WITHHELD` (or `UNVERIFIED`) until the existing renderers replace them with current verified evidence.
- Preserve the full 936 unique DOM IDs and all engine wiring. Do not remove modules, credentials, or cron jobs; do not change any live-order or billing gate.
- The existing V241 rendering logic still clears stale data dynamically. This change closes the gap *before* the first successful request and during an early JS/network failure.

## Non-disruptive recovery checklist
1. Inspect Supabase Database Observability for CPU, memory, Disk I/O, database connections, Supavisor request saturation, and pg_cron startup timeouts in the same UTC window. Capture comparative healthy/unhealthy windows.
2. When queries succeed, inspect schedules and each job's owner/name (not stored credentials or raw job command text). Group active jobs by exact minute to identify coincident load. Do **not** alter unrelated jobs or globally disable `pg_cron`.
3. Identify the exact failing database seal transport and run `select public.command_kernel_seal_status()` read-only only when database service responds reliably. A result with `sealed=true` is necessary but not sufficient for launching the private machine.
4. Require consecutive certified private-kernel run receipts, verified public MT5 bid/ask timestamps, full private QA, and payment entitlement acceptance independently. Until then: `WAIT/0R`, live execution OFF, checkout LOCKED.
5. If repeated SQL timeouts persist across light queries and management APIs, open a Supabase support case with timestamps, project reference, SQLSTATE failures and sanitized log samples; avoid speculative restarts or plan upgrades.

## Verification
- Run `node --test tests/v243-*.test.mjs` and existing V241/V242 tests.
- Run full repository CI, Vercel build checks, and validate the served Gold page after production deployment.
- A deployed first-paint patch is **not** a database recovery certificate.
