# V183 Public Launch Gate

THE FATHER ANALYTICS has a deployed public website, but deploying is not the same as certifying the autonomous kernel. `/status/` is a user-facing, fail-closed launch truth gate.

## Checks

- Confirm `public-final-readiness` is fresh (<= 10 minutes), returns explicit `FULL_ACCEPTANCE_READY`, and provides empty hard blocker, acceptance-pending and external-unknown arrays.
- Confirm Private Brain QA is fresh (<= 10 minutes) and has positive total, zero failures and matching pass count.
- Confirm the QA transport is authenticated with `VERCEL_OIDC`.
- Confirm a real completed checkout is reflected by `commercial.live_transaction_verified === true`. Preflight or a green HTTP response is not a sale.
- Confirm continuous V180 kernel `ok === true`, a recent `last_succeeded_at` and unchanged `capital_permission === '0R'`. General QA success cannot substitute for this specific evidence.
- If any source is offline, stale, absent, or ambiguous, render `PUBLIC PREVIEW · GATED`.

## Findings 2026-10-20 UTC

V181 has eliminated the global pg_cron shutdown side effect from Vercel heartbeat failures. V180 kernel remains degraded with KERNEL_SEAL-timeout failures because PostgREST cannot consistently rebuild the schema cache (PGRST002 / 57014). SQL confirmed a valid kernel seal. A bounded role-scoped authenticator timeout increase from 8s to 25s was deployed as V182 with no changes to `anon` (3s) or `authenticated` (8s); subsequent logs were still degraded at the time of verification. Do not claim full recovery until consecutive kernel successes and representative scheduled job completions are recorded.

## Remaining launch acceptance

1. Restore PostgREST schema-cache stability, then verify healthy 5-minute kernel runs.
2. Record at least two consecutive recent success receipts and a passing independent job-completion audit.
3. Verify actual browser sign-up, login and forgot-password flows.
4. Verify an authorized live checkout and receipt before calling subscriptions production-ready. Do not simulate success.
5. Verify Gold public feed freshness and invalidate stale broker ticks without placing orders.
6. Confirm owner/operator release approval and a tested rollback path before a major marketing launch.

No live order routing may be enabled automatically in this acceptance process.
