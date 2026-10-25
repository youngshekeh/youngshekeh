# V306.1 · Global Cron Incident Gate / Protected Autonomous Core

**25 October 2026.** A source-controlled, read-only safety gate for manual V304 function-repair consideration. This is **not** a cron fix, an agent restart, an Auth repair, or proof of public commercial readiness.

## Verified evidence
- V306 public deployment responds, while private kernel errors and release HOLD remain.
- Core job 44 original source MD5: `ad18646c899eaffd2e7f6dfae567ce71`; active scheduled command `select public.refresh_autonomous_machine_state();`, every 15 minutes (11/26/41/56).
- Six newest core job 44 receipts observed at 13:18 UTC failed with **job startup timeout**.
- Fresh Supabase `postgres_logs` at **13:27 UTC** additionally show job startup timeouts for jobs **6, 27, 59 and 79**, and SSL connections reset by peer, plus separate statement timeouts. This is **multi-job scheduler/connection pressure**, not proven to be confined to core job 44.
- Supabase control-plane project status was ACTIVE_HEALTHY but recent SQL probes alternated between success and **connection timeout**. Project status and successful public HTTP cannot certify private SQL operations.
- The existing V304 1025-row bounded-history patch targets SQL work **inside** an already started job; it does not directly address scheduler connection/startup failure. **Do not apply V304 while startup failures remain.**

## Admission criteria (read-only observations, for manual review only)
1. Collect the live fingerprint and exact job 44 name, schedule, active flag and SQL command, plus a recent read timestamp.
2. Capture **two independently completed SQL probes** at least two minutes apart and within a recent window. This only shows sampled SQL transport.
3. Obtain an **untruncated bounded sample of six or more recent completed cron job 44 receipts**, most recent at most 25 minutes old; check two latest successes and any startup-timeout errors. Missing/partial samples fail closed.
4. Obtain Supabase `postgres_logs` covering **at least ten minutes** with a recent observed timestamp, and record every distinct cron job showing `job startup timeout`. Missing, stale or partial log coverage is **not zero failures**. In V306.1 this is supplied as operator-verified `schedulerEvidence`; it is not fetched or cryptographically signed by this module.
5. Call `assessCoreRecoveryAdmission(...)` locally. It returns **ELIGIBLE_FOR_MANUAL_V304_REVIEW** only if all evidence meets these checks. It *never* authorizes a migration, paid release or trading. Release requires independent current private kernel proof, current Auth, QA, market-data licenses and payment evidence.

### Safe diagnostics
Use read-only Supabase Log Explorer queries (not high-concurrency production SQL) to review provider failure timestamps. Redact IDs, user data and payloads before support escalation. Inspect `postgres_logs` by `event_message` for `job startup timeout`, `Connection reset by peer`, and `canceling statement due to statement timeout`. Attach aggregate job IDs and UTC timestamps, rather than raw customer payloads.

### Provider escalation
Continue the Supabase support process, citing the verified **multi-job pg_cron startup failures**, PostgreSQL client connection resets and intermittent PostgREST / Supavisor timeouts. Request diagnosis of connection admission and cron worker capacity. Do not reset the database, globally pause cron, change financial or RLS permissions, rotate keys, or execute V304 without a separate approved release.

**No new probes or mutations are introduced by V306.1.** Checkout HOLD, live order submission off, and capital permission WAIT / 0R are preserved. V306.1 is review tooling only, not a continuously running monitor.
