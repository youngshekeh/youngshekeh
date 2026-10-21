# V223 | Public market read pressure safety and continued database incident

Date: 2026-10-21 UTC. Scope: deployed frontend/API read path only, not a database or cron repair.

## Independent incident facts
At 2026-10-21T04:30:19.194Z Vercel recorded V180 private kernel 503 / KERNEL_SEAL. In Supabase unified logs scoped to 03:00–05:00 UTC (queried near 04:36 UTC), PostgREST had 30 PGRST002 and 20 SQLSTATE 57014 messages, while Postgres had 196 cron job startup timeout entries. SQL management connection query timed out. These log counts are evidence of failures, not evidence of one specific root cause.

## Change and safety
- The public /api/market-feed allowlist and request method guards remain unchanged.
- Upstream JSON bodies explicitly returning ok:false now yield HTTP 503 rather than being rewrapped in HTTP 200.
- Per Vercel process, concurrent GET requests for the same feed are single-flight. Read-only successes are briefly cached: Gold 1s, other feeds 15s; paper broker quote intake never cached. Failure cooldown is 4s and always fails closed, never serves stale past success.
- Upstream timeout is bounded to 7.5 seconds instead of 10.
- Gold V222 evidence validation still inspects upstream timestamp and bid/mid/ask; cached HTTP success is never a fresh-tick certificate.
- In-memory coalescing is per-instance, not distributed. This release does NOT resolve PostgreSQL saturation, pg_cron worker exhaustion or PostgREST schema-cache failures. Do not infer an overall recovery from its Vercel READY status.

## Release acceptance
Run `node --test tests/v223-public-feed-pressure.test.mjs tests/v222-public-gold-launch.test.mjs tests/launch-readiness-gate.test.mjs`, then require all CI checks and exact Git SHA Vercel production confirmation. If any regression, leave branch unmerged.

The commercial website remains paid-checkout locked. No trade orders, payment charges, credential changes, cron edits, Postgres DDL or production deletes are included. Next urgent provider action is Supabase support investigation of 57014 and PGRST002 plus pg_cron startup contention without global cron shutdown. Independently verify kernel receipts, OIDC-backed private QA, public Gold and payment entitlements before certified commercial launch.
