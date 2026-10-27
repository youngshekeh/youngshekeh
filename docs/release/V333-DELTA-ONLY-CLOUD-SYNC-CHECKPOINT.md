# V333 · No-Change Cloud Sync Write Suppression

**Date:** 2026-10-27 UTC · **Status:** REVIEW ONLY · **Base:** V332 staged review branch, production V311 unchanged.

## Root issue established in source

An audit of `src/command-os.js` found eight large collections whose existing background syncs performed authenticated Supabase REST GETs followed by unconditional **full-collection POST upserts** every five minutes, even if all server rows already matched local records:

1. Command decision ledger.
2. Organization objectives and projects.
3. Business units, products, distribution channels.
4. Resource allocations.
5. Outcomes.

These are **eight datasets** grouped into **five scheduling functions**. For a signed-in client with unchanged cloud data, the old implementation could issue **eight unnecessary database-writing upsert requests every five-minute cycle**, not counting direct on-edit writes or the underlying GET requests. This is a real source-level inefficiency, but it is **not independently proven to cause the cross-client PostgreSQL SSL failures, statement cancellations or PostgREST timeouts**.

## V333 actual code changes

- `src/v333-delta-only-cloud-sync.mjs` adds conservative reconciliation to select **only genuinely missing local records or locally newer timestamps** from a successfully read remote snapshot. When the server version is newer or equal, it wins and **no upsert is emitted**. Client content and IDs are not logged or exported.
- A remote GET returning exactly 1,000 rows is treated as potentially truncated, because the project's Data API maximum has not been independently validated for these routes; the reconciliation **fails closed**, rather than assuming a missing ID must be inserted. A malformed/duplicated identity, unverifiable timestamp for a new local row, ambiguous remote version, or more than 100 candidate rows causes an explicit failure state rather than a blind bulk rewrite.
- `src/command-os.js` now calls the pure policy **before merging remote data** for each of the eight collections. Existing merge semantics remain: the last valid updated timestamp wins, remote wins ties. Only `pending` rows are mapped through the existing `toCloudRow`, `objectiveToCloud`, `projectToCloud`, etc. transformers. Existing manual item edit/create/resolve paths and authenticated PostgREST write helpers remain available and unchanged.
- The prior V332 two-request concurrency cap, phase-shifted startup, foreground-only automatic refresh and 60-second machine monitoring remain in place. The V331 no-network outage triage and V330 kernel pressure circuit remain cumulative review-only.
- `tests/v333-delta-only-cloud-sync.test.mjs` runs 20 isolated contracts including a direct VM execution of the real `syncCloudMemory()` function, no-change zero-write, local newer/new local, remote newer/equal, duplicates, clock drift, malformed timestamp, 1000-row truncated remote, 100-write bound, source integrity and immutable capital/merchant locks.
- `.github/workflows/v317-atomic-payment-ledger.yml` runs the V333 tests with all previous V317–V332 billing, MT5 market-data, owner AAL2, PostgreSQL 17, database incident, Command OS and Chromium acceptance checks.

### Measured effect and limitations

In the zero-change synthetic test, **eight of eight** full-collection background POST upserts become **zero**. This is a *controlled source-level test*, not a real database transaction-count benchmark. The GET queries still occur, and direct user-initiated changes still write as before.

The policy uses read-then-conditional-upsert, **not an atomic compare-and-swap**. An intervening concurrent edit between remote GET and POST could still race. Real production acceptance needs two independent user/session cross-browser tests, explicit remote row ownership/RLS verification, complete pagination and timestamp index coverage, and dedicated post-deploy metrics to show reduced write load without lost updates. Do not represent this alone as a permanent DB repair.

## Verified live infrastructure symptoms

A read-only `SELECT clock_timestamp()` **succeeded at 2026-10-27 10:22:14 UTC**, but the preceding hour had recurrent management SQL connection failures. Separate historical 10:10–10:45 UTC Supabase logs show **9 timeout-containing PostgreSQL log messages out of 34** and **10 PostgREST timeout messages out of 10**, with PostgreSQL 57014 and 08006 errors also observed. One successful simple read does not certify a healthy SQL pathway or root-cause recovery. Logs are event counts, not unique users and not conclusive cause attribution.

## Immutable production safety

**No Supabase production SQL, Edge, schema, cron, owner, member or billing data changed.** No customer rows were read. No funds moved, orders submitted or permission unlocked. Production V311 remains active, checkout/merchant charges **OFF**, automated trading **OFF**, capital **WAIT / 0R**, commercial launch **HOLD**. V333 is only a source review candidate until independent operational diagnostics, restorable backups and controlled launch acceptance are complete.
