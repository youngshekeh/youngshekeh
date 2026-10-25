# V307 · Incident-aware V180 private heartbeat load shedding

Date: 2026-10-25. Base production commit b31f4d9d042ccf749654ef38c47196efae391360.

## Incident evidence
At around 14:07 UTC the V306.1 website and control plane reported READY/ACTIVE_HEALTHY while the private V180 heartbeat was failing a database seal. Public recovery triage returned DATABASE INCIDENT REPORTED / POSTGREST_RUNTIME_UNAVAILABLE. The 13:10–14:10 UTC Postgres log window had 82 cron startup timeout events, 30 peer resets, and 17 statement timeouts (log entries, not unique requests). One recent SQL probe succeeded, which does not certify sustained connectivity. An October 19 provider email reported depleted Disk I/O budget, not a currently verified remaining balance.

## V307 safe behavior
- Only after a valid CRON_SECRET and GET does the heartbeat make one *read-only*, fixed-host, bounded public operator-triage GET.
- If fresh and internally consistent incident evidence reports an active database outage, it sends **no private kernel request and no new OIDC request in that cycle**. It returns 503 with explicit deferred state, Retry-After 300, and capital permission WAIT / 0R; no green receipt.
- If telemetry is unavailable, expired, clear, structurally inconsistent or contradicts fail-closed governance, it runs the **existing sealed OIDC kernel flow unchanged**. The diagnostic is not a replacement for independent kernel recertification.
- The existing Vercel cron schedule `4-59/5 * * * *` remains unchanged: normal attempts resume automatically whenever the incident is no longer independently confirmed. This code does not globally pause pg_cron, remove any job, restart or write to Supabase, place trades, touch subscriber data or enable billing.
- The incident GET may add up to 10 seconds to the heartbeat path on a degraded network. This is a bounded tradeoff, not a claim of increased service availability. Track actual deferred heartbeats and kernel failures before declaring efficacy.

## Acceptance
Node 22 syntax, V307 contract tests, V231 kernel regression, V306 core recovery regression, checkout/trade lock checks, full exact-head CI and Chromium. Do not claim full recovery: provider troubleshooting, private SQL/cron receipts, Auth, 107 QA checks, gold licensing and signed payment entitlement remain independent release gates.

Supabase support ticket SU-523502 has an unsent evidence update draft. Maintain the commercial launch HOLD during recovery.
