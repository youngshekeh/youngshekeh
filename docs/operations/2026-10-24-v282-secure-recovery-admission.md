# V282 · Secure fixed-origin staged recovery diagnostics

**Date:** 2026-10-24 UTC. **Baseline:** V281 production SHA `29c5356b3f5f8428494a15a0370f65eb5172b83b`.

## Actual security and stability findings
The legacy `api/runtime-recovery.js` trusted user-facing `req.headers['x-forwarded-host']` (or Host) and `x-forwarded-proto` as its server-side fetch origin. This exposes a plausible server-side request forgery and host confusion surface if edge normalization is incomplete; the existence of attacker-controlled dispatch was established in **source code**, not demonstrated by a live exploitation attempt. The same handler unconditionally faned out to five endpoints, including the expensive `/api/autonomous-qa-matrix` private relay, on every cacheless public GET. At a time of confirmed Supabase PostgREST/Supavisor/cron pressure, extra unauthenticated heavy QA requests are avoidable.

## V282 deployed code policy
- Restrict ALL recovery internal requests to literal `https://thefatheranalytics.com` and a six-path, source-controlled route manifest. Never accept request Host, forwarded proto, URLs or query arguments as destinations. Every request is a no-credentials, no-referrer, no-redirect, GET-only read; provider bodies are size-limited and raw errors are never echoed. Anonymous GET endpoint remains read-only.
- Stage A: at most two public checks, `/api/public-recovery-triage` and `/api/release-attestation`. Each must return current, governed evidence; stale, incident, unknown and unavailable results **stop all further calls**.
- Stage B: only if no reported incident, probe quota and provider edge. Stage C: only if both pass, request private state. Stage D: only if private state shows fresh smoke, no blockers or private DB incident, request expensive QA. A 60-second per-server-instance cache and single-flight promise coalescing suppress duplicate caller bursts.
- Never interpret HTTP 200, internal diagnostics or 100% of a public monitor as an authenticated login, sustained database recovery, signed healthy private-kernel proof, subscription entitlement or license. The diagnostic progress field is capped at **80**, explicit `READ_ONLY_DIAGNOSTIC_PROGRESS_NOT_LAUNCH_SCORE`. Even all six checks report `DIAGNOSTICS_PASSED_PRIVATE_CERTIFICATION_PENDING`, not `RECOVERY_VERIFIED`.
- Only sanitized allowlisted risk codes and bounded counts can leave the response. Production API noindex, strict CSP, checkout hard lock and capital `WAIT / 0R` remain intact.

## Real provider evidence (Oct 24)
At ~11:24 UTC a single read-only SQL sample reported 24 active sessions and 58 existing active cron jobs, while three additional read-only `pg_stat_activity`/scheduler probes each failed with connection timeout. Separate last-30m sampled Supabase logs yielded 5 PGRST003 PostgREST pool acquisition errors/82 events, 6 Supavisor authentication timeouts/40 events, 27 PostgreSQL cron startup timeouts and 10 SQL statement timeouts/142 events. These are **log event counts, not request error rates**, nor evidence that cron caused every failure. Public triage has remained `DATABASE INCIDENT REPORTED`, Auth TIMEOUT and PostgREST 401. Supabase formally documents `PGRST003` as a 504 waiting for a connection from PostgREST's internal pool: https://supabase.com/docs/guides/api/rest/postgrest-error-codes

## What this does not fix
Source-code SSRF and excess fanout are addressed prospectively with repeatable offline tests, but this does not demonstrate a penetration test against production edge headers. The fixed origin still depends on the same public deployment DNS and Vercel runtime; two-stage public probes may still reach Supabase's public readiness handler, though that source is independently cached and read-only.

**Do not** change any of 58 production cron jobs, restart the pooler, relax RLS, change user subscriptions, try payments, infer root cause, or enable live trading. Root-cause remediation requires Supabase Support `https://supabase.com/dashboard/support/new`, stable direct SQL/Auth and restore proof, independently sealed private kernel and verified merchant entitlements. New charges OFF; trading `WAIT / 0R`.
