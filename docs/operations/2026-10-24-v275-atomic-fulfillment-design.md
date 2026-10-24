# V275 · Atomic payment fulfillment candidate (DO NOT APPLY)

2026-10-24 UTC. V274 baseline: ca1d5b25e9a306df6dbef029f1b20559eba1fbef.

## Actual read-only Supabase schema finding
The existing service-role-only security-definer RPC, public.activate_subscription_from_payment, independently upserts a subscription, possibly with NULL paid period. The live v7 Flutterwave webhook inserts payment_events and marks checkout_intents paid BEFORE calling that RPC. The operations are not one atomic transaction.

Existing database indexes already enforce UNIQUE(provider, raw_payload.transaction_id) for Flutterwave, UNIQUE(provider,provider_event_key), UNIQUE(provider,provider_reference) on checkout_intents, and UNIQUE(user_id) for subscriptions. Service-role-only RPC policy and subscription customer-read RLS are present. Reuse them, do not disable/reset/duplicate.
New 20-minute log text-hit sampling still included timeout messages in PostgreSQL 24/75, PostgREST 23/117, Supavisor 16/55; these are counts of messages with a word, not percentages of requests. Occasional read-only SQL success does not establish restored uptime.

## Implementation candidate
A new ADDITIVE SQL function, public.fulfill_verified_flutterwave_checkout_v275, is drafted in docs/operations/candidates/v275-atomic-fulfillment-candidate.sql. Deliberately NOT in supabase/migrations; no production database write or invocation. The function requires the future trusted webhook to supply an externally HMAC-validated and provider-reverified transaction, exact checkout reference, same user/plan/amount/USD, active provider plan mapping, fresh verification time, and a strictly bounded provider-confirmed future term. It locks the existing checkout, checks provider customer/subscription consistency, guards the existing provider transaction and event unique keys, then writes event+paid checkout+subscription in ONE PostgreSQL transaction. Any exception rolls every write back.

A duplicate transaction can only be acknowledged without mutation if the new committed_v275 marker, same transaction and checkout identity, paid intent and nonnull subscription period all exist. The live v7 legacy events do NOT carry that marker; never auto-extend an old paid term or invent a recovery. The service_role-only grant and restricted search_path are explicit.

## Why full commercial release remains HOLD
A SQL function cannot verify external Flutterwave signatures itself. The eventual webhook must verify signed request, fetch Flutterwave transaction data directly, validate plan and term against a provider-backed invoice, then call this RPC with service_role. No such production wiring exists, and real merchant/renewal/refund/cancel provider tests are missing.
Before ANY deployment, test the SQL in a non-production rollback transaction or isolated sandbox, verify actual PostgreSQL syntax and permissions, test simultaneous same-transaction callbacks (including different event IDs), failure after event insert, idempotent retries, expired term, customer reassignment, cancellation, refunds, and onboarding; then reconcile the one historical paid checkout and four missing-term subscriptions with private per-customer evidence. Preserve legacy v7 webhook and owner access until explicitly released.

Do not apply this SQL candidate, update the live Flutterwave webhook, create charges, repair paid periods from status flags, change cron scheduling or grant real orders. V272 checkout and V273 member-session remain fail-closed; trading WAIT / 0R. This release contributes design and code coverage only, NOT commercial certification.
