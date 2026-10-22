# V232 · Database pressure recovery and exactly reversible snapshot phasing
Date: 2026-10-22. Base: V231 commit 326441e647883cfdf8768353054ae82b3627594e.

## Observed facts (not forecasts)
- Supabase V180 kernel repeatedly failed at KERNEL_SEAL; SQL pooler 9-second deadline and PostgREST 8-second fallback both timed out.
- Supavisor logged at least 22 authentication timeouts around 06:10–07:05 UTC; further instances through 07:17 UTC.
- PostgreSQL logged frequent cron job startup and query timeouts. SQL inspection itself was intermittently unavailable.
- Job 13 gold-live-snapshot-5m, job 16 live_markets_snapshot_capture and job 17 gold_spot_snapshot_capture are all active at */5 * * * 1-5.
- Job 21 gold_signal_resolution_finalize runs at 2-59/5 * * * 1-5. Job 39 email dispatch and job 95 execution firewall remain protected and are never edited by V232.
- V231 moved the Vercel heartbeat to minute 4,9,14... on a five-minute cadence but has not independently cured database transport failures.
- Last complete 107-case runtime QA evidence: 77 passing, 30 failing. Live broker tick and real paper receipts are not verified.

## Hypothesis and narrowly-scoped mitigation
Shift only job 17 Gold spot snapshot from minutes 0/5/... to minutes 1/6/... on weekdays, retaining the same 5-minute cadence, active flag and identical command. This may reduce synchronous scheduler-start load; it is not a guarantee of DB recovery. **Safety finding (V233):** downstream job 20 Gold spot shadow capture is already scheduled at minute 1, so moving job 17's source capture there creates a same-minute dependency race. This candidate is therefore blocked by both read-only admission and the guarded SQL unless a separately verified, non-overlapping design is approved. No existing cron schedules have been changed. The finalizer remains at minute 2. All other jobs are untouched.

## Release protocol
1. RUN READ ONLY preflight: supabase/recovery/v232-gold-spot-snapshot-phase-preflight.sql.
2. Require current, healthy database transport proven by at least three consecutive independent successful probes with zero timeouts over the prior ten minutes, and positive database seal verification.
3. Verify job name/ID, command fingerprint, schedule, active status and explicit dependency timing. Record return values.
4. Only then, after separate operational review, execute apply.sql, which aborts atomically on drift, missing seal, lock contention, or verification failure.
5. Observe at least two cycles, record start-timeouts, kernel sealed receipts, market snapshot freshness and no regression. Execute rollback.sql if any of these degrade.
6. No automatic cron mutation, no service resets, no job deactivation, no capital permission, no checkout release. Both files are staged, not executed merely by deployment.

The project will remain LAUNCH HOLD until all 107 tests pass, Gold quote provenance is verified, paper broker returns authenticated evidence, and server-side payments/entitlements are independently certified.
