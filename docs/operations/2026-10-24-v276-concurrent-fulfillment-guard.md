# V276 · Concurrent payment entitlement race prevention

**Date:** 2026-10-24 UTC. **Baseline:** V275 production commit b0e3abaf0666a751e8b09ace0c321fe74c89ff29.

## CRITICAL: V275 prospective write-race found
The V275 isolated candidate first SELECTs a subscription `FOR UPDATE`. If a customer has **no existing row**, two concurrent *different signed provider transactions* can both see no row. Each can then reach `INSERT ... ON CONFLICT(user_id) DO UPDATE`; an unconditional conflict UPDATE may overwrite the first paid interval with the second, including a duplicated identical end period. Both events could be marked fulfilled even though two payments purchased only one term. This is a **design-level concurrency risk**, not evidence that any actual customer suffered such an incident. The V275 candidate was never applied.

PostgreSQL's documented `ON CONFLICT DO UPDATE ... WHERE` predicate is evaluated on the conflicting row at the point of the update, including when a different transaction inserted the row during the first attempt. `RETURNING` has no row when the WHERE predicate refuses update (docs: https://www.postgresql.org/docs/18/sql-insert.html).

## V276 hardened, isolated candidate. DO NOT APPLY.
- New `docs/operations/candidates/v276-atomic-fulfillment-candidate.sql` is **not** in `supabase/migrations`; it is a replacement *candidate* with new, unused function name `fulfill_verified_flutterwave_checkout_v276`. No code path or merchant calls it.
- The `ON CONFLICT(user_id) DO UPDATE` clause now includes `WHERE` with trusted provider, existing customer ID and subscription ID continuity, plus STRICT monotonic paid period (`excluded.current_period_end > existing.current_period_end` unless missing). A concurrent transaction with the same term or mismatched ownership gets no `RETURNING` row, raises and **rolls back** payment_events and checkout_intents mutations in the same prospective database transaction.
- A rejected, genuinely provider-paid second transaction needs controlled human reconciliation. Never acknowledge as fulfilled, skip or grant a free second month without provider-based evidence.
- The `committed_v276` event marker includes the paid period, which replay checks against provider term, original amount/currency and a matching fully paid checkout. A reused event key pointing to a different transaction is rejected.
- Simulated pure-policy tests check 2 concurrent payments, conflicting ownership, repeated period, future legitimate term, replay/amount parity and restricted service_role. **CI tests are not actual concurrent PostgreSQL sessions or signed Flutterwave integration tests.**

## Current provider status
One read-only Supabase SELECT succeeded at 2026-10-24 08:34 UTC: 16 pg_stat_activity sessions, 58 active cron jobs. Recent 20-minute message-text timeout hits: PostgreSQL 30/73, PostgREST 16/107, Supavisor 10/45. Counts of log messages, not request error rates. Intermittent database/AUTH data-plane issue remains. No support ticket was filed by this release.

## Must happen before ANY live payment release
1. Stable Supabase SQL and Auth under sustained load; verify reliable backups and tested restore. Do not disable 58 production scheduler jobs speculatively.
2. Use isolated PostgreSQL test branch/sandbox with reviewed transaction and rollback tests, deadlock/timeout injection and TWO independent concurrent sessions, including missing prior member row, same period, different transaction IDs and same transaction replay.
3. Verify exact provider HMAC and server-side transaction requery, provider billing-cycle end and unique event+transaction, then use a privileged private Edge webhook to invoke one atomic service-role-only RPC. Test renewal, cancellation, refund, stale paid periods and existing partial v7 events with explicit operator reconciliation.
4. Verify end-to-end signed-in member/owner authorization, external data redistribution rights and two actual sealed private-kernel successes. New charges, trading and full commercial readiness remain OFF.

No production database migration, webhook replacement, subscription mutations, new charges or real-money orders in V276. Public research stays independently live. Risk engine remains `WAIT / 0R`.
