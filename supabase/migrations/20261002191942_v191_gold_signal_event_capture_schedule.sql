
select cron.schedule(
  'tfa-v191-gold-signal-event-capture',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v191-gold-signal-event-capture',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-tfa-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='tfa_ingestion_cron_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
