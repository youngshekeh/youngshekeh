# V272: Production server-side payment endpoint seal and rollout record

**Date:** 2026-10-24 UTC. **Git baseline:** V271 `fcb6153a87e7e20edad0d68645f33e72cbbfe466`.

## Critical root-level finding
The currently deployed Supabase Edge `create-checkout` was **ACTIVE version 8**, `verify_jwt=true`, and its deployed `index.ts` lacked the newer `requireCommercialAcceptance` checks present in Git. The website `src/checkout.ts` was independently disabled via `CHECKOUT_SERVER_GUARD_DEPLOYED=false`, but *a disabled website button is not server-side protection.* Do not claim the deployed server handler was verified.

## V272 server-side remedy
1. Build on the reviewed GitHub handler with a **compile-time FALSE** `V272_CHARGES_ENABLED=false` immediately after POST method admission, before session lookup, database access, checkout-intent mutation or outbound Flutterwave call. V272 is deliberately **not** a deploy-time environment toggle. Every POST reaching this handler returns `503 PAYMENT_HOLD / commercial_checkout_not_released`, no database or provider side effects.
2. Preserve `verify_jwt=true` on any deployment and the existing hard-disabled website checkout. Do not remove Auth, payment, private-kernel, cron or capital checks.
3. If the guard is explicitly released in a future independently approved version, require fresh final readiness without DB incident, signed billing parity/payment/active-entitlement gates, two time-separated successful private runtime records, positive USD prices and trusted HTTPS Flutterwave checkout links. Harden reuse of stored old checkout URLs.
4. Register and test strict fail-closed source ordering and redacted operations evidence in GitHub, and verify the Supabase deployed function code/version following any release.

## Current Supabase incident
At roughly **07:12 UTC** read-only management SQL timed out. In a 15-minute log excerpt, literal word `timeout` appeared in 25 of 45 PostgreSQL events, 9 of 46 PostgREST events, 9 of 34 Supavisor events. These are log text-hit counts (not unique requests). The V180 private heartbeat still returned `KERNEL_SEAL` / `DATABASE_SEAL_TRANSPORT_TIMEOUT`. Public triage reported `DATABASE INCIDENT REPORTED`. No root cause or end-to-end recovery was verified.

## CURRENT SUPABASE DEPLOYMENT
Before V272 rollout: create-checkout v8 LIVE, older unguarded business logic (JWT still required). After any rollout, independently verify Edge metadata version, SHA/source contents, JWT settings and a non-charge test; never infer deployment from a Git merge. The existing Flutterwave webhook remains unchanged.

## Commercial launch remains on hold
This is **not a full commercial launch**. Before any reviewed activation: stable database and cron; authenticated login; two verified sealed private executions; provider plan and USD mapping; real signed payment/webhook and active entitlement proofs; renew/cancel/refund UX; subscription reconciliation; market data licensing; backup/restore verification and operator acceptance. Do not claim a charge, filed support ticket, or complete DB backup. Public research stays available independently.
