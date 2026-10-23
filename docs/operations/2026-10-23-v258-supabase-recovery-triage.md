# V258 | Supabase outage triage without bypassing the launch gate

**Incident updated:** October 23, 2026, 17:57 UTC. **Production baseline:** V257 READY commit c1d0e8ea92cba95e83c6e0c442c97d87d054bfa7.

## Grounded findings
The Supabase management control plane reported ACTIVE_HEALTHY, yet a minimal SQL read and performance advisor queries failed because database connections timed out. Vercel V180 OIDC cron heartbeats continued to fail the mandatory kernel seal: 17:44 UTC `KERNEL_SEAL / DATABASE_SEAL_TRANSPORT_TIMEOUT`, 17:49 UTC `LOCK / PRIVATE_KERNEL_UNAVAILABLE`. SQLSTATE 08006 Supavisor errors were recorded in the provider logs.

Read-only Supabase logs for 16:45–17:55 UTC showed:
- **11** `DbHandler: Authentication timeout after 15000ms`
- **4** `EAUTHQUERY authentication query failed: connection to database not available`
- **4** `ECHECKOUTFAILED SQLSTATE 08006` errors
- **21** `canceling statement due to statement timeout`
- pg_cron startup timeout events across jobs 13, 16, 17, 20, 21, 33, 39, 78, among others. These counts cannot be added as distinct user requests; each system logs its own stages.

At 17:57 UTC, Vercel read-only external Auth probes for health and settings both timed out. The independent Supabase final readiness Edge route still responded `BUILD_HOLD` with `database_incident: POSTGREST_RUNTIME_UNAVAILABLE` and hard blockers `database_incident`, `auth_runtime`, `runtime_baseline`, `billing_preflight`.

This evidence does **not** establish DB max_connections exhaustion, account credentials invalid, or scheduler concurrency as the root cause. The incident requires infrastructure investigation, not a guessed reset.

## V258 implementation
- Add manual **Check read-only recovery path** to `/status/`. No automatic probe on page open, and ordinary visitors cannot accidentally trigger a database restart.
- New `GET /api/public-recovery-triage` checks fixed upstream Supabase URLs from Vercel: Auth health, PostgREST OpenAPI root and existing public-final-readiness. It sends only the already-public publishable project key, no service-role, customer credentials or user-provided endpoint parameters; independent upstream calls have a 4.7s timeout and 90s local negative/positive memoization.
- HTTP 200 vs 401 vs timeout is labeled **transport evidence only**. Even `200` on PostgREST does **not** establish a successful database query or Supavisor pooler connection. Upstream readiness remains a *reported* incident state. Neither source can certify actual password login, private OIDC, a fresh kernel receipt, active entitlement, broker-grade data or paid launch.
- Explicit minimum-privilege governance: `WAIT / 0R`, live orders OFF, `commercial_launch_certified:false`, `private_actions_executed:0`, `database_jobs_modified:0`.
- Unknown error details/blocker strings are not echoed. No secrets or stack traces in responses. Source data handled fail-closed. New unit and browser QA verify deliberate click, blocked/healthy gateway mixes, and readiness denial.

## Recommended escalation (sanitized, copy-ready)
> Our Pro Supabase project in eu-west-1 has intermittent-to-sustained database connectivity failures. The project control plane says ACTIVE_HEALTHY, but simple management SQL reads timeout. In our Oct 23, 2026 16:45–17:55 UTC logs, Supavisor recorded 11 backend authentication 15s timeouts, 4 EAUTHQUERY and 4 ECHECKOUTFAILED / SQLSTATE 08006, while Postgres logged statement cancellations and multiple distinct pg_cron startup timeouts. Vercel services in iad1 observed 503 kernel seal failures. Public Auth /health and /settings probes timed out at 17:57 UTC; the Supabase Edge public incident verdict reported BUILD_HOLD / POSTGREST_RUNTIME_UNAVAILABLE. Please inspect eu-west-1 Postgres backend reachability, Supavisor authentication backend, PostgREST worker health, compute CPU/IO pressure, and pg_cron backend-worker constraints. Is there an infrastructure networking issue between Supavisor and Postgres? Please advise a safe remediation that preserves database data and all scheduled jobs. No password or service-role keys are supplied.

Support: https://supabase.com/dashboard/support/new . Supabase guidance covers Supavisor authentication and database observability: https://supabase.com/docs/guides/troubleshooting/supavisor-error-password-authentication-failed-after-password-rotation and https://supabase.com/docs/guides/observability/reports .

## Release and rollback
Add dedicated V258 fail-closed tests into the release workflow, plus a real Chrome click-only status diagnostic acceptance test. Require all regression and browser checks, exact tested GitHub SHA, production Vercel READY, and independently observed production endpoint response. Rollback is reverting the standalone public endpoint and status-page panel; no database mutation to undo.

**Do not** pause, globally reschedule or disable any of the 58 active cron jobs; rotate passwords; restart the DB; alter Auth/RLS; or bypass `KERNEL_SEAL` without a verified root cause, explicit runbook and actual post-change validation. Even a cleared HTTP transport check does not lift BUILD_HOLD.