# V232 Gold snapshot admission recovery, dry-run first
As of 2026-10-22, the production Supabase project has repeated pg_cron startup and pooler authentication timeouts. This is a staged *option* rather than evidence of a fix.

## Verified baseline
job 13 gold-live-snapshot-5m, job 16 live_markets_snapshot_capture, job 17 gold_spot_snapshot_capture all run on the weekday minutes 0,5,10...
job 20 gold_spot_shadow_capture runs 1,6,11... and job 21 gold_signal_resolution_finalize runs 2,7,12...
These dependencies are preserved. Job 17 remains at 0. Jobs 13 and 16 move respectively to 3 and 4. Five-minute frequency and weekday-only boundaries remain unchanged. Neither job is disabled.

## Safe procedure
1. Preflight: get stable read-only Supabase queries, the two exact jobnames/schedules and live command fingerprints. Check clock, system resource pressure and pooler.
2. Validate source CI and review the SQL.
3. Execute v232-gold-snapshot-admission.sql **only** with stable database access. It holds a transaction advisory lock, records a per-job baseline, verifies exact preconditions, and rolls back atomically on failure.
4. Confirm schedules, current market snapshots, job receipt outcomes, no additional provider pressure and two successive V180 kernel-sealed, certified receipts. If degraded, execute exact rollback while no operator changed those jobs.
5. Rerun all 107 autonomous runtime QA checks and verify paper broker plus commercial gates independently. Do not bypass any failures.

This recovery has NOT been executed by a passing CI test. A SQL static test proves shape and boundaries, not database execution or runtime health.

No real trading or payment activation. WAIT / 0R remains mandatory.
