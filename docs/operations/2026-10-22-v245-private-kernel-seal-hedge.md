# V245 · Bounded private kernel seal transport recovery (2026-10-22)

## Evidence
- At 2026-10-22 15:20:17 UTC, a read-only direct SQL call `select public.command_kernel_seal_status()` returned `sealed:true`, `version:v180.6`, and `wait_0r_preserved:true`.
- Scheduled V180 kernel health continued returning HTTP 503 with `stage:KERNEL_SEAL`, `DATABASE_SEAL_TRANSPORT_TIMEOUT`; production last seen 15:19 UTC. Project health was `ACTIVE_HEALTHY`, but intermittent management SQL connection timeouts and pg_cron statement timeouts persisted. 58 cron jobs were active.
- Thus the seal is present at one verification instant, but scheduled Edge connection paths are unreliable. This does NOT demonstrate continuous kernel health or that connection pool saturation is the proven root cause.

## Implementation
- Version 9 keeps the same verified SQL pooler, existing authenticated PostgREST RPC, authorization, owner/policy/begin-run/finish-run logic, bounded deadlines, and all WAIT/0R governors.
- Primary SQL starts immediately. If it produces `sealed:true` within two seconds, no extra REST call is made.
- If SQL stalls for two seconds, begin read-only REST seal RPC *in parallel* and settle both. Explicit `sealed:false` on either started lane is fatal, even when the other lane returns positive. A verified result from either supported database check is accepted only if no other started check explicitly denies the seal. Both unavailable => 503/fail-closed. If primary transport fails before the hedge, REST is attempted immediately.
- Worst-case seal transport budget becomes approximately max(9s SQL, 2+8s REST), rather than 9+8s sequential. This is a **latency and availability hypothesis**, not a guaranteed fix; it can increase concurrent read load only for slow SQL checks.
- No database changes, pg_cron scheduler edits, resets, credentials, trading, billing, QA or entitlement privileges changed.

## Release and rollback gates
1. Node tests must cover fast pooler, REST failover, negative database seal, conflicting dual-transport results, dual outage, and unchanged OIDC/trading guards. Require existing full repository CI and Vercel build to pass.
2. Deploy Vercel source code only after CI. Deploy private Supabase Edge function v9 from `supabase/functions/runtime-v180-continuous-kernel/index.ts` and `v245-seal-hedge.mjs` with existing `verify_jwt:false` because authorization is enforced in the function using OIDC/service-role. Never expose service credentials.
3. Check function version, scheduled heartbeat error codes, and certified consecutive kernel run receipts. If error rate does not improve or any negative seal is reported, retain fail-closed posture and consider restoration of version 8 source. Do not claim incident resolved from a single success.
4. Keep commercial checkout LOCKED, private kernel uncertified, and live orders OFF until all independent acceptance criteria pass. Public indicative Gold/BTC are not MT5 broker ticks.

Documentation: Supabase Edge Functions recommends pooled/serverless connections and the HTTPS Data API; automated retries under load can worsen resource exhaustion, so this change makes no uncontrolled retries. See https://supabase.com/docs/guides/functions/connect-to-postgres and https://supabase.com/docs/guides/api/automatic-retries-in-supabase-js.
