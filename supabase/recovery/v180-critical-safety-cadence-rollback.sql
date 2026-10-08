-- Rollback V180 critical safety recovery cadence
select cron.alter_job(22, schedule := '0-59/5 * * * *');
select cron.alter_job(23, schedule := '1-59/5 * * * *');
select cron.alter_job(24, schedule := '1-59/2 * * * *');
select cron.alter_job(61, schedule := '0-59/2 * * * *');
select cron.alter_job(62, schedule := '1-59/2 * * * *');
select cron.alter_job(68, schedule := '1-59/3 * * * *');
select cron.alter_job(78, schedule := '0-59/2 * * * *');
select cron.alter_job(79, schedule := '1-59/2 * * * *');
select cron.alter_job(81, schedule := '0-59/2 * * * *');
select cron.alter_job(95, schedule := '3-59/5 * * * *');
select cron.alter_job(50, schedule := '4-59/5 * * * *');
