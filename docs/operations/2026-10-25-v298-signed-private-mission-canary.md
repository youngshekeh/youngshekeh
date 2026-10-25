# V298 · Signed Private Mission Recovery Canary

Date: 2026-10-25. Previous production release: V297 commit 40c31413730f4ad3657c974f593fbd852e458b53.

## Verified prerequisites
- Latest genuine QA: run #451 at 08:46 UTC 2026-10-25, 77 passed, 30 failed, 107 total. Fifty-seven underlying probes started, mission and production-closure routes returned 503.
- Database read-only diagnostic at 09:01 UTC: ONLINE, 16 connections, 1 active (query itself), 0 lock waiters; `public.status_incidents` had no rows. This does not certify all engine dependencies.
- The deployed `runtime-v115-mission-brief` is an explicit no-DB load-shed response `LOAD_SHED_DB_RECOVERY`; its archived 124KB implementation calls many external market data vendors and database endpoints. A direct restoration may cause pressure and could expose unlicensed public market-derived data.
- `runtime-v115-oidc-probe` provides cryptographically verified Vercel workload identity through owner/project/environment claims. Its signed protocol is reused unchanged.

## Fix: bounded admission and independent signed recovery canary
- Introduce `GET /api/mission-recovery-canary`. It first calls strict V285 public-health preflight, source-bound and read-only; if that fails, it never requests OIDC identity.
- On admitted preflight, obtains Vercel workload OIDC once. Makes exactly two parallel, 4.5-second GET calls: trusted Supabase OIDC verifier and existing load-shed mission endpoint. No retries, market vendor calls, PostgREST mutations, cron, backups, private QA, checkout or broker orders.
- Only an exact validated `VERCEL_WORKLOAD_VERIFIED` receipt and the existing `LOAD_SHED_DB_RECOVERY` response lead to `SIGNED_LOAD_SHED_OBSERVED`. This means signed identity works **while the mission remains intentionally unavailable**. An unknown, healthy-looking or unverified mission response is a fail-closed 503, not automatic restoration.
- Returns coarse no-secret output, requires GET, Cache-Control no-store, Vercel function 20-second cap. Uses best-effort per-worker 90-second in-process cache plus single-flight to reduce costs; not a global rate limiter.
- All response variants declare `recovery_certified:false`, `private_mission_restored:false`, `engine_registry_certified:false`, `merchant_certified:false`, `customer_login_certified:false`, `capital_permission:'0R'`, `commercial_launch_allowed:false`.
- Not invoked by homepage, status refresh, cron or QA; only explicitly requested operator canary. Old `/api/mission-brief` and all private Edge code unchanged.
- Zero Supabase schema, auth settings, Edge function, RLS, paid billing and live trading changes.

## Commercial and engineering gate
Merge only after exact-commit complete CI, full repo regression, safety tests and Chromium; Vercel merge must carry intentional `[deploy]` marker. Verify exact deployed commit READY for production aliases. Probe once from production and report **actual state**, not assumed success. Keep 77/107 full QA, 8/9 smoke, paid HOLD, trading WAIT/0R until independent acceptance.
The next substantive recovery requires a licensed, bounded mission implementation that sources real 44+ engine records without fabrication and passes complete private QA under healthy database conditions.
