-- Disable owner ingestion while retaining append-only receipts and public status.
-- No trading controls, canonical quotes, historical evidence or schedules change.
revoke execute on function public.ingest_v172_gold_paper_quote(uuid,jsonb) from service_role;
revoke insert on table public.gold_paper_broker_quotes from service_role;
