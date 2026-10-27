# V321 · Billing Operational Liveness and Commercial Release HOLD

**Recorded:** 2026-10-27 UTC. **Branch:** `security/v321-billing-liveness-release-gate`, draft PR #288, based on cumulative V313–V320. **Production:** V311 remains unchanged. **Purpose:** ensure a healthy autonomous kernel or a successful cron SQL invocation can NEVER by itself authorize merchant checkout.

## Actual production findings, read-only, verified

Production Supabase project `mpcelmjiycjpdyyflisn`, Vercel project `prj_WOGzSCTWULzGNgFGqVE5dFpg6anx`.

1. Supabase `public.agent_runs` contains **seven** `billing_reconciliation` rows and **one** `billing_subscription_watch` row whose status is still `running`, started more than 2 hours before the 2026-10-27 audit. None contains a `completed_at` or error. The oldest reconciliation row started **2026-10-17 11:13:35 UTC**; the newest is **2026-10-26 09:12:54 UTC**. Watch run started **2026-10-26 18:22:45 UTC**. Do not infer a payment transaction failed or rewrite these records without checking the root cause and provider ledger.
2. In `cron.job_run_details` over the previous 3 days, billing reconciliation job 26 recorded **35 failed** executions and **37 succeeded** executions. Subscription watch job 34 recorded **five failed** and **seven succeeded** executions. **All 40 failed executions were categorized `timeout`** by read-only SQL. Most recent observed successful scheduler calls: reconciliation 2026-10-27 04:12 UTC, watch 2026-10-27 00:22 UTC.
3. The reconciliation Cron 26 is active hourly at `12 * * * *`. Subscription watch Cron 34 is active every 6 hours at `22 */6 * * *`. A scheduler run marked `succeeded` may only indicate it successfully issued a SQL/network scheduling command. This cannot replace verified *completed* agent-run evidence.
4. The separate V180 kernel was independently `HEALTHY`, with zero consecutive failures and dead letters, latest sampled success 2026-10-27 04:29:44 UTC. That supports kernel stability but is NOT proof of billing readiness.
5. Current production `public-billing-acceptance` Edge v1 assesses merchant plan parity and payment receipts without a billing-job liveness requirement and caches success for 5 minutes. This may produce a superficial `ready_for_checkout` assessment while billing jobs are anomalous. Its staged V321 candidate adds fail-close operational gating and disables stale response caching.

## Review-only V321 artifacts

- `docs/release/V321-REVIEW-ONLY-BILLING-OPS-READINESS.sql`: service-role-only PostgreSQL function `billing_ops_readiness_v321()`, SECURITY DEFINER / explicit protected search_path, declared STABLE, no writes; counts old running agent jobs, failed/timeout cron runs in last 24h, cron active and fresh successful scheduler executions PLUS separately fresh **completed** agent-run rows. `ops_gate` is PASS or HOLD; `commercial_activation_permitted` is always false. Returns only summary counts and UTC timestamps, no job IDs, transaction IDs, payment refs, names or secrets.
- `docs/release/V321-REVIEW-ONLY-public-billing-acceptance.ts`: staged replacement for the existing Edge. It calls the restricted RPC through a server-side service credential. Ops HOLD or RPC failure returns `BLOCKED_OPS_GATES`, `ready_for_checkout=false` and no merchant lookups. It disables the public 300s cache, sets `Cache-Control: private, no-store`, and applies a separate, hardcoded `COMMERCIAL_ACTIVATION_RELEASED=false`. An operational PASS alone cannot enable checkout.
- `tests/fixtures/v321-billing-ops-schema.sql` and `tests/v321-billing-ops-acceptance.sql`: disposable PostgreSQL 17 fixtures. Reproduce **eight** old running operations and **40** scheduler timeouts, verify fail-close. Recover only *fixture* rows and show fresh cron+agent evidence required for operational PASS. Verify disabled cron/aged agent results fail, role EXECUTE permissions, and no implicit commercial permission.
- `tests/v321-public-billing-ops-gate.test.mjs`: seven isolated Node 24 VM scenarios using actual staged Deno handler source and fully fake database/provider responses. Test stale gate, missing RPC, credential/provider error, operational PASS without payment activation, no stale success caching, GET-only behavior and public response redaction.
- `.github/workflows/v317-atomic-payment-ledger.yml`: cumulative CI runs V317 atomic payment, V318 atomic cancellation, V319 signed HTTP webhook, V320 safe reconciliation and V321 billing liveness tests in ephemeral PostgreSQL and Node. No authenticated live customer test or database mutation.

## Verifiable CI evidence (reviewed code head)

Initial V321 code head: `342535a1ee6692340abd9e7c6e8a681b734c2a5e`.
- V240 full repository regression: **1,097 of 1,097 Node tests pass**.
- Real disposable PostgreSQL 17 CI: `V317_POSTGRES_ATOMIC_PAYMENT_ACCEPTANCE_PASSED`, `V318_ATOMIC_CANCELLATION_ACCEPTANCE_PASSED`, `V321_BILLING_OPS_LIVENESS_PG17_ACCEPTANCE_PASSED`.
- 7 new isolated V321 public readiness cases pass, plus previous 9 reconciliation and 15 signed-webhook runtime cases. CI workflow `V321 Commercial Billing Operations and Atomic Lifecycle Acceptance` passed.
- All public and authenticated Chromium smoke/source checks passed on initial reviewed code head.
- These checks do **not** establish live Flutterwave sandbox acceptance, production backups, recovery retry delivery, or real MFA sign-off.

## Required next commercial acceptance

1. Confirm instance-specific **Supabase backup inventory**, actual recent restore point, and successfully rehearse an **isolated restoration**; note database backups exclude stored object bytes in Storage API.
2. Investigate the 8 incomplete agent runs and 40 recent cron timeouts: isolate external request timeouts from the job's activity and inspect Supabase Edge and cron run logs, verify consumer retry budgets, mark/reconcile only after matching provider records and authorized remediation. Do NOT automatically change the existing production rows.
3. Build a **durable recovery work ledger** with reviewable correlation key, encrypted/resolved merchant reference, capped exponential retry and escalation, idempotency and explicit operator reconciliation; V320 is deliberately read-only and cannot recover unmatched payments automatically.
4. Real Flutterwave signed sandbox payment, recurring renewal, duplicate event, cancellation, refund/chargeback, expired intent and out-of-order tests. Confirm provider webhooks and customer entitlements under service-only grants.
5. Real consenting member signup, owner MFA AAL2, private cache/security header verification on hosted build, and billing term expiration/RLS. 
6. Source-provenance/licensing for verified live Gold, Oil, DXY and BTC data; ensure stale quotes show WAIT instead of falsely live prices.
7. Only after all gates and explicit owner signoff: staging migrations in verified order, guarded Supabase Edge deploy, audit + rollback, then production code promotion as a separate operation. No automatic checkout unlock.

**Immutable boundary:** V311 production stays READY. Deployed `create-checkout` v9 `V272_CHARGES_ENABLED=false`, browser checkout OFF, draft V317 paid webhook guard OFF, draft V318 cancellation guard OFF, V321 commercial activation guard OFF. Automated trading OFF, action WAIT, capital 0R. No production schema/Edge writes, payments, cron mutation, or customer balance changes were made by V321.
