# V322 · Billing transport integrity checkpoint

**Date:** 2026-10-27 UTC
**Cumulative review branch:** `security/v322-billing-transport-diagnostics`
**Draft PR:** #289
**Production:** V311 `03fa474389fdf704bff1d0ab434840063a6a33c1` remains deployed. No live changes.

## Independent production observations (read-only)

- PostgreSQL `pg_net` extension version **0.20.4** and `pg_cron` version **1.6.4**. One `pg_net` worker visible in `pg_stat_activity`; HTTP request queue empty at inspection.
- `net._http_response` contained **712 retained system-wide responses**, **38 HTTP 5xx** and **3 network timeouts** at the sampled instant. Its retained history covers approximately six hours. A further one-hour filter showed **119 responses**, **8 HTTP 5xx**, **1 timeout**. These are **system-wide** figures, not specifically attributable to Flutterwave billing, and must never be described as customer billing failures.
- Billing cron job 26 (`tfa-flutterwave-reconciliation`, hourly) generated **35 failed 3-day scheduler executions**, all classified `timeout`. Average failed run length was ~26.59 seconds; range ~10.01–154.38 seconds.
- Billing cron job 34 (`tfa-billing-subscription-watch`, every six hours) generated **5 failed 3-day executions**, all classified `timeout`. Average failed run length ~15.22 seconds; range ~11.16–19.84 seconds.
- PostgreSQL `agent_runs` retained eight old `running` billing records with no completion/error: seven reconciliation, one subscription watch. Recent successful cron and completed agent runs **do not clear** older incomplete records.
- The V180 private autonomous kernel's healthy heartbeat is **independent of billing**. It cannot override billing release gates.
- The actual project-specific Supabase backup inventory or an isolated restoration **has not yet been verified**. Do not apply these migrations in production.

## Source changes, review only

1. `docs/release/V322-REVIEW-ONLY-BILLING-TRANSPORT.sql`: private, service-role-only PostgreSQL RPC `public.billing_transport_readiness_v322()`, `STABLE`, `SECURITY DEFINER`, explicit search path. It exposes redacted aggregate worker/queue/last-hour transport evidence. It does not leak queued request headers, bearer tokens, URLs, HTTP payloads, error strings, transaction IDs, customer details or raw provider responses. The status explicitly says `SYSTEM_WIDE_PG_NET_NOT_BILLING_ONLY`, `billing_event_attribution_verified=false` and `commercial_activation_permitted=false`. Missing worker, overloaded queue or unavailable evidence fail closed.
2. `docs/release/V321-REVIEW-ONLY-public-billing-acceptance.ts`: after private V321 cron + completed-agent gate passes, requires V322 transport availability. If worker absent, queue under pressure or RPC unavailable, returns `BLOCKED_TRANSPORT_EVIDENCE`, ready false, no merchant-plan queries. Broad 5xx observations are *not* falsely attributed to billing. Both operational and transport PASS **cannot** bypass `COMMERCIAL_ACTIVATION_RELEASED=false`. HTTP response `Cache-Control: private, no-store`.
3. `tests/fixtures/v322-pgnet-transport-schema.sql` and `tests/v322-pgnet-transport-acceptance.sql`: **ephemeral PostgreSQL 17 only** fixture checking worker absence, 1h aggregates, stale response exclusion, role permissions, non-disclosure, absent pg_net table and fail-closed response. No live telemetry is copied to CI.
4. `tests/v321-public-billing-ops-gate.test.mjs`: four added handler VM scenarios for V322 transport worker absence, missing RPC, short-circuit to operations HOLD, and separate commercial hard lock.
5. `.github/workflows/v317-atomic-payment-ledger.yml`: updated isolated CI; preserves V317–V321 transaction atomicity, signed webhook, read-only reconciliation and billing-liveness acceptance.

## Distinct evidence layers

**Cron invocation** → **pg_net queue** → **actual HTTP response** → **completed Edge `agent_runs`** → **provider-signed verified payment** → **transactional local entitlement** → **member authorization**.

A passing result at any earlier layer does *not* prove a later layer. In particular, asynchronous `net.http_post` request enqueue success is not HTTP 200 and HTTP 200 is not verified paid member access.

## Release hold / unfinished

- No backup restore rehearsal or production migration; no deployment of V317–V322 candidate SQL/Edge code.
- The observed 40 timeout jobs and eight stale run rows need source-level root-cause resolution, redacted correlation to HTTP delivery, and controlled operator reconciliation. Never rewrite them simply to make the dashboard green.
- The provider's signed sandbox webhooks, recurring renewal/cancellation, chargebacks/refunds, durable reconciliation queue, real owner AAL2/member RLS acceptance, market data licensing/freshness, hosted security headers and rollback remain unverified.
- Active production billing reconciler v4 retains its old 72h window and expiration behavior until separately and deliberately replaced. The V320 replacement exists only in review.
- **Immutable:** production V311 READY, checkout OFF, commercial HOLD, automated trading OFF, WAIT/0R, no production customer payment, subscription, balance or cron changes by this build.

References: Supabase pg_net documentation https://supabase.com/docs/guides/database/extensions/pg_net and Cron https://supabase.com/docs/guides/cron.
