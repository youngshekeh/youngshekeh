-- V180 critical safety recovery cadence
select cron.alter_job(22, schedule := '0-59/10 * * * *');
select cron.alter_job(23, schedule := '1-59/10 * * * *');
select cron.alter_job(24, schedule := '2-59/10 * * * *');
select cron.alter_job(61, schedule := '3-59/10 * * * *');
select cron.alter_job(62, schedule := '4-59/10 * * * *');
select cron.alter_job(68, schedule := '5-59/10 * * * *');
select cron.alter_job(78, schedule := '6-59/10 * * * *');
select cron.alter_job(79, schedule := '7-59/10 * * * *');
select cron.alter_job(81, schedule := '8-59/10 * * * *');
select cron.alter_job(95, schedule := '9-59/10 * * * *');
select cron.alter_job(50, schedule := '14-59/15 * * * *');
