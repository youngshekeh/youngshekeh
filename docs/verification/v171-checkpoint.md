# V171 broker simulation receipt integrity

Applied 2026-10-01 as migration `20261001181003_v171_broker_simulation_receipt_integrity`.

The previous V134 evaluator counted lifecycle and denial labels. A mismatched order ID, a wrong idempotency key, or a fill after a denial could leave those counts intact. V171 validates the eight-event simulation receipt contract: sequence and timestamps, correlation of acknowledgements/fills to the prepared order, duplicate request linkage, risk and price fields, cross-scenario ID collisions, and the simulation/denial flags. Invalid receipts gate all six existing lab checks to false. This validates recorded simulation events; it does not implement or verify a production broker adapter.

The validator is a private, stable, invoker function with a fixed search path. Anon and authenticated execution are revoked; service_role execution remains allowed. Historical rows retain their immutable receipts. The suite seed changes to `v134-broker-adapter-lab-v2-receipt-integrity`, creating a separate run without updating prior results. The existing hourly lab job invokes the stronger evaluator on its existing schedule.

## Evidence

- 41 deterministic cases passed atomically before migration commit, including changed valid IDs/prices and damaged receipts. Tests use synthetic JSON and do not modify market observations or schedules.
- New lab run 30: 6/6 checks passed, eight simulated events, zero real orders and zero orphan events.
- Direct semantic evaluation: PASS_SIMULATION_RECEIPT_INTEGRITY, zero violations.
- Integrated V169 regression initially returned 73/74: the breakout self-test had no result. Its direct check passed; one justified full rerun returned 74/74. Root cause is unconfirmed; the initial failure is retained in v171-results.json rather than erased.
- Live Gold day-state, MTF zones, network evidence, earnings and production closure returned HTTP 200 and ok=true. The full regression also checked the official macro calendar and Capital OS surface. Some Vercel connector calls could not resolve a deployment; those connector errors are not evidence of application HTTP failures.
- Security advisor: zero ERROR and WARN notices; the existing grouped INFO notice concerns RLS tables without direct-client policies.
- Broker-lab schedule remains `17 * * * *`. No unsafe lab runs or events exist.

## Production boundary

The frontend remains on commit `a6cdf68a09ea232d597e81e21fd98d371be3235e`; V171 is live in the database through the existing Vercel/Supabase bridge. No frontend rebuild is needed for this migration. Public broker-lab output and full-engine QA continued to pass through the existing endpoint.

WAIT / 0R and live orders OFF remain enforced. Production broker readiness is NOT_TESTED. Gold uses a delayed GC futures research feed, not an execution-grade XAUUSD quote. There are 10 resolved shadow outcomes versus the 30-outcome maturity threshold, with negative observed average gross R. More samples alone do not establish an edge. Broker connection, measured spread/slippage, production reconciliation and kill-switch verification remain open gates.

## Next work and recovery

Continue with a broker quote adapter in paper mode once its data source is available, then verify measured costs and production-style reconciliation/kill-switch behavior without granting real-capital permission. Preserve the full report architecture and daily/weekly/monthly/quarterly zones. Track the intermittent breakout self-test transport failure if it recurs.

The migration is definition-guarded and intentionally refuses reapplication or drift. Apply the recovery SQL and test SQL together in one transaction. The rollback restores the prior V134 evaluator only after checking the exact V171 definition hash. The private validator can remain installed; no historical receipts need deletion. Neither direction changes cron schedules, trading policies or live order routing.
