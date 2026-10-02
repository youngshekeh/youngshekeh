# V191 Material Signal Event Ledger

V191 makes the Gold engine stateful across time instead of exposing only the current snapshot.

## Capture
- A Vault-authenticated Supabase cron invokes the V191 capture worker once per minute.
- The worker consumes only the canonical V189 Trigger Watch.
- It normalizes WATCH_STATE, SIGNAL_DAY, SIGNAL_TIME, LIFECYCLE_STAGE, REVIEW_GATE, NEXT_SIGNAL_WINDOW and each V189 trigger.
- The database inserts only when a tracked state fingerprint changes. Ordinary price drift does not create event spam.

## Integrity
- The ledger is append-only; UPDATE and DELETE are blocked.
- Every inserted event points to the previous global event SHA-256.
- The read RPC verifies the full hash chain before reporting HASH_CHAIN_VERIFIED.
- Database constraints hard-lock WAIT / 0R / automatic_execution=false / live_order_submission_enabled=false.
- Historical V120-era signal rows with older capital semantics remain isolated in their legacy table and are not imported.

## Surface
The Gold Live page shows event count, chain state, chain failures, latest event time and the latest material transitions.
