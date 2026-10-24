# V269 | Database incident and sealed kernel cycle evidence

**Recorded:** 2026-10-24, 06:00 UTC. **Production baseline:** V268 commit `639a0cec3c34b79488c14f71d72a2a07125ea60c`.

## Read-only observations
- **06:00:23 UTC**, Supabase management SQL returned `max_connections=60` and `pg_stat_activity count=23`. A later SQL read returned `pg_stat_activity count=22`, `state=active count=2`, `wait_event_type=Lock count=0`, `pg_cron launcher count=1`. These are transient samples, not proof of peak capacity or backend/pooler availability.
- SQL also independently confirmed **58 active**, **38 paused** pg_cron jobs. Nothing was modified.
- A broader cron job run-history read timed out with `Connection terminated due to connection timeout`, corroborating **intermittent** management SQL access. No verified failure-free job history can be claimed.
- In the approximately 15-minute sample ending near 06:00 UTC, Supabase ClickHouse log aggregates contained 20 timestamped messages with the text "timeout" among 62 `postgres_logs` entries, 5/39 `postgrest_logs`, 8/32 `supavisor_logs`. These are *message-match counts*, not deduplicated failures or per-request error rates.
- Latest Vercel private `/api/ops-heartbeat` still logged `KERNEL_SEAL` / `DATABASE_SEAL_TRANSPORT_TIMEOUT`; public triage still said `DATABASE INCIDENT REPORTED`.
- Supabase SQL and the public website are independently reachable at times. Neither isolated success proves two healthy kernel cycles, signed-in Auth, or paid subscription billing.

## V269 bug fix: independent execution-receipt pairing
Prior `assessDatabaseRecovery` counted two distinct run IDs **and** compared only the two latest raw receipt completion times. That could mistake two deliveries of one run for independently spaced cycles when another distinct ID appeared elsewhere, or mis-assess cycles when duplicates reordered evidence.

V269 requires two fresh `SUCCEEDED / EXECUTE / HEALTHY` signed-off, `WAIT / 0R` receipts from **different run IDs at least 60 seconds apart**; exact duplicate re-deliveries are deduplicated and any run ID with contradictory finished times invalidates the pair. Existing SQL, PostgREST, cron, payment, incident and safety gates remain mandatory. No candidate release is authorized by this alone.

## Escalation and actions still required
- Provider must investigate pool-acquisition `PGRST003`, 15s Supavisor backend auth timeouts, DB/cron worker errors, compute/IO, connection exhaustion *over time*, and upstream networking. A point-in-time 23/60 count does **not** rule out saturation during other moments.
- Obtain two actual independently verified healthy sealed-kernel cycles **after** reliable DB recovery, not simulated pass receipts.
- Verify Auth end-to-end, actual provider-paid entitlements, legal market data redistribution, fresh forecast ledger, browser acceptance and proper backups before commerce.
- Preserve 58 active and 38 paused jobs, RLS, kernel seal, trade lock, `WAIT / 0R`, and the V268 public release CI smoke. No secrets, SQL writes, scheduler mutations or automatic payment acceptance.

## Durable storage
Source, fixtures, operator incident evidence and GitHub CI run logs are versioned. This is **not** a verified physical Supabase data backup.
