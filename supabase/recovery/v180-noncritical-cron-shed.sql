-- V180 noncritical pg_cron incident shed
-- Temporary. Preserves all critical state, capital-permission, Gold Desk,
-- transition-detector, and execution-firewall lanes.
-- WAIT / 0R remains authoritative.

select cron.alter_job(jobid, active := false)
from unnest(array[
  45,46,47,49,52,53,54,55,56,57,
  63,64,65,66,69,70,71,72,74,76,
  80,82,83,84,85,86,87,89,90,92,
  94,96,98,99,100,101,102
]::bigint[]) as t(jobid);
