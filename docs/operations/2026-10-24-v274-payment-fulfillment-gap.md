# V274 | Payment fulfillment durability and replay blocker

**Date:** 2026-10-24 UTC. **Production baseline:** V273 commit `d846acf0a3397b96c6801f0db14593d54e9e2048`.

## Actual provider observation
- Production Supabase `flutterwave-webhook` remains **ACTIVE v7**, `verify_jwt=false` because Flutterwave calls this public URL with its own HMAC or `verif-hash` signature. Live Edge SHA256 recorded by management: `0129a95daab959e5da8bd5227a1f143124199dc7e15bfe0c3ba79e53c83442fa`. This is a **code/source baseline only**, not a verified signed transaction.
- The entire (credential-free) deployed source is copied exactly to `docs/operations/evidence/v274-supabase-flutterwave-webhook-v7.txt` for versioned audit. No API keys or customer PII.
- Existing positive payment flow: independently queries Flutterwave transaction, then inserts an event (on-conflict ignore), then marks the checkout paid, then calls `activate_subscription_from_payment`. A repeated event returns `200 ok` immediately if the event insert conflicts. **If an operation after event insert fails, a replay may be acknowledged without subscription activation**. Different webhook event IDs can also map to the same provider transaction without a transaction-unique evidence gate. This is a *real code-path risk*, **not a confirmed occurrence for any customer**.
- Cancellation event branch independently writes `payment_events` then patches `subscriptions`; a failure between operations has the same non-atomic danger. Blind webhook replacement/disablement could harm existing legitimate renewals or cancellations.
- Read-only SQL snapshots found **1 payment event, 1 paid checkout intent, zero active subscriptions with a future verified paid period, and 4 `active`/`trialing` records with missing end dates**. These aggregate counts are not direct transaction-to-customer matches. The pg_get_functiondef lookup of the activation RPC timed out. The specific 1:1 fulfillment relationship is **not verified**.
- Ongoing PostgreSQL/PostgREST/Supavisor log text matches for timeout (last 20m 22/53, 11/78 and 22/53 respectively); management SQL failed in another query. No DB root cause is established.

## V274 safe changes
- Preserve the existing live webhook v7: **no deployment, webhook configuration changes, customer changes, payment replay, event insert, refund or cancellation**.
- Source-control the actual deployed handler as evidence and run a deterministic local-only replay integrity verifier. Receipt candidates must prove signed provider verification, transaction identity/parity, unique provider transaction claim, durable deduplication, **atomic event/checkout/entitlement commit**, and a freshly verified future paid term. A synthetic passing receipt produces a local-only verdict, **not commerce certification**.
- Operator CLI accepts a de-identified aggregate JSON and **prints** a fail-closed `LAUNCH_HOLD` report; never talks to the provider or DB. Do not use stale snapshots as current evidence.
- Tests prove the currently deployed handler's event-before-activation and early replay acknowledgment ordering, and reject invalid credentials, duplicate transactions, failed partial fulfillment and missing periods.

## Next critical implementation, explicitly blocked pending DB repair
1. Restore reliable Supabase SQL and inspect actual `activate_subscription_from_payment` definition and uniqueness/transaction schema.
2. Build a **single atomic database function** to claim a provider transaction exactly once, upsert event+paid checkout+entitlement in the same transaction, recover partially fulfilled legacy events without extending terms twice, and record a durable outcome. Use a transaction ID uniquely linked to provider, not only a webhook event ID.
3. Preserve signature verification and provider re-verification; for cancellations verify provider-linked subscription identity, correct plan, and durable idempotent cancellation state.
4. Only then perform actual sandbox/provider-signed webhook tests for paid, retry, duplicate different event key/same transaction, DB failure after insert, renewal, cancellation, refund, expired and owner access, plus safe ledger reconciliation and backfill approved by operator.
5. Do not deploy an unverified webhook replacement, turn on new charges, fabricate paid terms, or replay historical events. `member-session v12` and server checkout v9 stay fail-closed. No live trading or subscription unlock.

This patch is source/tests/operations only. It can pass GitHub CI and Vercel public acceptance while still accurately reporting **commercial launch on hold**.
