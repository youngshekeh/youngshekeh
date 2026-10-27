# V319 · Signed webhook delivery, response semantics and payment reconciliation

**Date:** 27 October 2026 UTC. **Draft review:** GitHub PR #286, branch `security/v319-webhook-runtime-ack-safety`. **Production:** V311 unchanged.

## Production problem and provider contract

Flutterwave's v3 webhook documentation states that HTTP **200** acknowledges receipt; non-200 counts as a failed delivery, and users should enable retries. Current documented reliability recommendations require authenticating signatures, independently checking payment status, amount, currency, transaction reference, and idempotency. A separate periodic reconciliation process is advised for failed or missed webhook deliveries. Sources:
- https://developer.flutterwave.com/docs/webhooks
- https://developer.flutterwave.com/v4.0/docs/webhooks
- https://developer.flutterwave.com/reference/get-all-subscriptions

The staged V318 webhook previously returned HTTP 200 on missing transaction IDs, failed provider verification, lack of a local payment intent/subscription, price mismatch or missing plan mapping. Those responses could incorrectly acknowledge unresolved *successful* payments. The issue has been corrected **in review source only**.

## V319 controls

- Only `charge.completed` enters paid-entitlement processing. An envelope-level `payload.id` never stands in for the provider transaction ID at `payload.data.id`.
- Validate both `flutterwave-signature` HMAC over exact raw request body (v4 docs) and legacy `verif-hash` (v3). Invalid signatures return 401 before any provider/DB access.
- Independently verify provider transaction over HTTPS; check verified transaction ID, `status`, local identity, plan mapping, amount and currency before the single atomic V317 RPC.
- Return 503 for missing/unmatched or pending payment evidence, 500 for provider failure or DB activation failure. **Do not acknowledge unresolved paid receipts**. Provider-confirmed failed transactions can be acknowledged without granting entitlement; unrelated non-charge events are expressly ignored.
- Cancellation remains separate and hard-sealed. Provider lookup and V318 atomic cancellation RPC require exact matching subscription, customer, plan and current provider cancellation state; missing identity holds 503.
- **No unlock:** `V317_ATOMIC_PAYMENT_RPC_RELEASED=false`; `V318_ATOMIC_CANCELLATION_RPC_RELEASED=false`; deployed `create-checkout` v9 still `V272_CHARGES_ENABLED=false`; browser checkout hard seal still false. No merchant API calls in CI.

## Verification architecture

- `tests/v319-webhook-runtime.test.mjs`: fifteen isolated HTTP-handler scenarios executing the **actual staged TypeScript Deno.serve function** in a Node 24 VM, after stripping TypeScript annotations, with synthetic HMAC/legacy signature generation, fake provider response routes and fake SQL RPCs. No network, real user data or private provider credentials.
- `.github/workflows/v317-atomic-payment-ledger.yml`: runs V317 payment and V318 cancellation atomic PostgreSQL 17 integration suites plus V319 HTTP runtime scenarios. Production is neither touched nor used as a test database.
- `tests/v317-webhook-source-contract.test.mjs` and `tests/v318-cancellation-contract.test.mjs` continue to enforce source safety invariants, with the strict V319 paid-event boundary as the parser delimiter.

Test matrix includes false signature (HMAC and legacy); wrong method; supported and unsupported signed events; missing/wrong transaction ID; provider HTTP failure, malformed body or mismatched transaction; confirmed failed versus unsettled payment; orphan successful payment; wrong amount/currency/mapping; successful single RPC commit and duplicate replay; failure of atomic DB RPC; disabled cancellation; ambiguous cancellation; provider-confirmed cancellation; wrong provider cancellation record and cancellation RPC failure.

**Important limitation:** HTTP behavior tests use mocked provider and database services. They do not prove real merchant sandbox event delivery, merchant retry policy, externally reachable endpoint URL or authenticated user entitlements.

## Remaining launch gates

1. Project-specific Supabase **managed-backup inventory** and a real **isolated restore rehearsal** (production restore is prohibited as a test). General Pro backup policy does not verify project restore points; Storage API objects are not in DB backups.
2. Flutterwave merchant sandbox for signed v3/v4 event shape, purchase, duplicate delivery, cancellation, retry/reconciliation and webhook registration. Chargeback, refunds, reversals, partial payments and later provider amendments need separate explicit policy and tests.
3. Durable **private reconciliation queue** for paid events held at HTTP 503, since provider retries have limits. This is an operational necessity, not completed by this change.
4. Real consenting member and owner MFA AAL2 tests, entitlements under RLS, expiry and revoked access. Synthetic browser tests alone do not certify production Auth.
5. Gold, Brent/Oil, Bitcoin and DXY feed licensing, timestamp freshness, monitored source provenance and genuinely hosted browser/header QA.
6. Staged migrations with documented order and rollback; deploy reviewed payment functions with guards OFF first. Commerce launch requires formal approval after evidence.

**No production mutation.** Production V311 remains installed, commercial activation HOLD, checkout OFF, live trading OFF, action WAIT and capital permission 0R. Do not treat a passing V319 test suite as permission to collect money.
