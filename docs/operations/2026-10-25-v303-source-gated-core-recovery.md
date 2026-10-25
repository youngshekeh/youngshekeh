# V303 | Production V70 bounded cron-history query recovery
2026-10-25 11:20 UTC. Baseline production GitHub SHA: `8b4e22107ac24e8df18c05ae38a90ced285a4b3e`.

## Actual measured results
- Production original V70 failed-cron lookback `select count(*) from cron.job_run_details where start_time >= now()-interval '2 hours' and status not in ('succeeded','running')`: PostgreSQL `EXPLAIN (FORMAT JSON)` chose parallel **sequential scan**, estimated cost **21112.51**. Cron history ~130 MB and only index was primary key `runid`.
- The V302.1 two-boundary alternative worked but retained estimated cost ~9695.47. A better **single index-ordered 1025-record** test returned `scanned=1025`, `boundary_time=2026-10-25T03:51:00Z` (more than seven hours before test), `failures_2h=177` and `complete_coverage=true` at `2026-10-25T11:13:10Z`. Its `EXPLAIN` estimated cost **162.30**, backed by the existing `job_run_details_pkey` B-tree. This is approximately 99.2% lower *estimated planner cost*, **not a measured runtime speedup or proof of full database recovery**.
- `public.refresh_autonomous_machine_state()` live definition was read as a whole (~10,618 bytes) with `SECURITY DEFINER`, search_path `public, pg_temp`, owner `postgres`, EXECUTE `postgres, service_role` only. After that verified inspection, two attempts to re-read full source plus catalog security evidence for immediate exact-source patch **timed out** due to unstable Supabase connection admission.
- Most recent core machine-state was still stale at 11:09 UTC: `updated_at=2026-10-25T09:22:00.091342Z`. Cron logs had further startup timeouts for jobs 41, 30, 33, 81, 68, etc., and SQL statement cancellations. The project control plane can say `ACTIVE_HEALTHY` even while runtime SQL connections fail.

## What V303 delivers now
- `supabase/recovery/v303_readonly_cron_benchmark.sql` is **SELECT-only**, reproducing the actually verified efficient indexed test. No live database modifications.
- `scripts/v303-build-core-migration.mjs` is an **offline**, deterministic source-locked builder. It accepts a fresh, complete, byte-exact `pg_get_functiondef('public.refresh_autonomous_machine_state()'::regprocedure)` dump as an input file and generates **both** a reviewed apply migration and exact-source rollback. It refuses partial sources, missing security pinning, duplicate anchors or unrelated function drift; migration preflight compares `md5(pg_get_functiondef(...))` to input and enforces owner `postgres`, SECURITY DEFINER and service-only grants. Postflight checks the new full-source fingerprint. Local SQL has `lock_timeout=1500ms` and `statement_timeout=15s`. On failure the transaction must roll back.
- The targeted replacement samples at most 1025 newest cron jobs via PK, checks that the oldest boundary predates the required two-hour window, computes exact failures from those samples, and raises an exception **before machine-state writes** if the audit coverage is incomplete. The stored state stays stale/HOLD rather than changing an incomplete audit to zero failures.
- Tests validate rewrite isolation, source/grant fingerprint checks, fail-closed semantics, original body preservation, rolling back to original and source mutation rejection.
- The **actual production V70 function is NOT patched** in this release. The generated migrations have **not** been created from a current reliable live source. This is intentionally a source-controlled, release-tested engineering checkpoint, not a claim of restored machine state.

## Subsequent acceptance prerequisites
1. Stabilize Supabase SQL admission and verify Postgres CPU/RAM/swap, I/O budgets and pg_cron worker startup with provider support; **do not** assume indexing alone explains every startup timeout.
2. Obtain full exact live source **and** catalog owner/grants in a single stable acceptance session. Source must not be transcribed from previous tool output or snapshots.
3. Run `node scripts/v303-build-core-migration.mjs <live_source.txt> <controlled_output_dir>` in a trusted operator shell, independently inspect both complete SQL files, and run full PR exact-SHA tests before use.
4. Confirm V301 job 44 schedule still `:11/:26/:41/:56`, the finance locks remain `WAIT / 0R`, no current severe incident and database has spare connections. Apply only reviewed DDL through a controlled Supabase migration, with preflight checksum and valid rollback.
5. Verify new function fingerprint, unchanged service-only grants and the indexed query plan. **Do not manually call the heavy refresh function during admission failures**. Verify an actual scheduled job44 success and `autonomous_machine_state.updated_at` advancing, then rerun 107 private QA checks and full smoke.
6. Keep Gold V79 LOAD_SHED, BTC licensing holds, checkout HOLD and real trading WAIT/0R until separately tested release gates.

This release has no Vercel code/UI change, no new cron job, no extra queries in production, no RLS change and no payment or execution unlock.
