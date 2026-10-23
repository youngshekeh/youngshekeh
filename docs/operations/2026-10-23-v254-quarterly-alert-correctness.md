# V254 · Quarterly alert truth and watch-state recovery
2026-10-23. Scope: only Market Observatory browser-side research notifications. Preserve the V253 measured nine-asset quarterly range engine, all 58 database schedules, Gold spot feed, Gold execution OFF, and private commercial readiness gates.

## Verified defect addressed
- V253 `acceptQuarterAlert` emits a notification for the very first qualifying zone state when the user clicks `Enable tab alerts`, without two ordered observations. This can look like a new crossing when price has already been at that level for minutes.
- Re-renders on a 15-second clock revisit the same underlying provider timestamp, so false detection must be prevented by source-time ordering, not only by cooldown.
- V253 acquired WTI / DXY market observations from the 8-minute historical-quarter cache, even though independently validated, more frequently refreshed delayed reference prices are available at `/api/public-macro-reference`.

## V254 changes
- New `src/quarterly-alert-observer.mjs` is a pure per-asset in-tab observation ledger. Always seed the first state as a baseline; only notify after a different verified source timestamp **and** a new zone state. Exact `source`, `symbol`, completed-quarter identity and non-executable capital permission are required. No inference from repeats, reordered observations, lengthy data gaps, or user arming in the middle of a preexisting state. Enforce ten-minute same-class notification cooldown.
- The page records the baseline even when notifications are paused; enabling notifications never replays historical conditions.
- WTI NYMEX and ICE DXY watcher inputs prefer `verifyMacroPacket()` from the already independent public macro API; fallback to the strictly qualified quarterly Yahoo market snapshot if the macro feed is unavailable. Gold zones remain COMEX GC=F futures and do **not** accept Gold API XAU spot quote as a matching futures observation.
- Visible-tab research monitoring now refreshes at a 60-second interval, using bounded Vercel endpoints that cache provider reads. No continuous tick-by-tick or guaranteed real-time behavior.
- The in-tab log includes before/after **vendor market observation times**, source, previous state and research proxy reference. No server-side queue, permission persistence, SMS, email, background push or execution.
- `src/quarterly-alert-rules.mjs` retains its existing experimental `acceptQuarterAlert` export for prior tests and engine compatibility, while V254 UI uses the stricter pure observation gate.

## Requirements and limits
- A valid first state **never** notifies.
- A second observation with identical/reordered vendor time **never** notifies.
- A real new state with short source-time gap can notify only if the user already opted in.
- Gaps over 35 min (Yahoo vendor market time) or 3 min (Coinbase BTC receipt time), changed quarter/symbol/provider and missing credentials cause a *new baseline* instead of a presumed crossing.
- All providers remain delayed or indicative research references, not validated institutional liquidity or broker quotes. Yahoo commercial market-data redistribution rights remain UNVERIFIED.
- Controlled tests and the full repo suite must pass, then production Vercel READY and independently verified endpoint checks. Interactive Notification API permission UX cannot be claimed as click-tested without browser automation.

## Rollback
Revert V254 UI import/code and accompanying pure module/test. No persistent data store, scheduled job, Supabase Edge function, or external delivery to undo. Commercial launch remains BUILD HOLD, execution OFF and WAIT / 0R.
