# V278 · Atomic Flutterwave recurring renewal candidate (DO NOT APPLY)

**Date:** 2026-10-24 UTC. **Baseline:** production V277 commit `388a061810816c664fc60c19fa90e1b7387e261f`.

## Confirmed compatibility gap
Archived active Flutterwave webhook v7 has a paid-transaction fallback when no `checkout_intents` row exists. It matches a previously linked provider customer/subscription and records `recurring:!intent`. The verified V276 atomic checkout candidate, however, requires an OPEN checkout reference. Therefore, **the initial checkout function alone cannot support recurring renewals**.

V278 contributes a distinct, **isolated, non-applied** SQL candidate in `docs/operations/candidates/v278-atomic-renewal-candidate.sql`. It is NOT an auto migration. The live webhook is unchanged.

The proposed private service-role RPC matches an *existing* provider subscription ID, customer ID, authenticated user UUID and plan. It requires a fresh provider-verified successful USD receipt, exact active monthly provider-plan mapping, exact current monthly plan amount, explicit provider-confirmed cycle start/end and term continuity. It locks the existing subscription FOR UPDATE, validates old status and existing paid period, checks event-ID and transaction-ID uniqueness and writes a renewal event and new paid term in one PostgreSQL transaction. Duplicate callbacks are side-effect-free ONLY on matching new-version committed marker, signed transaction ID, amount and original cycle. Legacy records or a second different transaction for the same paid cycle need explicit manual reconciliation, never another automatic month.

## Disposable PostgreSQL integration
`.github/workflows/v278-postgres-renewal.yml` runs `scripts/v278-test-renewal-postgres.mjs` on a fresh **PostgreSQL 16** GitHub Actions service using a minimal schema fixture. The runner refuses any host other than `127.0.0.1` and any database other than `v278_isolated_test`. It tests real SQL compilation, restricted service-role grants, successful atomic renewal, same event and alternate event ID replay, mismatched amount/customer, canceled membership, injected failure after ledger insert with full transaction rollback, legacy event held, and **two distinct competing concurrent sessions** on the same subscription. Fixture identities and provider receipts are synthetic; **no real signed merchant transaction**, Supabase connection or user information is involved.

## Current outstanding limitations
- Production `billing_plan_mappings` schema compatibility is still not independently confirmed: management SQL queries timed out; live incident remains `DATABASE INCIDENT REPORTED`. Last 15-minute PostgreSQL log sample had 31 timeout text matches/82 entries, PostgREST 11/104, Supavisor 0/3. Text-hit counts do not establish independent error rates.
- SQL cannot independently attest Flutterwave HMAC signatures; a future authenticated private webhook must fetch provider transaction and authoritative billing-cycle timestamps, then call a restricted RPC. Do NOT use `now() + 1 month` or locally inferred cycle dates as provider proofs.
- Cancellation, suspension and refund handling require their own atomically tested idempotent fulfillment/reversal flows, while respecting provider terms. A paid renewal cannot silently reactivate a canceled subscription.
- Production `create-checkout v9` remains hard disabled. `member-session v12` rejects missing paid periods. The live `flutterwave-webhook v7` remains unchanged until exact schema parity, isolated restoration, signed sandbox transaction, authentication and full support for refunds/cancellation are verified.
- Verify DB backup and test restore, safe provider incident recovery, private kernel signed runs, redistributable market data rights and explicit operator sign-off.

No DB migration, webhook deployment, payment charge, customer entitlement mutation, real trading, or scheduler modifications in V278. `WAIT / 0R` remains enforced.
