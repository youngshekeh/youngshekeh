-- V230 diagnostic worksheet. DO NOT RUN during an active database outage.
-- Only execute individual blocks after Supabase support approves a bounded probe.
-- Read-only aggregate metadata; avoid recording user queries, IPs or credentials.
-- Each section requires a working database connection and should be run once.
-- Never use pg_terminate_backend or alter cron schedules for this diagnostic.

-- A. Database connection pressure by state and wait category.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '1500ms';
SET LOCAL lock_timeout = '250ms';
SELECT state, COALESCE(wait_event_type, 'NONE') AS wait_class, COUNT(*) AS sessions
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state, wait_event_type
ORDER BY sessions DESC
LIMIT 25;
ROLLBACK;

-- B. Current cron active inventory, without exposing SQL job command contents.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '1500ms';
SET LOCAL lock_timeout = '250ms';
SELECT COUNT(*) AS total_jobs, COUNT(*) FILTER (WHERE active) AS active_jobs
FROM cron.job;
ROLLBACK;

-- C. Recent scheduler receipts by job ID, including successes and failures.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '1500ms';
SET LOCAL lock_timeout = '250ms';
SELECT jobid, status, COUNT(*) AS run_count
FROM cron.job_run_details
WHERE start_time > now() - INTERVAL '15 minutes'
GROUP BY jobid,status
ORDER BY run_count DESC
LIMIT 30;
ROLLBACK;

-- D. Confirm essential schema existence; compare with Dashboard Data API exposures.
-- This query cannot establish the actual PostgREST db_schemas settings alone.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '1500ms';
SET LOCAL lock_timeout = '250ms';
SELECT nspname AS schema_name
FROM pg_namespace
WHERE nspname IN ('public', 'auth', 'storage', 'graphql_public')
ORDER BY nspname;
ROLLBACK;
