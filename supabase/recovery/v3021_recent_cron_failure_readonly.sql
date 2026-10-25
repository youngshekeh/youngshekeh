-- V302.1 READ-ONLY bounded pg_cron failure observation. DO NOT mutate cron or machine state.
-- Leverages the existing runid primary index instead of an unauthorised extension index.
-- A valid count is disclosed only when runid boundary precedes the entire 2-hour window.
WITH high AS MATERIALIZED (
 SELECT max(runid) AS maxid FROM cron.job_run_details
), boundary AS MATERIALIZED (
 SELECT h.maxid, d.runid as boundary_runid,d.start_time as boundary_start
 FROM high h
 LEFT JOIN LATERAL (
  SELECT runid,start_time FROM cron.job_run_details
  WHERE runid <= h.maxid - 1024 ORDER BY runid DESC LIMIT 1
 ) d ON true
), recent AS MATERIALIZED (
 SELECT count(*) FILTER(
  WHERE start_time >= now() - interval '2 hours'
    AND status NOT IN ('succeeded','running')
 )::integer AS failed_2h,
 count(*)::integer AS inspected_runs
 FROM cron.job_run_details
 WHERE runid > (SELECT maxid - 1024 FROM high)
)
SELECT now() checked_at, boundary.boundary_runid,
 boundary.boundary_start,
 recent.inspected_runs,
 (boundary.boundary_start < now() - interval '2 hours') AS complete_2h_coverage,
 CASE WHEN boundary.boundary_start < now() - interval '2 hours'
   THEN recent.failed_2h ELSE NULL END AS verified_failed_2h,
 CASE WHEN boundary.boundary_start < now() - interval '2 hours'
   THEN 'COUNT_VERIFIED' ELSE 'HOLD_INCOMPLETE_AUDIT' END AS audit_state,
 'WAIT' action_permitted,'0R' capital_permission
FROM boundary CROSS JOIN recent;
