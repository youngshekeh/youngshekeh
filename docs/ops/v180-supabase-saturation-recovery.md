# V180 Supabase Saturation Recovery Runbook

## Purpose

Recover THE FATHER ANALYTICS from a pg_cron / Postgres connection-admission saturation event without loosening trading, capital, credential, publishing, or external-execution controls.

## Incident fingerprint

Treat the database as saturated when one or more of these are sustained:

- Postgres logs: `cron job <id> job startup timeout`
- PostgREST: `PGRST002` or database connection unavailable
- Supavisor: `EAUTHQUERY authentication query failed: connection to database not available`
- Direct Postgres: `CONNECT_TIMEOUT`
- V72 load-shed enforcer cannot start
- Management SQL / table introspection times out

During this state the sovereign machine state remains:

- action permitted: WAIT
- capital permission: 0R
- live order routing: false
- funds moved: false
- trades sent: false
- human release required: true

## Automatic recovery ladder

Production Vercel cron calls `/api/ops-heartbeat` on the incident cadence.

1. **Sealed kernel attempt**
   - Calls `runtime-v180-continuous-kernel`.
   - Kernel must prove `command_kernel_seal_status()` returns a valid private seal receipt.
   - If the seal is present and the kernel succeeds, recovery and seal stages are skipped.

2. **Scheduler recovery fallback**
   - Calls `runtime-v180-emergency-scheduler-governor`.
   - Uses one Supavisor transaction-pooler connection and an advisory transaction lock.
   - Applies only recorded, reversible schedule changes.
   - Original schedules remain in `private.v180_emergency_scheduler_baseline`.
   - Missing target jobs fail closed.

3. **Security seal**
   - Calls `runtime-v180-kernel-seal`.
   - Creates/verifies the five kernel tables.
   - Requires RLS on every exposed kernel table.
   - Requires owner-scoped authenticated read policies.
   - Revokes anon access.
   - Keeps write authority server-side.
   - Installs the atomic begin/recover/finish kernel RPCs.
   - Writes `private.v180_kernel_seal_receipt` only after verification succeeds.

4. **Next heartbeat**
   - The kernel sees the valid seal receipt.
   - V180 enters continuous internal operations.
   - Recovery and schema-seal work are skipped on healthy heartbeats.

## Browser containment

Until the V180 security seal is proven, Command OS must not read:

- `command_ops_kernel_policies`
- `command_ops_kernel_runs`
- `command_ops_kernel_state`
- `command_dispatch_retries`
- `command_ops_dead_letters`

The UI shows **SEAL PENDING** and keeps those datasets empty.

## Recovery governor principles

Critical safety/state lanes remain relatively frequent and phase-separated.

Non-execution-critical lanes may be reduced and staggered during incident recovery, including:

- research evaluation
- shadow trading / shadow portfolio
- paper portfolio analytics
- review intelligence
- disagreement intelligence
- attribution / learning
- provenance batching
- public cache refreshes

No scheduler recovery can grant trading or capital permission.

## Exact rollback

Emergency schedule rollback:

- `supabase/recovery/v180-emergency-scheduler-governor-rollback.sql`

Recovery plan source:

- `supabase/recovery/v180-emergency-scheduler-governor.sql`

Rollback restores the exact schedules captured before V180 changes. It does not guess defaults.

## If automatic recovery cannot obtain a database connection

Do not loop direct SQL or pooler retries aggressively.

Official Supabase guidance for sustained database-overload connection timeouts is to use Project Settings to restart the database, or increase project resources if the workload remains too large after restart. A restart is a disruptive control-plane action and must be explicitly approved by the owner.

After a controlled restart:

1. Leave real-capital execution locked.
2. Allow the next V180 heartbeat to run the recovery ladder.
3. Confirm scheduler governor returns success.
4. Confirm kernel seal returns `SEALED`.
5. Confirm the next heartbeat returns `CONTINUOUS_KERNEL_ACTIVE`.
6. Verify RLS, policies, RPC grants, and anon revocation.
7. Run Supabase security/performance advisors.
8. Re-enable Command OS kernel telemetry only after the seal is verified.
9. Observe Postgres, PostgREST, Supavisor, and cron failure counts before restoring the normal heartbeat cadence.

## Current temporary incident cadence

The recovery heartbeat is intentionally reduced from every five minutes to:

`*/15 * * * *`

This canonical Vercel schedule limits failed recovery connection attempts while Postgres is saturated. Restore the normal five-minute cadence only after the database is stable and the V180 kernel has produced healthy receipts.

## Success criteria

Recovery is complete only when all are true:

- Postgres startup-timeout rate materially falls
- PostgREST and Supavisor admission errors normalize
- governed cron phases are compliant
- V180 seal receipt exists
- all five V180 public tables have RLS enabled
- anon has no access
- authenticated reads are owner-scoped
- kernel RPCs are service-only
- at least one continuous kernel heartbeat succeeds
- unresolved dead letters keep health DEGRADED
- live trading and real capital remain independently gated
