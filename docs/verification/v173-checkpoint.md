# V173 owner paper quote workflow

V173 connects the existing V172 paper intake to Owner Command. The form is hidden and disabled until the existing server owner check and MFA status both succeed. MFA verification is followed by a fresh status check before opening the form. A new sign-in clears the previous receipt and relocks protected views. Tokens remain in memory; no new credentials, privileges, tables, schedules or order routes are created.

The owner pastes a source-produced JSON event and explicitly submits it once. The browser rejects extra fields, claimed verification, wrong mode/asset/provenance, invalid numeric prices, crossed/excessive spread, unsafe sequences and missing/future/stale timestamps. It preserves the original source timestamp and sequence and forwards only the quote contract. It never retimestamps old data, creates sample quotes, automatically retries or sends orders.

Overlapping submissions are blocked. A returned receipt must meet the paper-only capital/order contract before success is shown. Duplicate receipts say already recorded; they do not claim a second insert. A changed session withholds the previous session's response. Authentication/MFA denial relocks the form. Ambiguous network or receipt failures never report success and advise refreshing status before retrying the identical source event.

Public paper status is loaded on opening and explicit refresh. The browser rechecks quote and receipt expiry every second, without sending a new quote. Stale prices are withheld. The portal states that manually supplied quotes do not connect an autonomous source or verify broker provenance.

## Verification

- 46 quote preparation/submitter tests and 11 owner-script integration tests passed. The 24 existing V172 handler/view cases remain in the combined CI suite (81 cases total).
- Owner-script tests run the actual portal script against a small DOM fixture and controlled HTTP responses. They cover signed-out controls, non-owner rejection, unenrolled/weak/malformed MFA, status revalidation, in-memory bearer submission, receipt expiry without writes, expired-session locking and sign-in reset.
- No fixture uses real credentials or persists a quote. These controlled tests do not verify a real owner sign-in or real broker source.
- Runtime QA adds one surface assertion for a hidden form, disabled submit button and receipt/input identifiers: 78 checks after publication.
- All 27 PR workflows passed, including the Vite production build and owner workflow suite; the feature push check also passed (28 successful workflow runs). PR #111 merged as `6f9953667975528ae13ca8c7d05f8a7f167ad325`.
- Vercel deployment `dpl_LYWM7DGHN3gsT5VMH5n5SRpESrt2` is READY and assigned to thefatheranalytics.com. Live Owner HTML returned HTTP 200 with the hidden form and disabled submit button. Browser inspection confirmed form visible=false, submit enabled=false, empty draft and no confirmed receipt. No application console error was captured; an extension-only metadata error was excluded.
- QA Edge version 44 is ACTIVE. The first live QA call at 19:23–19:24 UTC and one follow-up at 19:25 UTC both returned HTTP 503, `private_runtime_unavailable`, after the bridge timeout. Neither returned a 78-check matrix. Live QA is BLOCKED, not passed.
- The production closure endpoint also returned HTTP 503, `RESEARCH_PRODUCTION_READY_PAPER_OR_EXECUTION_BLOCKED`, with several backend dependencies unavailable. Its WAIT / 0R and disabled-order invariants remained intact. The quota probe reported an upstream timeout; this does not establish that a billing quota was exhausted.
- Diagnostics found 77 cron failures in a ten-minute window, all `job startup timeout`; max_connections was 60. Function logs contained dependency and abort-signal timeouts. A later database diagnostic failed with `Connection terminated due to connection timeout`. The specific infrastructure root cause remains unverified; no scheduler, connection or worker settings were changed.
- Direct paper-status and simulation-lab requests did return HTTP 200 during investigation: NOT_CONNECTED with no quote, and PASS_SIMULATION_ONLY 6/6 with zero real orders. This partial availability does not clear the blocked production closure or QA result.

The V172 backend remains unchanged. WAIT / 0R, live orders OFF, broker verification false and execution-grade false remain authoritative. Existing review intelligence and inbox contracts are preserved. Real owner HTTP submission and broker connection still require an authenticated owner and a genuine fresh source event.

The immediate next task is runtime recovery: establish the source of startup/connection timeouts, verify dependency availability and then run the 78-check matrix. Do not lengthen timeouts or loosen release gates to conceal failures. No real owner sign-in or live quote submission was attempted through the browser.

Frontend rollback can revert this release independently; V172 intake can be disabled using its existing guarded SQL while retaining receipts. Do not remove evidence or change the trading firewall to test this workflow.
