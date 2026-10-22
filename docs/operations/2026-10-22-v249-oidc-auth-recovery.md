# V249 | Strict Vercel OIDC recovery after successful private-kernel cycles

October 22, 2026. Target: Supabase Edge `runtime-v115-oidc-probe` v4, `runtime-v180-continuous-kernel` v10; Github release plus Vercel site unchanged except deploy artifact.

## Source evidence
Production V248 Vercel runtime logs verified **seven consecutive certified successful V180 heartbeats** at 21:54, 21:59, 22:04, 22:09, 22:14, 22:19 and 22:24 UTC, each with one successful owner run. At 22:29 UTC the next heartbeat failed with HTTP **401**, `unauthorized_private_runtime`, after ~5.3 seconds.

The private kernel directly invokes `runtime-v115-oidc-probe`, which verifies the Vercel workload bearer against a JWKS cached for up to 15 minutes. The existing v115 verifier returned 401 for **both** invalid tokens and key-service fetch timeouts. From Vercel's published OIDC guidance, JWKS keys can rotate and the signing key must match token `kid` after cryptographic verification. The 401 alone does not prove the actual cause (key rotation, transient JWKS timeout or invalid workload token).

The Supabase SQL snapshot at 22:30 UTC found 21 sessions and zero lock waits; the private seal is known present, though database reliability has been intermittent. 58 active cron schedules remain untouched.

## Change
- Check for cached signing `kid`, refresh official Vercel team JWKS at most once when a key is missing; enforce `RS256`, official issuer, audience, subject, project, owner, environment, exp, nbf and WebCrypto RSA signature identically to v115.
- Distinguish JWKS network/invalid response as **503 AUTH_VERIFIER_UNAVAILABLE** vs **401 AUTH_REJECTED** for invalid cryptographic signature, issuer, tenant, audience, timestamp or still-unknown `kid`.
- Kernel v180 retries verification **only after an explicit HTTP 503**, once, bounded to two 5-second calls, with the existing bearer and strict `r.ok && verified` condition. It never retries 401 or silently creates a valid token. Missing authorization remains 401.
- Preserve the existing Supabase internal service-role mechanism, kernel security seal, run ownership/lease, private execution safety and WAIT/0R; no trading/billing/broker/cron database change.
- Add audited behavioral tests and staged deployment. This is a hardening candidate, not proof of OIDC being the historical root cause.

## Deployment and acceptance
1. Existing GitHub repo and V249 tests, complete regression suite, security and launch truth gates must pass.
2. Deploy first v115 Edge version 4 from reviewed `index.ts` + policy module using its existing `verify_jwt:false` (strict OIDC/self-verification inside function). Verify v115 status/route and deny anonymous calls before deploying v180.
3. Deploy V180 v10 using exact production Github files `index.ts`, `v245-seal-hedge.mjs`, `v249-oidc-probe-retry.mjs`; retain Edge `verify_jwt:false` and in-handler Vercel workload verification.
4. Validate real scheduled kernel receipts with original `CRON_SECRET + Vercel OIDC` credentials. **Never** send tokens to client/logs or fabricate a heartbeat. Collect multiple clean cycles. A single failure revokes continuous healthy assessment.
5. Full commercial release also requires verified live broker Gold bid/ask, active entitlements, full authenticated QA, and human approval. Trading OFF and WAIT/0R remain mandatory.

Vercel OIDC references:
- https://vercel.com/docs/oidc/api
- https://vercel.com/docs/oidc/reference
