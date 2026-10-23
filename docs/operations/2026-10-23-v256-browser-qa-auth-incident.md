# V256 | Chromium Market Observatory acceptance and infrastructure incident evidence

Date: 2026-10-23. Baseline production version V255. V256 introduces real browser QA with controlled public-data mocks, not trading, Auth, billing or cron changes.

## Grounded incident
- V255 was READY in production (commit b7417d0c3b2d8dbe3cd93cf881df809742b03940). Nine out of nine quarterly ranges, Gold/BTC, Oil/DXY public references returned attributed, read-only prices.
- The private V180 heartbeat at 16:29 UTC still failed KERNEL_SEAL with DATABASE_SEAL_TRANSPORT_TIMEOUT; public final readiness BUILD_HOLD with POSTGREST_RUNTIME_UNAVAILABLE, AUTH_UNAVAILABLE and BILLING_LEDGER_UNAVAILABLE.
- Sampled Supavisor logs at 15:30-16:35 UTC: 15 instances of 15000ms DB authentication timeout, five EAUTHQUERY connection-not-available errors, five ECHECKOUTFAILED with SQLSTATE 08006. PostgREST reported Warp server worker timeouts. PostgreSQL cron logged startup timeouts across multiple distinct job IDs.
- Supabase control plane ACTIVE_HEALTHY is not certification of Auth/PostgREST. No cron schedule changes or seal bypass are approved.

## Browser acceptance
- GitHub workflow: .github/workflows/v256-observatory-browser-qa.yml.
- Run Vite production build, launch Chromium via Playwright, serve built Observatory in a local preview. Mock the three fixed public read-only API paths; no live feeds, accounts or execution endpoints.
- Verify all nine asset cards and all three market source indicators (9/9 ranges, 2/2 spot, 2/2 delayed macro).
- On page arrival and after clicking Enable tab alerts, the alert log must contain zero notifications.
- Permission button must call the browser's Notification.requestPermission mock only from an explicit click.
- A second strictly newer synthetic Coinbase source receipt crossing the prior-quarter high-zone threshold must produce exactly one in-tab event and one Notification-constructor invocation; repeating that same receipt must produce none.
- Pausing monitoring must display OFF; no broker, payment or account access is used; capital remains WAIT / 0R.
- Fail on uncaught page errors.

## Limits
Browser-level DOM/JavaScript interactions use mock public market data and a stubbed OS Notification API. Passing does not prove real exchange price accuracy, actual OS notification delivery, iOS push support, foreground vs background guarantees or private-kernel recovery. Neither customer data nor broker execution is involved.
V256 does not change the market UI or any private Supabase function. CI acceptance provides a real launch QA signal that existing Node-only suites could not establish. Commercial launch remains BUILD HOLD until DB, user auth, entitlements, legally sourced market prices and broker controls meet separate gates.
## Release control
Require V256 head commit browser QA and all previous GitHub workflows to pass. Preserve rollback as a GitHub workflow/test-only revert. Report actual results and limitations.