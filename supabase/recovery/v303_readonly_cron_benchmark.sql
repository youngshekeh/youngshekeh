-- V303 independently live-verified at 2026-10-25 11:13 UTC, READ-ONLY.
-- The 1025-row index probe had plan cost 162.3 versus 21,112.51 sequential scan.
-- Estimated planner work is not a measured runtime speed-up.
with recent as materialized (
  select runid,start_time,status
  from cron.job_run_details
  order by runid desc limit 1025
), boundary as (
  select start_time from recent order by runid asc limit 1
)
select now() checked_at,
  (select count(*) from recent) scanned,
  (select start_time from boundary) boundary_time,
  (select count(*)::int from recent
    where start_time >= now()-interval '2 hours'
      and status not in ('succeeded','running')) failures_2h,
  ((select count(*) from recent)=1025
    and (select start_time from boundary)<now()-interval '2 hours')
      complete_coverage;
