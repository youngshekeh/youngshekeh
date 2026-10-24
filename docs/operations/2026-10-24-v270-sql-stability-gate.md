# V270 · Time-separated SQL stability acceptance

**Evidence captured:** October 24, 2026, approx. 06:13 UTC. **Baseline:** V269 production commit `15952737089ec73fa978e3195fcd2ba0517ca98f`.

## Production finding
- A fresh read-only management SQL query for `now()`, max connections and existing cron job counts failed with `Connection terminated due to connection timeout`, after separate reads had intermittently worked in V269.
- Unified logs in the prior ~20 minute window counted 35 messages containing `timeout` among 93 PostgreSQL log events, 7/8 PostgREST log events and 8/43 Supavisor log events. These are aggregate message-match counts, not unique root causes or connection utilization rates.
- Public release V269 remained Vercel READY; `/api/public-recovery-triage` said `DATABASE INCIDENT REPORTED`. Public feed still responded with `WAIT / 0R` and `MARKET_CLOSED`. Private heartbeat still encountered `KERNEL_SEAL / DATABASE_SEAL_TRANSPORT_TIMEOUT`.
- The separate point-in-time V269 readings of 22–23 connections against configured max 60, 58 active + 38 paused cron jobs **did not establish stability**. We cannot conclude max_connections is the root cause.

## New strict offline recovery criterion
`assessDatabaseRecovery` now rejects a single successful SQL probe as sufficient evidence. In addition to its existing management SQL gate, V270 requires a `management_sql_samples` array containing at least two successful read-only `SELECT_NOW` probes:
- independently identified `probe_id` strings, UTC observation and database timestamps within 30 seconds, and `SUPABASE_MANAGEMENT_SQL` source label;
- completed at least 60 seconds apart, all evidence within ten minutes, newest success within five minutes;
- contradictory probe reuse, stale or future-unreasonable observations, failure rows, unexpected source/query, and malformed samples fail closed.

This is an **operator-evidence evaluation**, not a new scheduled privileged SQL monitor. The program cannot create its own receipts, cannot query a DB, and does not clear an ongoing provider incident from a static sample. The provider connection remains unresolved until the support team identifies and fixes the failure.

## Release and preservation
- Three-file scoped code+test+runbook update. No production database SQL changes, cron disabling, Auth/RLS changes, OIDC or kernel seal bypass, private queries in public responses, payment unlock, merchant processing or live trades.
- Preserve V269 two-distinct sealed private kernel cycles and all existing postgrest/cron/incident/billing gates.
- Existing `scripts/v217-db-incident.mjs` reads a **locally supplied** JSON evidence snapshot; it does not connect to SQL. Its returned `LAUNCH_HOLD` remains expected for incomplete receipts. Redaction protections remain.
- Source is saved in GitHub; **database content and storage backup not yet verified**.
- Supabase support: https://supabase.com/dashboard/support/new . Do not claim that filing a ticket or a provider fix has occurred.

## Follow-up operator proof
Once the database is reliable, collect **real** management SQL probes with timestamps, verify database connection pool and Auth functionality, reconcile cron history, obtain two independently sealed fresh V180 EXECUTE/HEALTHY cycles, check provider market data rights and payment entitlements; run production smoke and only then consider an explicit operator commercial release.
