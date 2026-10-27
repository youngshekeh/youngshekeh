# V317 Atomic Payment Recovery and Commercial Launch Gate

Date: 2026-10-27 UTC. Review PR #284, branch `security/v317-atomic-payment-receipts`. Project production remains V311; **this file is not a backup, approval, or deployment instruction**.

## Real problem confirmed by provider and database source review

The currently deployed `flutterwave-webhook` Edge Function v7 performs a payment-event insertion, then updates the checkout intent, and only then calls `activate_subscription_from_payment` as a separate HTTP request. That RPC is a separate `SECURITY DEFINER` subscription UPSERT. Duplicate events return success after an event-key conflict. Therefore if that RPC fails, a webhook retry may not activate the member even though the receipt is already recorded. Current V272 backend checkout activation flag is false, limiting new transaction exposure, but this is still an unacceptable prelaunch design.

Supabase read-only catalog inspection: PostgreSQL 17.6, project ACTIVE_HEALTHY, approximately 409 MB database on inspection; `payment_events` has a unique `(provider,provider_event_key)` and a separate unique Flutterwave transaction-id index, and `subscriptions` has a unique user id. No production schema modifications were made.

## V317 candidate, isolated only

- `docs/release/V317-REVIEW-ONLY-ATOMIC-FLUTTERWAVE.sql`: one restricted, service-role-only atomic payment receipt RPC that checks amount, USD, active plan, recurring association, checkout ownership and reference, and transaction-id idempotency before making payment-ledger, checkout and subscription writes within the same Postgres transaction. Old non-atomic receipts without a trustworthy commit marker are explicitly held for manual reconciliation.
- `docs/release/V317-REVIEW-ONLY-flutterwave-webhook.ts`: staged source copy, **not deployed**, whose paid path requires signed webhook and independent provider verification then calls the atomic RPC. The `V317_ATOMIC_PAYMENT_RPC_RELEASED=false` guard remains off until an approved release.
- `tests/fixtures/v317-postgres-schema.sql` and `tests/v317-atomic-payment-acceptance.sql`: ephemeral PostgreSQL 17 integration tests, including injected subscription failure and exact-payment retry without a poisoned ledger; initial charge, duplicate replay, recurring renewal, mismatched currency/amount or reference, wrong user, legacy hold, and role-permission checks.
- `tests/v317-webhook-source-contract.test.mjs` and `.github/workflows/v317-atomic-payment-ledger.yml`: independent no-secrets source contract and disposable database tests.

## Verified evidence on initial V317 code head

The initial review head `fb9cac5750256faa27c67fdda80ffc42195e089c` passed **79/79 GitHub Actions workflows**, including V240 repository regression **1,063/1,063 Node tests**, V316 browser suite, and V317 ephemeral PostgreSQL acceptance with `V317_POSTGRES_ATOMIC_PAYMENT_ACCEPTANCE_PASSED`.

Kernel independent read-only checkpoint: Supabase `HEALTHY`, consecutive failures 0, dead letters 0 and last success at 2026-10-27 03:19:44 UTC; Vercel showed matching `V180_KERNEL_HEARTBEAT_SUCCEEDED` at 03:19:44 UTC.

## Explicit unresolved prerequisites

1. **BACKUP BLOCKER.** Supabase documents daily managed Pro/Team/Enterprise backups with plan-based retention, but this project's actual scheduled backup inventory, restore point and successful **isolated** restore have NOT been verified. Before schema or webhook rollout, review actual backups in the Supabase Dashboard's Database > Backups view and perform a non-production restore rehearsal. Do not restore over the active project.
2. **WEBHOOK BLOCKER.** Existing `subscription.cancelled` handling remains non-atomic in the staged handler, and provider event ordering, refunds and chargebacks need reconciliation tests before releasing recurring memberships. V317 only fixes the successful paid path.
3. **MERCHANT BLOCKER.** No Flutterwave signed merchant sandbox event, real transaction verification, webhook redelivery, retry timing or provider-to-entitlement flow has been observed live in V317. Flutterwave's current docs require signature verification, idempotency and independent provider verification.
4. **AUTHENTICATION BLOCKER.** End-to-end consenting member login, owner AAL2 MFA, paid authorization under RLS and lifecycle expiration are not yet certified with real accounts.
5. **MARKET DATA BLOCKER.** Quote-source rights and broker-independent validation across Gold, BTC, Brent and DXY, real browser observability and hosted cache header verification remain outstanding.
6. **RELEASE BLOCKER.** Approve schema rollout in a tested staging environment, verify new RPC grants, deploy Edge handler with guard OFF first, observe merchant sandbox transactions with retry, only then explicitly review a controlled gate enabling production billing; preserve documented rollback and the existing manual payment lock.

**Immutable release policy:** V311 production remains running. Checkout remains disabled in browser and deployed backend; commercial launch HOLD. Live trading disabled, WAIT / 0R. Do not invoke this SQL against production or deploy the staged handler as part of a CI run. All source and QA examples use synthetic identities and currencies, not customer data.
