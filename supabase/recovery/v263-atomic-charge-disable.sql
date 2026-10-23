-- Emergency disable AFTER restoring the exact archived webhook entrypoint.
-- Preserve ledger and receipts for reconciliation; never delete paid history.
-- Checkout must remain hard locked. The archived V7 charge handler has the
-- documented pre-activation dedupe weakness, so restore only for rollback.
begin;
set local lock_timeout='3s';
revoke execute on function public.fulfill_flutterwave_charge(jsonb,text) from service_role;
revoke execute on function private.fulfill_flutterwave_charge(jsonb,text) from service_role;
commit;
