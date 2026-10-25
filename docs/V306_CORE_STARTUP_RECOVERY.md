# V306: Core Scheduler Startup Recovery Admission

25 October 2026. A read-only safeguard for the cron job 44 autonomous core. Neither an HTTP 200 nor a single successful SQL probe certifies the database scheduler.

## Verified observations

- V305 production deployment READY describes website delivery only.
- Function MD5 ad18646c899eaffd2e7f6dfae567ce71 matches the V304 expected original; job 44 remains active on 11,26,41,56 * * * *.
- As of 13:18 UTC, the six newest completed core job runs each failed with job startup timeout.
- Two small SQL checks succeeded; later database probes timed out. ACTIVE_HEALTHY project state does not establish private runtime availability.
- V304's bounded-history SQL optimization fixes a statement timeout after a job starts, not a job startup timeout.

## Manual recovery admission

1. Coordinate with the existing Supabase support case SU-523502. Do not reset the project or edit unrelated cron jobs.
2. When connectivity is recovered, collect read-only catalog fingerprints, two independent SQL receipts at least two minutes apart, and recent cron job 44 run receipts.
3. Assess via src/v306-core-recovery-admission.mjs. Missing, stale, duplicate, or startup-failing evidence must HOLD. Even a pass permits only *manual V304 review*, never automatic schema changes.
4. Recheck exact live security settings, rollback, scheduler configuration and CI before any separately reviewed migration. This module makes no SQL calls.
5. Require fresh autonomous machine receipts, Auth checks, 107 QA probes, browser QA, licensed market data and signed paid entitlement evidence before commercial launch.

Checkout remains HOLD. Live order submission remains disabled, capital permission WAIT / 0R. No data modification, credential exposure or new probe load is introduced.
