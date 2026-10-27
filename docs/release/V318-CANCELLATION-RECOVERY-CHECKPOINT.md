# V318 · Cancellation Consistency and Billing Lifecycle Checkpoint

**Date:** October 27, 2026 (UTC). **Review branch:** `security/v318-cancellation-consistency`. **Draft PR:** #285. This is source-only, with isolated PostgreSQL integration tests. **Production remains V311** until all commercial gates are independently certified.

## Why this release is needed

The deployed Flutterwave webhook v7 and cumulative V317 candidate handle `subscription.cancelled` by first writing a payment event and then separately updating subscription status. If the second operation fails, a later duplicate can be falsely acknowledged without the intended cancellation.

Flutterwave's documented sample `subscription.cancelled` event can contain customer email and payment-plan metadata but *no provider subscription ID or customer ID*. Email+plan matching is ambiguous and must never decide which subscription to cancel. Official Flutterwave subscription listing (v3 `GET /subscriptions`, `status=cancelled`) exposes subscription/customer/plan IDs, and its webhook documentation requires signature verification, idempotency and independent provider checks.

Sources: https://developer.flutterwave.com/docs/webhooks , https://developer.flutterwave.com/reference/get-all-subscriptions , https://developer.flutterwave.com/docs/payment-plans-1

## Code saved in review branch

- `docs/release/V318-REVIEW-ONLY-ATOMIC-CANCELLATIONS.sql`: transactional cancellation commit RPC. It verifies exact provider subscription ID, customer ID, payment-plan mapping and **current cancelled provider status supplied only after server verification**. A per-user advisory transaction lock and row lock serialize with the V317 renewal routine. Cancellation event and subscription status commit atomically. Already paid `current_period_end` does **not change**. Repeated event keys are idempotent; replay after a new renewal enters manual reconciliation rather than revoking access.
- `docs/release/V317-REVIEW-ONLY-flutterwave-webhook.ts`: staged source candidate. It adds `V318_ATOMIC_CANCELLATION_RPC_RELEASED=false`. On future explicit release, ambiguous cancellation payloads receive HTTP 503 for reconciliation rather than guessed identity matches or silent acknowledgement. Bounded provider verification must find the exact subscription, customer, plan and cancelled state before calling the restricted DB RPC. The V317 paid flow is still separately disabled by `V317_ATOMIC_PAYMENT_RPC_RELEASED=false`.
- `tests/v318-cancellation-acceptance.sql`: disposable PostgreSQL 17 acceptance tests: paid-term preservation, same-event replay, subscription reactivation by a valid later paid transaction, rejection of an older cancellation after renewal, distinct new cancellation, wrong plan/customer/status, forced database trigger failure and rollback, safe retry, anonymous/authenticated-role denial.
- `tests/v318-cancellation-contract.test.mjs`: source contract that prevents unreviewed activation, email-based match, separate ledger writes and unexpected period adjustment.
- `.github/workflows/v317-atomic-payment-ledger.yml`: expanded isolated PostgreSQL integration CI (V317 paid and V318 cancellation atomicity).

## Safety and open gates

This is a **review-only** candidate. It has not been deployed to Supabase, Vercel, or the merchant provider. No production SQL, altered subscriptions, checkout changes, webhook POSTs, live orders or charges occurred.

Still required before a controlled commercial rollout:

1. **Real Flutterwave provider-sandbox events and subscription listing:** whether actual cancellation notices include IDs, pagination beyond the first three pages, provider status propagation delays and safe durable reconciliation must be verified with the merchant. Incomplete events deliberately stay on HOLD. Do not treat 503 as a complete reconciliation system.
2. **Refund/chargeback and out-of-order lifecycle:** these paths remain not certified. A provider refund is not equivalent to cancellation and must be handled separately.
3. **Production backup inventory and isolated restoration:** Supabase's generic backup retention guidance does not prove current instance backups or restore success. Verify available snapshot, recovery-point age and separately restored database (including Storage API objects) before migrations.
4. **Real member and owner acceptance:** test consenting authenticated members, owner MFA/AAL2, RLS and current paid terms in staging. Chromium CI uses synthetic credentials.
5. **Source licensing/freshness and production user experience:** validate Gold, Bitcoin, Oil and DXY provider agreements, market timestamp freshness, actual hosted Cache-Control policy and release-rollback behavior.
6. **V317+V318 combined launch sequencing:** approve DB scripts in isolated staging, execute transactional tests against matching schema, deploy both staged Edge routes with payment/cancellation guards still OFF, run signed merchant sandbox verification and clear each commercial launch gate before controlled activation.

**Immutable production controls:** Production V311 READY; checkout OFF; commercial HOLD; automated trading OFF; action WAIT; capital permission 0R. No real customer emails, private keys, membership tokens or payment bodies are committed to this repository.
