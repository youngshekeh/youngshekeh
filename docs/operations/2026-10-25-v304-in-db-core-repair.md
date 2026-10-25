# V304 · Exact-fingerprint in-database repair for V70 autonomous core

Production incident October 25, 2026. GitHub base commit: 2403ebbbf3aa7d4d0d7bb0bff272d6d17ef96d32.

## Confirmed root cause
- Two latest completed cron.job 44 runs (10:56–11:00 UTC, 11:11–11:13 UTC) failed with PostgreSQL `canceling statement due to statement timeout` **inside** the unindexed `select count(*) from cron.job_run_details where start_time >= now()-interval '2 hours'` query.
- Original V70 function was confirmed at 11:26 UTC with exact `pg_get_functiondef` fingerprint MD5 `ad18646c899eaffd2e7f6dfae567ce71`, 10618 bytes, PostgreSQL SECURITY DEFINER, owner postgres, service-only EXECUTE and `search_path=public, pg_temp`.
- A read-only bounded query used existing primary key `job_run_details_pkey`, examined 1025 rows, verified the oldest boundary was older than two hours, and found 177 recent failures. Its estimated planner cost was 162.30, compared with ~21112.51 for prior sequential scan. That is planner work only, not a measured production speedup.
- Fetching complete function source with catalog checks in 2 subsequent calls timed out. Source-pinned SQL in the database avoids unsafe text transfer.

## Precise modification
`v304_fingerprint_gated_core.sql` obtains the **actual source inside PostgreSQL** via `pg_get_functiondef`, validates the exact prior MD5 and owner/grants/search path, and verifies core cron 44 still runs 11/26/41/56. It replaces only two unique spans: adds local boolean `v_cron_history_complete=false` and swaps one unbounded failure count with a materialized 1025-row descending runid sample, boundary completeness test, and a fail-closed exception **before any autonomous_machine_state or ops_events writes**. Every other machine engine, logic path, user permission and payment policy remains unchanged.

Migration uses a transaction-scoped 1.5s lock limit and 20s statement timeout, `CREATE OR REPLACE FUNCTION` through a single source-verified dynamic EXECUTE, and checks resulting function equality and preserved owner/ACL/search path. Never changes cron extension objects or schedules.

`v304_fingerprint_gated_core_rollback.sql` validates changed source and permits reversal only if reconstructing the source yields **exact original MD5**, then asserts the restored function fingerprint and privileges. It does not modify history. DDL must be applied by Supabase migration tool, not manually forcing an unverified production function.

## Release gates
1. Exact pull-request head full CI, Chromium and Supabase safety; inspect changed files.
2. Read-only preflight must show currently active job 44, original MD5, 0R governance, no active long core execution and healthy enough SQL admission. If unstable, **do not apply**.
3. Apply guarded migration transactionally. Verify final function definition contains the new audit and grants preserved.
4. Wait for **one actual scheduled cron job 44 execution** and a new `autonomous_machine_state.updated_at`. If the refresh still fails, do not greenlight; investigate other SQL indexes and database capacity.
5. Re-run full QA and public smoke only after core health improves. Market data licensing and engine load-shed remain distinct blockers. Do not activate checkout or live trades.
