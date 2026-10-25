# V311 · Provider evidence consistency guard

Date: 2026-10-25. Base: V310 production `10e3ed0d2d478cfdbd74588a6683a51d5c817311`.

## Observed issue
Supabase Pro project `mpcelmjiycjpdyyflisn`, eu-west-1, continues to report ACTIVE_HEALTHY at the management layer while runtime SQL intermittently times out. A recent bounded one-hour PostgreSQL log query returned 85 cron startup timeouts, 19 connection resets and 13 statement timeouts. These are event counts, not distinct jobs or unique user errors. Support ticket SU-523502 remains unresolved.

The V306.1 manual core-repair admission accepted a caller-declared `complete:true` log window with `sampled_events:0` and an empty startup-timeout job-ID list. This could make a provider log-export failure appear to be positive absence-of-errors evidence. It also did not check duplicate job IDs or whether the claimed number of distinct failed jobs exceeded sampled events.

## Change
The V306.1 manual recovery review gate now rejects:
- An allegedly complete log window containing zero sampled events.
- Repeated startup-timeout job identifiers.
- More distinct startup-timeout job IDs than observed events.
- Fractional, negative or otherwise invalid event counts.

A new behavioral regression test covers each case and requires `HOLD_CORE_RECOVERY`. A valid, historically used 45-event fixture remains eligible **only for human V304 review** and never authorizes a migration. This change does **not** verify that a non-empty externally supplied log export actually represents every event. A responsible operator must still validate query boundaries, source provenance and completeness.

## Production safety and release gates
No SQL, migrations, cron writes, connection changes, credentials, invoices, charges, order execution, price licensing or live trading. The code is an offline predicate used only when explicitly invoked by a future operator review. Preserve checkout false, trading WAIT / 0R and signed payment acceptance locks.

Run V306 targeted Node tests, all repository tests, Vite build, existing browser QA, the unchanged payment guard test and source audit on the exact PR commit. Merge/deploy only after checks pass and confirm the public site stays READY. **This patch does not resolve the Supabase incident or authorize commercial launch.**
