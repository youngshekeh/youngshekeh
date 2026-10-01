# V174 QA deadline and runtime pressure mitigation

## Problem and change

V173's live integrated QA request twice exceeded the Vercel bridge's 30-second timeout and returned only `private_runtime_unavailable`. The QA worker limited concurrency to three, but 40 probes, individual timeouts, retries, and a sequential production-closure call had no shared request deadline. The dashboard automatically ran the entire matrix again when it did not receive PASS, and its one-minute refresh could overlap an unfinished refresh.

V174 gives QA a 24-second budget measured from entry, including private authentication. Every fetch, body read, retry, and queued probe shares that budget. Active HTTP work is aborted at expiry and queued probes do not start. Auth and static-surface probes are prioritized so partial results contain useful evidence. All 78 existing check predicates and custom private authentication are unchanged. An unfinished matrix returns `INCOMPLETE`, `ok=false`, its actual pass/fail counts, and per-probe transport evidence. An unfinished check cannot count as passed. HTTP cancellation does not prove cancellation of upstream database work.

The dashboard displays the incomplete result, performs no automatic second QA run, and prevents overlapping mission refreshes. A later scheduled or manual refresh can collect new evidence. No database DDL, job schedules, connection settings, policies, broker configuration, or trading permissions are changed.

## Database investigation

- Intermittent broad cron startup failures predate V173. A successful minute can follow a failed minute; the cron launcher is running.
- `cron.use_background_workers=off`, so the observed `max_worker_processes=6` is not evidence of a six-worker cron ceiling. Brief idle transactions had no observed blockers and were left alone.
- An `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` of the latest V72 enforcer run reader scanned 98,490 rows with a sequential scan and top-N sort. Observed execution was 44,414.573 ms. This is one sample under runtime strain, not a normal-latency measurement or a complete explanation of the startup failures.
- `cron.job_run_details` is approximately 32 MB, with only its `runid` primary-key index. It is owned by `supabase_admin`. The connector role `postgres` is neither a superuser nor a member of that owner role.
- Indexes on `(jobid, start_time DESC)` and `(start_time DESC)` are concrete candidates for a managed-database review. They have not been created, and their effect has not been measured. Ownership and privileges have not been changed to bypass that boundary.
- Statement timeouts also appeared in existing V100, V143, V144, V152–V159 and V161–V165 readers. Lightweight connector SQL sometimes failed during connection establishment. QA request limits mitigate application amplification; they do not establish database recovery.

## Validation

- 19 new tests cover the actual QA handler, three-worker ceiling, shared authentication budget, retry limits, queued-work prevention, cancellation, a real stalled HTTP response body, truthful incomplete counts, anonymous denial, and dashboard retry/overlap behavior.
- The 81 V172/V173 quote and owner workflow tests also passed. All 78 live QA predicates and custom authentication are byte-identical to V173.
- All 28 PR workflow runs and the V174 feature-push workflow passed: 29/29, including the production build. PR #112 was merged at `b6c959ccdc9598846a00c398385cc05d5a3254ca`.
- The new Edge function is ACTIVE at version 45 with `index.ts` and `transport.mjs`. Its SHA-256 is `46c690b2ec07274a8fbb3ef3127acf178e84244ccc686dcbfce64b8db56745bf`. Existing custom private authentication remains enforced; anonymous probes returned 401.
- The operator's first bounded live request returned HTTP 200 with **53/78 confirmed**, 25 unconfirmed/failed checks, and state `INCOMPLETE`. The 24,007 ms transport window started 27 of 40 probes; 13 never started and three were aborted at the shared deadline. This exercised the existing 30-second bridge against the new Edge runtime and did not time out the bridge.
- A separate live browser window rendered **39/78 INCOMPLETE**, `QA INCOMPLETE`, and `26 probes not reached`, with **44 ENGINES** present. The owner quote panel was hidden and its submit control disabled while signed out. No application console errors were observed; a browser-extension metadata error was excluded.
- The live paper quote contract passed with `NOT_CONNECTED`, broker verification false, and capital permission `0R`. No authentic owner/MFA submission was attempted.
- Failed backend evidence included unavailable receipt/attestation/key/checkpoint lanes, fail-closed autonomous health, and an external-root comparison reporting mismatch while its local checkpoint evidence was unavailable. This is not evidence of tampering or a repaired provenance chain.
- Complete source, workflow, transport, browser, and deployment results are recorded in `v174-results.json`. Neither live window is a complete certification pass.

## Deploy Result

| Field | Result |
| --- | --- |
| URL | https://the-father-analytics-mcutkadgh-the-father.vercel.app |
| Production alias | https://thefatheranalytics.com/ |
| Target | production |
| Status | READY |
| Commit | `b6c959ccdc9598846a00c398385cc05d5a3254ca` |
| Framework | Vite |
| Build duration | 29.752 seconds |

Post-deploy error-level logs contained one `url.parse()` dependency deprecation on an HTTP-200 earnings response. A later status-code log count showed 64 entries associated with HTTP 503 and 236 associated with HTTP 200; these are log counts, not deduplicated requests. Runtime recovery is incomplete. Drains were not inspected. The bounded QA and existing health/provenance gates expose the continuing failures.

## Remaining gates

WAIT / 0R and live orders OFF remain enforced. The broker is not verified, owner/MFA quote submission has not been tested with a real signed-in owner session, and there is no execution-grade broker feed. Prior research had 10 resolved shadow outcomes against a 30-outcome maturity requirement and negative average gross R. No claim of a positive trading edge or real-money readiness is made.

The unresolved infrastructure work is managed cron-history indexing and diagnosis of intermittent startup/connection stalls. Scheduler mutation and live capital release retain their existing human review gates.
