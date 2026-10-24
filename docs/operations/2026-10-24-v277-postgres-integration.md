# V277 · Disposable PostgreSQL 16 integration validation

**Date:** 2026-10-24 UTC. Baseline production V276 SHA `80126c55b47d8d2c3e2c060bf5a05bf41d159e14`.

## Why the build matters
V275/V276 established deterministic offline policy checks and isolated SQL candidate files, but **had never executed SQL against PostgreSQL**. Supabase production management read-only SQL is still intermittent, with 20-minute timeout text hits Postgres 20/47, Supavisor 13/34, PostgREST 13/37. Production Supabase currently has no test branches. No production SQL or service-role privileges should be modified speculatively.

## New independently executed test environment
GitHub Actions `.github/workflows/v277-postgres-payment-integration.yml` provisions a **new, disposable PostgreSQL 16 service** with a local-only `v277_isolated_test` database and nonproduction credentials. There is no Supabase connection, customer record, Stripe/Flutterwave provider connection, production API key, or merchant billing interaction.

The schema fixture mirrors the publicly verified column types and UNIQUE indexes for `plans`, `billing_plan_mappings`, `checkout_intents`, `payment_events`, `subscriptions`. This is a **subset schema**, not a production clone and not a full provider proof; `billing_plan_mappings.recurring` schema details were still unable to be verified in production due to intermittent SQL, so the candidate's compatibility with live mapping must be explicitly confirmed before apply.

The runner executes the exact unchanged source from `docs/operations/candidates/v276-atomic-fulfillment-candidate.sql` with `psql ON_ERROR_STOP=1`. Tests:
1. Real PostgreSQL parses/creates security-definer function and function EXECUTE grants are restricted to `service_role`, not anonymous/authenticated.
2. A simulated provider-verified receipt atomically creates an event, paid checkout and unexpired subscription.
3. Identical webhook replay and different event IDs for the same provider transaction return NOOP without extra membership extension.
4. Mismatched amount is rejected without any writes.
5. An injected trigger rejects paid-checkout update **after event insert**; PostgreSQL must roll back every related write.
6. An existing legacy partial payment event without `committed_v276` marker is held for manual reconciliation.
7. **Two independent PostgreSQL connections run concurrently** for the same customer, but different plan/reference (to respect the existing one-open-checkout-per-user-plan unique index), same paid period. Exactly one commits; the loser must raise and roll back, leaving one paid event, one paid checkout, one pending checkout and only one subscription.

Tests are sandbox-only evidence. They cannot validate a real Flutterwave HMAC or provider billing period; the function is a standalone prospective contract that relies on a trusted private webhook. No concurrent live traffic was executed. Existing payment, cancellation, refunds and customer data remain untouched.

## Operator controls
- The script **refuses to start** unless `PGHOST=127.0.0.1` and `PGDATABASE=v277_isolated_test`.
- DB password is a synthetic local CI credential, not a reusable production secret.
- V276 candidate remains under `docs/operations/candidates/` and is not auto-applied or invoked by live webhook v7.
- Future approval needs live mapping and environment schema parity, stronger provider identity verified external signatures, sandbox real-event flows, full DB backup/restore validation, two sealed kernel successes, SQL/Auth stability and explicit release permission.
- Do not treat green public CI as commercial permission; commercial launch and trading remain HOLD / `WAIT / 0R`.
