# V222 | Independent public Gold launch evidence

Date: 2026-10-21 UTC. This is a fail-closed source build, not a production recovery declaration.

## Why
Production V221 was READY, but Supabase observed PGRST002 at 2026-10-21T03:50:18.829568 UTC, PostgREST 57014 at 03:39:27.539753 UTC, and authenticated V180 runtime heartbeat failures through 03:55 UTC. A management SQL probe terminated because of connection timeout. READY alone is a deployed preview, not certified launch.

## V222 scope
- Public status probes Gold independently using the existing allowlisted no-store endpoint /api/market-feed?feed=public-gold-live-xauusd.
- Gold launch certification accepts only a positive HTTP response plus BROKER_LIVE state and real numeric, ordered bid/mid/ask with independently recent observed_at (5 seconds, at most +1s skew) and numeric quote.age_seconds (0–5 seconds).
- A spot reference can remain visible on the research surface, but it never passes broker-live commercial Gold acceptance.
- Inability to get a quote, upstream errors, stale timestamps, and malformed/zero prices all fail closed.
- The existing auth, Vercel OIDC, private QA, V180 consecutive-receipt and real entitlement checks remain mandatory.
- Commercial checkout stays hard locked until separately reviewed server-side guard deployment and signed provider end-to-end tests. WAIT / 0R persists.

## Verification
`node --test tests/launch-readiness-gate.test.mjs tests/v220-entitlement-launch-proof.test.mjs tests/v222-public-gold-launch.test.mjs`.

This patch does not change Vercel cron cadence, Supabase schema, PostgREST settings, secrets, billing, trade permissions or production records.

Operator acceptance remains blocked by live database recovery and separate verified cron success, two independent V180 sealed run receipts, live Gold data, OIDC-backed QA, auth lifecycle, and payment-to-entitlement tests. Human-reviewed evidence is required for full certified launch.
