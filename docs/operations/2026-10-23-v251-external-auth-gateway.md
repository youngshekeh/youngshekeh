# V251 · Independent Supabase Auth network-path diagnosis

Date: 2026-10-23. Production route: `/api/public-auth-gateway`; manually initiated from `/status/`.

## Why this exists
At 13:43 UTC the private V180 kernel continued returning HTTP 503 at `KERNEL_SEAL` because both PostgreSQL pooler and PostgREST transport checks timed out. Direct Supabase SQL management calls likewise failed connection timeout. Meanwhile the separate public Auth Edge probe returned `AUTH_UNAVAILABLE` because its two **internal** `/auth/v1/health` and `/auth/v1/settings` calls each exhausted a 2-second budget. Thus Auth itself may be down **or** only the internal Edge-to-Auth path may be unavailable. We cannot infer sign-in status from these facts.

## What the code does
- Adds a fixed-origin, read-only **Vercel server-side** diagnostic endpoint contacting precisely `https://mpcelmjiycjpdyyflisn.supabase.co/auth/v1/health` and `.../settings` with an existing **public publishable API key**. Does not connect to the database and never uses a service-role key, Auth password, refresh token, browser cookie or arbitrary user-provided hostname.
- Calls both URLs concurrently with individual 4.5-second budgets; output is a limited whitelist: HTTP status/transport result, boolean public email/Google provider advertisement, source timestamp and explicit non-certification truth. Original settings JSON, secrets and private identity fields are never returned or logged.
- Server module caches the outcome for 60 seconds with in-flight deduplication. Non-GET => HTTP 405. This endpoint is independent of the troubled Supabase Edge service but not independent of the broader Supabase Auth backend.
- The status page offers a *manual* `CHECK AUTH NETWORK PATH` control rather than polling automatically. It displays external network evidence with **NOT SIGN-IN CERTIFIED** and never influences existing `auth`, `billing`, `kernel` or `launch-gate` acceptance.
- Both successful health + settings only mean `AUTH_ENDPOINTS_RESPONDING`, not that sign-up, password reset or Google sign-in works. In the absence of full authenticated browser-journey evidence, stay **BUILD HOLD**.
- Strict fallback: timeout/401/500 => distinct diagnostic statuses and no false green.
- Node tests require fixed allowlisted URLs and only public keys, authentic source provenance, no secret exposure, no account/payment assumptions and no trading.

## Runtime acceptance
1. All GitHub Actions, V241–V251 tests, full repo regression and app build must pass; deploy exact tested commit to Vercel.
2. Inspect `GET /api/public-auth-gateway` on production. Compare **external** results to existing `public-auth-runtime-check` (the internal Edge vantage). Never collapse them into one readiness boolean.
3. If Vercel external succeeds but Edge internal fails, isolate Supabase Edge internal networking/timeouts; do not reconfigure or weaken Auth automatically.
4. If both fail, escalate upstream Auth/Supavisor infrastructure with the observed HTTP status/timeouts and timestamps.
5. Actual password/Google sign-in, password reset, active membership, payment authorization and read-only execution-grade broker quotes remain independently required before commercial activation.

No changes to pg_cron, SQL, infrastructure secrets, V180 seal, or order submission. Trading OFF / WAIT / 0R.
