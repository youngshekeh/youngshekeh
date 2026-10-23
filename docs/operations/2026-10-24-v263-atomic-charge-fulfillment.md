# V263 | Atomic provider-verified charge fulfillment

24 October 2026, Africa/Lagos. Checkout remains locked and capital remains WAIT / 0R.

## Problem and behavior

Flutterwave webhook V7 inserted a deduplicated payment event before separately marking a checkout paid and activating membership. A database failure after that insert could leave a retry returning HTTP 200 without completing fulfillment. It also calculated a new monthly term from the delivery date, which is unsafe for old payment replays.

V263 routes authenticated `charge.completed` notifications through one service-only PostgreSQL RPC. The Edge function re-verifies the exact transaction ID at Flutterwave, curates only required fields, and waits for an atomic committed receipt. Payment event, paid checkout, subscription and private receipt commit together. Their transactional email outbox writes share that transaction. A late error rolls everything back. Provider or database failures remain non-200 and retryable. A duplicate of a committed transaction returns its original receipt and timestamps without extending access or creating another receipt email.

Both existing signature modes remain mandatory: HMAC-SHA256 over exact body bytes, or the configured legacy secret hash. Invalid HMAC cannot fall back to a legacy header. Webhook deployment retains `verify_jwt=false` because provider notifications use body signature authentication. No anonymous or member role can execute the fulfillment RPC. Its public wrapper is SECURITY INVOKER; its restricted implementation and ledger are private, with an empty search path and RLS on the ledger.

The database binds the verified customer email to the checkout owner, checks transaction reference, metadata identities, active plan, currency, minimum expected amount and checkout expiration at payment time. Initial payments require one unambiguous checkout. Renewals require an exact existing provider customer and subscription ID, and matching plan. Missing provider binding is held for review. Old events without a V263 atomic receipt require explicit reconciliation and cannot automatically reactivate a historical account.

Monthly entitlement ends one calendar month after the **provider's original payment time**, preserving a later existing term for the same plan. It never adds a month starting at webhook replay time. Older renewals cannot shorten an existing term or undo a newer cancellation. Live order submission stays disabled. The RPC creates no charge and calls no provider endpoint.

## Verification

- 803/803 repository Node tests pass, including 15 V263 tests. These cover both signature modes, altered bodies, provider and database failures, incomplete receipts, pending/failed payments, lost response retries, input mismatches and header/body deadlines.
- Real PostgreSQL rollback-only acceptance passed 27 assertions plus a 12-case invalid payment matrix. It exercised the actual service-role RPC, a forced failure at the final receipt insert, complete rollback including email outbox rows, successful retry, exact duplicate reuse, amount tampering, date expiry, bound/unbound renewals, out-of-order terms and newer cancellation protection.
- The fixture member uses a fresh `.invalid` address and is never committed. Workers cannot see its uncommitted email outbox rows. Zero fixture users remain afterward. Existing payment/checkout/subscription aggregate fingerprint remains `7c611d9b4903211037b1d74828aea1f6`.
- Vite build, CI and deployment evidence are recorded in the release PR after verification.

Reproduce candidate database acceptance by generating SQL with `node scripts/v263-atomic-charge-fixture-query.mjs --candidate`. After the migration is applied, use `--deployed` to test the deployed functions. Execute the entire generated query as one request; it ends with ROLLBACK and a PII-free result. The SQL must not be split across transactions or run as fixture writes alone.

## Deployment and rollback

Apply the exact reviewed `supabase/recovery/v263-atomic-flutterwave-charge.sql` as one migration after candidate acceptance and CI pass. It adds a private ledger and two restricted functions; it performs no existing-customer DML. Deploy `supabase/functions/flutterwave-webhook/index.ts` with `charge.mjs` only after the RPC privilege and rollback-only checks pass. Compare existing V7 metadata and archived source before replacement. The complete prior entrypoint and metadata are archived alongside this release.

Re-run deployed SQL acceptance, anonymous RPC denial, unsigned webhook rejection and read-only launch/database checks. Compare billing and cron fingerprints before and after. Do not replay a historic signed event or invoke the new function with real customer transactions for acceptance.

For an emergency rollback, restore `supabase/recovery/v263-flutterwave-webhook-rollback/index.ts` with the recorded JWT setting, then run `v263-atomic-charge-disable.sql`. Preserve the new ledger and all receipts; do not delete billing history. The old handler's dedupe weakness remains a known reason to keep checkout locked.

## Independent launch holds

This release fixes the charge commit/retry path. It does not certify a real provider transaction, current paid entitlement, member sign-in or licensed broker quote. Provider test-mode acceptance must still demonstrate initial payment, failed payment, renewal, cancellation and refund with actual response shapes. Renewal verification must supply the exact provider subscription binding; missing IDs remain held. The pre-existing subscription cancellation notification branch is unchanged and still requires separate provider reconciliation/order testing. Refund and cancellation acceptance are not implied by charge atomicity.

`CHECKOUT_SERVER_GUARD_DEPLOYED=false` remains in the frontend. No checkout link is created, no live charge is initiated, no historical membership is extended, and no live trading is enabled by release verification. No cron definition, existing RLS policy, activation RPC or ownership is changed.

References reviewed: [Flutterwave webhooks](https://developer.flutterwave.com/docs/webhooks), [transaction verification](https://developer.flutterwave.com/docs/transaction-verification), [payment plans](https://developer.flutterwave.com/docs/payment-plans-1), [Supabase functions](https://supabase.com/docs/guides/database/functions). The new behavior applies the provider's server verification and idempotency requirements; it does not claim external provider acceptance.
