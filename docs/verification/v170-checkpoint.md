# V170 network evidence freshness

Verified 2026-10-01. Production frontend remains on its existing release; this change is a live database update used by the existing Vercel/Supabase bridge.

## Problem and change

The public V150 RPC still computed the full scheduler evidence graph even though V168.5 had introduced a scheduled snapshot for internal consumers. A baseline public request took 15.409 seconds. The internal snapshot reader also retained cleared candidate flags after cache expiry, allowing downstream V151 to treat stale measurements as reviewable evidence.

Both readers now share one bounded snapshot path. Reads inspect the small job configuration table, without scanning run history or refreshing the cache. Evidence expires using the older of the measurement and cache-write timestamps. A candidate loses clearance when its receipt becomes too old, its schedule changes, its job is disabled or absent, its current upstream dependency verdict is blocked, or its evidence is invalid. Protected workflows stay blocked. Historical measurements and the scheduled refresh remain intact.

This change does not alter trading policies, job schedules, paper decisions, historical outcomes, or broker controls. WAIT / 0R and live orders OFF remain enforced. Public RPC execution is still limited to service_role; the private evaluator is not publicly executable.

## Validation

- Applied migration `20261001165418_v170_bounded_network_evidence_freshness` with 20 deterministic SQL cases in the same transaction. All passed before commit.
- Full V169 integrated runtime regression: **74/74 passed**. This is functional validation, not evidence of trading profitability.
- Nine live endpoint checks: **9/9 HTTP 200 with ok=true**, including V150, V147, V148, V159, V165, production closure, Gold day-state, official macro calendar, and earnings.
- V150 database read: **27.541 ms**. Observed public request: **8.084 s**, versus **15.409 s** before the fix. Single request samples include network/authentication overhead and do not establish a latency SLA.
- Cache refresh count remained unchanged by the reads. Three latest adaptive-paper scheduled runs succeeded in approximately 289–342 ms.
- The paper decision table had no live-enabled, live-order-eligible, or future-performance-used rows.
- Security advisor: zero ERROR/WARN findings. The 130 INFO findings concern RLS-enabled tables without direct-client policies; this change did not add policies or expand access.

Results are recorded in `v170-results.json`. SQL tests use synthetic JSON and never alter live cache rows or job schedules.

## Remaining gates

The production closure endpoint reports research and paper operation ready, with live execution locked. The current market source is delayed, a production broker is not connected, spread/slippage and broker reconciliation are not verified, and the research sample is below the 30-outcome maturity threshold. The observed 10-outcome shadow sample had negative average gross R; passing infrastructure tests does not establish a profitable strategy. Scheduler changes also remain subject to their existing review gate.

Continue with evidence collection and explicit broker-simulation verification. Do not promote a policy or enable real orders based on this patch or on functional QA results.

## Applying and maintaining

Apply `supabase/recovery/v170-network-evidence-freshness.sql` followed by `supabase/tests/v170-network-evidence-freshness.sql` atomically. The migration checks the exact pre-change function definitions, so it intentionally refuses reapplication or concurrent drift. Inspect the database before any further migration. The prerequisite is the existing V168.5 scheduled cache refresh; empty or expired snapshots return fail-closed responses without a synchronous fallback.
