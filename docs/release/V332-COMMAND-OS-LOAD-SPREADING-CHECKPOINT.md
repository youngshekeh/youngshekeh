# V332 · Command OS Request Storm Containment

**Date:** October 27, 2026 (UTC). **Status:** Review-only, unmerged, not deployed. **Base:** V331 cumulative review branch.

## Measured/verified reason for the change

The production database is still inconsistent. A minimal `SELECT clock_timestamp(), pg_stat_activity` and a separate query to inspect `cron.job_run_details` indexes timed out, even though the Supabase control plane labeled the project `ACTIVE_HEALTHY`. The read-only historical 09:50–10:30 UTC Supabase logs contained **23** timeout-containing `postgres_logs` messages out of 63 (including one SQLSTATE `57014`, two `08006`, one `08P01`) and **six** timeout-containing `postgrest_logs` messages out of six. Log counts can overlap and are not a unique request count. The real infrastructure cause has not been proven.

A repository audit of **`src/command-os.js`** identified additional avoidable page-driven load:
- Initial `boot()` used `Promise.allSettled` to start **13 independent sync tasks together**. Several also perform their own parallel Supabase REST reads and cloud synchronization.
- One live machine sync was scheduled every **60 seconds**; the other **12 cloud syncs shared the same 300-second phase**, risking concurrent request bursts every five minutes.
- The seven independent public source fetches in `syncMachine()` were started with unbounded `Promise.all` (seven fetches together).
- The old polling never skipped a browser tab hidden in the background.

These are **contributing load patterns**, not evidence that Command OS alone caused Postgres statement cancellations, SSL EOF/reset errors, Supavisor bottlenecks or PostgREST Warp timeouts.

## V332 candidate implementation

1. `src/v332-command-os-load-spreading.mjs` introduces a **2-task-bounded** settled boot worker, a **2-request-bounded** source map that preserves the original source order and errors, and a scheduler preserving existing functions and intervals. One-minute machine checks retain 60 seconds. The 12 five-minute syncs begin after a full startup grace interval, phased from **310 to 497 seconds** after boot in 17-second steps, recurring every 300 seconds each.
2. Background-tab scheduled requests skip when `document.visibilityState==='hidden'`. No invisible tab keeps polling. Active-task admission rejects overlaps and caps scheduled concurrency at two per browser. Returning to the tab resumes at the next scheduled opportunity; local UI and manual refresh buttons remain.
3. `src/command-os.js` **actually imports and applies** the scheduler and bounded source-map to the existing Command OS page, replacing the synchronized `Promise.allSettled` and 13 direct `setInterval` calls. Existing member Auth, owner login, cloud sync methods, business brain, scheduler, dispatch, kernel, AI, local storage and UI DOM IDs are all preserved. No API endpoint, SQL, schema, payment, trading, entitlement or pg_cron mutations.
4. `tests/v332-command-os-load-spreading.test.mjs` uses deterministic fake clock/timer tasks to validate exact phases, intervals, hidden tabs, bounded startup/source fanout, error isolation, overlap prevention, manual controls and zero trading/merchant changes. The cumulative workflow runs the tests alongside V317–V331 atomic merchant, market provenance, database incidents and real Chromium browser QA.

## Safety and commercialization

V332 protects one class of **browser-generated read pressure**, not a permanent database repair. A two-request cap on one Command OS page is not a cross-browser/global load limiter. It has no special access to the infrastructure settings.

**Never call the incident resolved until** the actual Supabase database bottleneck is identified and corrected, capacity and pool/long-query measurements are available, an isolated backup restore is verified, and at least two separated private SQL probes plus recent PostgREST/log receipt checks are stable. The pending owner/MFA, licensed real market prices, Flutterwave signed sandbox and MT5 first-tick gates remain independently required.

**Production unchanged:** Vercel V311 READY, commercial checkout OFF, automatic trading OFF, capital **WAIT / 0R**, public launch HOLD.
