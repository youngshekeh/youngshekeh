-- V232 READ ONLY. Does not alter cron, user records, prices or trading gates.
-- Execute only when SQL reads are responsive. Save the result before any separate apply.
select jobid,jobname,schedule,active,
       md5(command) as command_fingerprint
from cron.job
where jobid in (13,16,17,21,39,95)
order by jobid;

-- The kernel seal must be verified by Postgres. A timeout is NOT a positive seal.
select public.command_kernel_seal_status() as verified_database_seal;
