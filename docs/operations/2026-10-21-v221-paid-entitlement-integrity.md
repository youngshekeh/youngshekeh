# THE FATHER ANALYTICS V221 | Signed Payment to Active Entitlement Audit

**Compiled:** 21 October 2026, Africa/Lagos (evidence through 20 October 23:29 UTC). **No money movement.**

## Verified payment history, aggregate only

Read-only PostgreSQL confirms one Flutterwave successful payment on 13 September 2026 with a matching `paid` checkout intent. One paid Pro membership currently has `past_due` status and recorded period-end date **13 October 2026**. There are **zero active current subscriptions**. The payment and paid checkout correlate by user, plan and provider transaction reference. This is consistent with **natural expiry**, not evidence that original September entitlement activation failed. Don't edit or extend this existing account without a new verified paid renewal. Raw user IDs, email addresses, references, bank records and webhook bodies were not exported.

The privileged PostgreSQL `public.activate_subscription_from_payment(...)` procedure is already correctly restricted: `anon` and `authenticated` cannot execute, `service_role` can. RLS is enabled for payment_events, checkout_intents and subscriptions. No permission/role change is needed.

## A latent webhook failure mode, NOT a proven historical failure

Deployed `flutterwave-webhook` version 7 verifies signature (HMAC-SHA256 or verif-hash) and rechecks the transaction at Flutterwave. However, on success it inserts `payment_events` with a unique provider event key and returns HTTP 200 immediately on duplicate **before** it marks the paid checkout and calls `activate_subscription_from_payment`. If an exception occurs after the event insertion but before the subscription activation, webhook replay sees the existing event and can acknowledge without finishing fulfilment. This is a **potential failure path** to address before a new paid-customer production launch; the September 2026 record does not establish that it occurred.

Never "repair" this by blindly running the activation RPC, replaying an old signed event or extending `current_period_end` from today's date. That could grant free extra service. The durable remediation should atomically join (a) deduplication, (b) paid checkout ledger, (c) provider-rechecked transaction details, (d) date-bounded subscription state and (e) committed fulfilment receipt in one transaction. A future separate reviewed Supabase migration and Edge function revision should be tested against duplicate, out-of-order and failed webhook deliveries before deployment. Payment verification must validate status, exact transaction reference, customer/plan, currency and amount, consistent with Flutterwave's webhook and transaction verification documentation.

## What V221 actually ships

- `src/billing-entitlement-audit.mjs`: read-only local verdict, refuses to treat historical paid checkout as proof of current active membership.
- `src/billing-entitlement-audit.mjs` also defines `certifyFulfillmentReceipt`, a **pure** evidence contract for a new successful transaction with a confirmed atomic event+checkout+subscription receipt, non-expired membership and no replay. It does **not** process webhook calls or activate anything.
- `scripts/v221-billing-audit.mjs`: generates a text/JSON operator audit from **aggregate PII-free inputs**. Historical snapshot stays explicitly historical. Run:
  `node scripts/v221-billing-audit.mjs docs/operations/evidence/v221-billing-audit-20261020.json /tmp/tfa-billing-audit`
  Exit code 1 means launch held by the observed expired entitlement.
- `status/index.html`: explains why historical payments and past-due membership do not establish current paid access, links to the independently live public research proposal service.
- `tests/v221-billing-entitlement-audit.test.mjs` and CI cover expired history, unsigned/mismatched provider evidence, partial transaction commit, duplicate events, missing entitlement, stale evidence and prohibition of automatic payment/access changes.

## Independent remaining launch requirements

1. **Secure webhook transactionality**: add and validate an atomic provider-verified fulfilment RPC and idempotent retry semantics in a reviewed database migration, retaining RLS and service-role-only EXECUTE. Ensure successful first delivery, duplicate and out-of-order renewal/cancellation are safe. No customer record modifications without approved runbook.
2. **Controlled provider flow**: deliberate small authorized charge in Flutterwave **test mode first**, verify signature+provider reconciliation, paid checkout, active membership, member login/access, failed payment, renewal, cancellation and refund tests. Live-money production charge requires separate explicit approval.
3. **Reviewed create-checkout Edge deployment**: production is currently version 8. Existing frontend checkout remains hard locked with `CHECKOUT_SERVER_GUARD_DEPLOYED=false` because newer server-side launch acceptance has not been deployed/verified.
4. **Full platform evidence**: provider rate-limit state remains externally unverified, PostgREST 57014 timeouts intermittently persist, research data freshness and authenticated browser QA must pass.

No provider payment calls, retry triggers, customer exports, DB writes, migrations, function replacement or entitlement grants are performed by V221. **Capital permission remains WAIT / 0R**. Keep release archives and record source checksum. Provider best practices: https://developer.flutterwave.com/docs/webhooks and https://developer.flutterwave.com/docs/transaction-verification .
