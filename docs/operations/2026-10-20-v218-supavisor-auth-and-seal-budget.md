# V218 | Supavisor Authentication Pressure and Seal Retry Bound

**Observed:** 2026-10-20, 20:20–20:27 UTC. **Project:** mpcelmjiycjpdyyflisn, eu-west-1.

## Direct evidence
- Supavisor `supavisor_logs` repeatedly showed `DbHandler: Authentication timeout after 15000ms` and `ClientHandler: (ECHECKOUTFAILED)` SQLSTATE **08006**, `Failed to connect to database: authentication did not complete within 15000ms`.
- Intermittent backend authentication still occurred, so the pooler is not categorically unavailable.
- The V180 Edge kernel repeatedly logged `V208_SEAL_POOLER_FALLBACK { reason: "Error" }`, then `V180_CONTINUOUS_KERNEL_ERROR KERNEL_SEAL TimeoutError`. Some runs passed the seal but reached `LOCK` and failed with `rpc_command_kernel_begin_run_503`, explicitly citing `Could not query the database for the schema cache`.
- PostgREST continued logging SQLSTATE **57014** and `PGRST002`. PostgreSQL logs continued reporting multiple `pg_cron` worker startup timeouts. These combined symptoms indicate a database/connection path incident, **not** a verified wrong password or a missing configured schema.
- Existing 58 cron job definitions were not modified. No customer data, API keys, connection strings or raw authentication payloads are included here.

## Scoped V218 code change
In the authenticated private `runtime-v180-continuous-kernel` Edge function, the SQL-pooler security-seal query retains its 9-second fail-closed deadline and single connection; if the pooler is unavailable, the **same existing** mandatory `command_kernel_seal_status` REST RPC gets an 8-second deadline instead of 22 seconds.

This bounds dual-transport seal evidence to about 17 seconds (plus small cleanup overhead). A negative returned database seal **always denies** and does not trigger fallback. Pooler errors are logged as known codewords, not their raw messages. The owner, policy, lock, recovery and finish stage timeouts remain unchanged. Therefore even if the seal passes, no complete kernel success is asserted without real DB run receipts.

**Risks:** 8 seconds can reject a healthy-but-slow REST fallback; this is an intentional fail-closed availability tradeoff during an active incident. Review and adjust only using real performance traces after the database returns to a stable state. Client HTTP abort does not guarantee the database cancels every server-side query.

## What V218 cannot fix
Supavisor backend authentication failures and PostgREST schema introspection are platform/DB issues. The database project status badge is not a substitute for successful transactions. An authenticated Supabase support escalation remains essential; verify DB CPU/IO, pooler host/config against Project Connect, connections, catalog-introspection query performance, and pg_cron worker contention. Do not disable all cron, drop indexes, raise role timeouts blindly, restart with uncontrolled data impact, or weaken RLS/security seal.

## Acceptance and rollback
Run Node CI, inspect Vercel production release READY, and read deployed Supabase Edge function version. Observe upcoming heartbeat logs: a faster failure at KERNEL_SEAL is a negative outcome but validates bounded pressure; a successful run requires fresh and independently sealed kernel receipts, two consecutive real `SUCCEEDED` rows, full readiness, authenticated member login, signed Flutterwave payment/entitlement lifecycle, and manual release. Payments remain hard-locked; capital permission **WAIT / 0R**.

Rollback: restore V217/V215 Edge `runtime-v180-continuous-kernel` source from pinned GitHub commit `ae3da9fff033ef99fe90b16119cce612eb83ea43` with `verify_jwt=false` only because the private function independently authenticates using OIDC/service role. Retain unaffected database data and job settings. GitHub source archive and ChatGPT Library continuity pack hold immutable release copies.

Supporting Supabase docs: https://supabase.com/docs/guides/troubleshooting/postgrest-error-pgrst002-could-not-query-the-database-for-the-schema-cache-c396e9 and https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting
