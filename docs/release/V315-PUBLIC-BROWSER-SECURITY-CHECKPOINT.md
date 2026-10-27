# V315 · Public Chromium and auth-entry cache security checkpoint

Date: 2026-10-27 UTC. This is a non-secret release acceptance note for THE FATHER ANALYTICS. It is **not** a production rollout, database backup, disaster-recovery certificate, or commercial launch approval. Source repository is public. Never place passwords, user-session cookies, paid-API keys, customer records, receipt contents or database dumps here.

## Grounded production evidence

- Public Vercel production deployment remained V311 at commit `03fa474389fdf704bff1d0ab434840063a6a33c1`, state READY, on the checked deployment.
- HTTP read-only smoke of `/`, `/live-markets/`, `/pricing/`, `/access/` and `/status/` completed with HTTP 200.
- Default CSP contained `frame-ancestors 'none'`, while the inspected production `/access/` response reported `Cache-Control: public, max-age=0, must-revalidate`, which was weaker than intended for an access entry. This was observed on the deployment URL, not inferred from a static test.
- Previous independent V180 kernel database and Vercel heartbeat checks showed successful private owner execution on 2026-10-27 at 02:19 UTC. This is a sampled recovery observation, not proof of uninterrupted 24-hour health.

## Proposed non-disruptive V315 hardening

1. Preserve all V313/V314 changes: restrictive CSP, authenticated OIDC heartbeat, execution-receipt verification, timestamp-derived market read states, broker and capital locks.
2. Add exact entry-path and slash-path `Cache-Control: private, no-store` plus `X-Robots-Tag: noindex, nofollow, noarchive` headers for `/access`, `/member`, `/owner`, `/checkout` and trailing-slash equivalents. Preserve existing deep-path rules and public route caching.
3. Verify the header configuration with deterministic Node tests (exact entry, trailing slash, deep paths, public paths, CSP/HSTS/frame policy).
4. Add pinned, no-secret Chromium rendering tests using built Vite source and synthetic read-only API payloads:
   - Unavailable Gold and Bitcoin references remain withheld.
   - Gold source reference is indicative only; Bitcoin end-user display remains on license hold.
   - STALE Gold, Brent and DXY prices do not render in dashboard cards, WAIT/0R remains displayed.
   - MARKET_CLOSED is visibly labelled and cannot unlock trading.
   - Desktop and 390px mobile route rendering, horizontal overflow detection.

## Test evidence and boundaries

- The **initial** V315 Chromium run succeeded across all five browser acceptance tests in GitHub Actions, prior to adding exact-route cache controls.
- V313 + V314 cumulative exact-head workflow previously passed 71/71, with 1054/1054 Node repository tests passing.
- A **new** exact-head V315 full CI run is required for the latest combined header, unit and browser changes before review acceptance. Do not reuse initial success to represent new head as fully verified.
- Chromium test fixtures deliberately intercept `/api/*` and never exercise private production credentials, paid market feeds, third-party domains, or payment actions.
- Header config source tests do NOT prove Vercel delivered new headers to production. After reviewed deployment, inspect actual response headers on canonical domain and deployed preview.

## Remaining commercial gates

- [ ] Latest exact-head full CI, browser acceptance and Vite production build passed.
- [ ] Deploy a reviewed staging build, prove `private, no-store` is emitted for access/member/owner/checkout roots and nested routes.
- [ ] Sustained private kernel OIDC + certified receipts; no recurring 503; actual data freshness for Gold, Oil, BTC and DXY.
- [ ] Source rights, broker market time, session state, stale data UI and low-bandwidth browser behavior.
- [ ] Owner MFA, user authentication, entitlement and RLS authorization, billing/webhook signatures and idempotent test checkout.
- [ ] Provider-managed database backup availability and isolated restore rehearsal.
- [ ] Explicit commercial signoff, approved [deploy] commit, rollback plan, and post-deploy error monitoring.

## Immutable controls

Commercial HOLD. Payments locked. Live trading OFF, WAIT / 0R. Preserve current production V311 while V315 is under review. No schema migrations, automated data recovery, pg_cron edits, permission escalation, key rotations, live orders, transfers, or provider restarts were performed by these V315 source changes.
