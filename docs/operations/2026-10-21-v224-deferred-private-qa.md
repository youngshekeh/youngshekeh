# V224 | Public status defers high-cost private QA under launch hold

**Date:** 2026-10-21 UTC. This is a safe public application pressure improvement, not a provider database recovery.

## Evidence and reason
Production V223 READY at 2026-10-21T04:47:27Z. V180 /api/ops-heartbeat continued failing KERNEL_SEAL through at least 2026-10-21T04:50 UTC. Management SQL connection check timed out. In Supabase logs for 04:45 to 07:00 UTC, latest observed PostgREST logs were 04:51:31 UTC with two 57014 and no PGRST002; latest postgres logs 04:52:01 UTC showed 12 cron startup timeout events. The narrow sampled interval does not establish system recovery.

The previous public status page unconditionally called /api/autonomous-qa-matrix, invoking a private 100+ test QA matrix even when auth, full acceptance, billing and live Gold were already unverified. In an overloaded environment that adds avoidable diagnostics.

## V224 change
- Fetch four required independent public observations with no-store, bounded deadlines: password auth, final readiness, signed billing/active entitlement, and verified broker-live Gold.
- Invoke expensive /api/autonomous-qa-matrix only when those four are all current, independently positive.
- Under an incident report PRIVATE QA DEFERRED and OIDC DEFERRED, both NOT CERTIFIED. Never reuse stale QA or assume a previous green observation.
- When prerequisites are green, still require the full authenticated private QA, verified Vercel OIDC header and two recent real V180 receipts to pass the existing launch gate.
- Does not touch the separately secured private QA API, trading, RLS, cron, Supabase functions, credentials, bills, payments, or Postgres rows.
- This reduces potential extra public QA work but does not cure provider worker/connection starvation.

## Verification and restoration
Run: `node --test tests/v224-deferred-private-qa.test.mjs tests/launch-readiness-gate.test.mjs tests/v220-entitlement-launch-proof.test.mjs tests/v222-public-gold-launch.test.mjs`.
Only merge if all CI checks are passing; exact SHA must be confirmed in production. V214 continuity vault records the committed source archive.
Restore via reviewed GitHub revert to V223 if there is a regression.

Remaining required support escalation: Supabase PostgREST schema-cache 57014/PGRST002, pg_cron startup worker contention, pooler authentication and OIDC-sealed V180 reliability. Full billing and active entitlement remain unaccepted; checkout stays disabled, capital WAIT / 0R.
