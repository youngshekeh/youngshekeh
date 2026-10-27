-- V321 isolated fixture. Never apply to production.
CREATE SCHEMA cron;
CREATE TABLE cron.job(
  jobid bigint PRIMARY KEY,
  jobname text NOT NULL UNIQUE,
  schedule text,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE cron.job_run_details(
  runid bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  jobid bigint NOT NULL REFERENCES cron.job(jobid),
  status text NOT NULL,
  start_time timestamptz,
  end_time timestamptz,
  return_message text
);
CREATE TABLE public.agent_runs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type text NOT NULL,
  status text NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  error text
);
