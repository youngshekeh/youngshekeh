# V241 · Research recovery and Gold workspace

Base: V240 `be593d170b53c3c12dbfeccd4a32a5df4afcf5fb`.

## Observed problems

Gold Live starts 14 polling loops, a ten-request core refresh and a 41-task
diagnostics sweep. These formerly had no shared page-wide admission boundary.
During service failure, repeated requests could amplify existing provider load.

The 11:00–12:00 UTC log query on 22 October returned connection-failure SQLSTATE
08006 records, cancelled-query SQLSTATE 57014 records from pg_cron, management,
Supavisor authentication and exporter clients. Vercel heartbeat errors still
reported KERNEL_SEAL and DATABASE_SEAL_TRANSPORT_TIMEOUT. This confirms connection
and query failures; it does not prove the compute, memory or network root cause.
No database restart, resource purchase, cron mutation or credentials change was
performed. The available connected operations do not expose a database restart.

Browser inspection also showed false empty-state claims when sources failed:
no blockers, zero events, no activation stall, and satisfied review requirements.
Missing Q4 values could be coerced to zero and missing source timestamps could
qualify as synchronized. The broker ticker did not independently expire its
display while the next network request stalled.

## Change

Public research surfaces and the broker readiness widget share one transport:
three maximum active reads, a reserved slot for price/core requests, bounded
waiting, same-URL coalescing and no completed-success cache. Three transport or
backend failures stop queued work. Recovery uses one probe after 30 seconds,
with 60/120-second backoff if it still fails. Hidden pages abort and drain their
work. Endpoint authorization failures remain local. Caller cancellation cannot
cancel another subscriber to the same request. Body reads have a deadline too.
The Gold/BTC public reference observer is independent and continues using its
existing timestamp validation and expiry.

The Gold workspace groups 51 existing sections into Overview, Signals & zones,
Evidence & learning, Broker data, and Operations. It moves existing nodes rather
than cloning or discarding content. It supports mouse/keyboard tabs and existing
deep links; all 936 original IDs are preserved. Visible engine headings use
plain names. Countdown changes do not repeatedly announce through aria-live.

Fourteen current Gold renderers now withhold unavailable evidence and clear
former successful values. In particular, source failure cannot become zero
events, no blockers, completed activation or satisfied review. Q4 prices require
positive numeric values and explicit market observation times; bundle generation
time remains separate. Missing/future/stale observations cannot synchronize the
research state. Broker tick displays require a fresh ordered bid/mid/ask and
expire after five seconds, independently of stalled network requests. Both
supported broker status shapes use the same checks.

## Validation and limits

Validation includes complete repository regression, the production build,
stress tests with 54 queued diagnostics, body/transport deadlines, subscriber
cancellation, hidden-page recovery, Q4 null/timestamp cases and actual-renderer
failure tests. The stress fixture admits at most four backend reads before the
failure circuit defers the remaining work. It also suppresses 100 subsequent
polls during cooldown. These are fixture measurements, not production traffic
reduction estimates.

Browser QA verified category selection, keyboard navigation, deep links, one
visible panel, all 936 original IDs and unique-ID counts. The local preview
serves no production API handlers, so provider-unavailable UI was verified
there. Live public price/provider checks belong to post-deployment validation.

This is containment and correctness work, not a database recovery certificate.
Private autonomous QA, the kernel seal and real paper-broker evidence remain
separate release gates. Trading stays WAIT/0R and checkout remains locked.

Final local validation: 538/538 repository tests pass; Vite production build passes;
git diff whitespace checks pass. The DOM retains all 936 original IDs, verified
by count and matching sorted-ID checksum 2653677643. New workspace IDs are unique.

Final review also binds the server command snapshot to the same source-time and
bid/ask checks as the ticker. A quality fresh flag alone cannot promote a stale
or malformed quote. Flat and nested broker contracts retain their source state.
