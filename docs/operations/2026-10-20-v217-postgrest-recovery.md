# V217 | PostgREST Recovery & Provider Support Pack

Evidence: 2026-10-20 19:37 UTC. Historical frozen evidence, NOT a live health report.

## Verified symptoms
- PostgREST 14.5 repeatedly returns PGRST002 while PostgreSQL reports SQLSTATE 57014 timeout rebuilding schema cache for public,graphql_public, with public,extensions extra path.
- The schemas were independently verified as existing. A missing schema is not a demonstrated explanation.
- PostgreSQL records pg_cron job startup timeouts, including jobs 33 and 61 at 19:13 UTC; 58 active configured jobs. Enabling a scheduler does not prove jobs execute.
- Management SQL sometimes fails with connection timeout. Prior authenticator statement_timeout was 25 seconds.
- pg_stat_statements cumulatively reported hundreds of thousands of cron history writes and large Gold/state processing time. Cumulative work is NOT proof of the live bottleneck.
- Last verified successful kernel receipt was 2026-10-20 08:20:24 UTC; at 19:35 it still failed KERNEL_SEAL.
- Performance advisor notes 46 unindexed foreign keys and 153 unused indexes. Do not add or drop indexes based solely on those counts.

## Support request to Supabase
Project mpcelmjiycjpdyyflisn; region eu-west-1. Open authenticated Supabase support for this existing paid project.

Subject: PGRST002 / 57014 persistent schema-cache rebuild timeout, management SQL and pg_cron startup failures

Please investigate repeated PostgREST schema-introspection timeouts with public and graphql_public present, 25s authenticator timeout, sporadic management SQL connection timeout, and repeated pg_cron job startup failures. Check catalog/query plans, DB CPU/IO, autovacuum, locks, worker contention, memory and Supavisor/PostgREST connection health, and advise an appropriate managed recovery. We need to retain our 58 job definitions, existing Auth/RLS, customer records, billing history, and WAIT/0R risk firewall. Please advise whether scoped PostgREST service recovery, role statement-timeout adjustment, or more compute is justified based on logs, not assumptions.

Attach the generated redacted incident summary, not raw logs or credentials:
  node scripts/v217-db-incident.mjs docs/operations/evidence/v217-20261020-redacted-snapshot.json /tmp/tfa-incident
Expected exit code 1: historical incident evidence is a LAUNCH HOLD. The output directory contains support-summary.md and launch-verdict.json.

## Read-only SQL, one probe at a time

Session pressure:
  select application_name,state,wait_event_type,wait_event,count(*) sessions from pg_stat_activity where datname=current_database() group by 1,2,3,4 order by sessions desc limit 25;

Cron run results:
  select status,count(*) n from cron.job_run_details where start_time>now()-interval '20 minutes' group by status order by n desc;

Cron configuration:
  select current_setting('cron.launch_active_jobs',true) enabled,count(*) filter(where active) active_jobs from cron.job;

Cumulative workload, not root-cause proof:
  select calls,round(total_exec_time::numeric) cumulative_ms,round(mean_exec_time::numeric,1) avg_ms,left(query,120) sql from pg_stat_statements order by total_exec_time desc limit 12;

Latest real kernel success:
  select max(finished_at) latest_good_kernel from public.command_ops_kernel_runs where status='SUCCEEDED';

Do not issue ALTER SYSTEM, VACUUM FULL, global cron disable, bulk DDL, index deletion or relaxed RLS during the incident.

## Recovery acceptance
V217 independently requires fresh management SQL success, PostgREST schema cache availability, zero recent incident error codes, 58 jobs enabled with zero recent startup failures, two distinct recent healthy completed sealed kernel receipts (WAIT/0R), plus signed payment webhook and entitlement verification.
All positive inputs yield READY_FOR_OPERATOR_FINAL_QA, NOT automatic paid checkout unlock. Human review remains required.

No database changes, cron scheduling changes, Edge function replacements, customer exports or live trades are made by V217. Undo via a CI-reviewed revert; GitHub production source continuity vault continues taking snapshots.