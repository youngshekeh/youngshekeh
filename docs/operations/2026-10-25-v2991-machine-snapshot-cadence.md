# V299.1 | Align machine-state evidence with proven 15-minute cron cadence

2026-10-25. V299 production commit cc681f3042e02addd8d68913be904190a05fd0b3.

## Verified live error
V299 live `/api/mission-db-evidence` at 09:21:30 UTC returned fail-closed 503 `SIGNED_DB_EVIDENCE_UNVERIFIED`. V298 independently verified signed workload identity. Supabase Edge log confirmed HTTP 503 from `runtime-v299-mission-evidence`.
A read-only SQL check at 09:21:51 UTC established `autonomous_machine_state.id=1` `updated_at=09:07:00.307781Z`, source age ~892 seconds. V299's 600-second freshness gate was *shorter* than the verified job 44 schedule `7-59/15 * * * *`: 07,22,37,52 minutes past each hour.
The 09:22 job completed `succeeded`, snapshot updated at 09:22:00.091342Z, 45 seconds old at 09:22:45 UTC. Past four runs also succeeded at 09:07,08:52,08:37; no indication job stopped. This is a **misaligned freshness policy**, not a known OIDC or database connectivity outage.

## Narrow correction
- In isolated new `runtime-v299-mission-evidence` and its Vercel gate, set `MACHINE_SNAPSHOT_MAX_AGE_MS=18*60*1000` (15m actual cron period + 3m scheduling allowance). Keep reporting the real exact timestamp and age, `refresh_cadence_seconds=900`, `snapshot_freshness_sla_seconds=1080`; reject a missed cycle at age >1080 seconds.
- The extra time applies only to autonomous **machine state**, not Gold, BTC, options, market quotes, or consumer-facing research. Do not fake a new `updated_at`, run the cron on demand, or relabel 15-minute-old data as a current tradable quote.
- All signed Vercel workload checks, Supabase Edge OIDC verification, one query, no money, WAIT / 0R, billing HOLD, original mission LOAD_SHED, and no registry certification remain unchanged.
- Tests verify acceptance of ages 900,1020,1080 seconds while rejecting 1081,1200,1800 seconds, future timestamps and forged source cadence.

## Gate and verification
Run exact HEAD comprehensive CI including Chromium and source-safety. Deploy only updated isolated `runtime-v299-mission-evidence` from verified source; do not redeploy original `runtime-v115-mission-brief`. Merge code with `[deploy]`, verify Vercel same production SHA and aliases, and read one bounded GET after the 90s per-worker cache expires. If it fails again, report exact unavailable state and stop instead of silently extending the SLA.
Private QA remains 77/107 and smoke 8/9 as of the latest observation. Commercial licensing/payment and live execution stay HOLD.
