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
- Production build, live runtime result and browser observations will be recorded after publication.

The V172 backend remains unchanged. WAIT / 0R, live orders OFF, broker verification false and execution-grade false remain authoritative. Existing review intelligence and inbox contracts are preserved. Real owner HTTP submission and broker connection still require an authenticated owner and a genuine fresh source event.

Frontend rollback can revert this release independently; V172 intake can be disabled using its existing guarded SQL while retaining receipts. Do not remove evidence or change the trading firewall to test this workflow.
