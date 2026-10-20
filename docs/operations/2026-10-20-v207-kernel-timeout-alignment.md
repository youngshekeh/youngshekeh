# V207 constrained timeout alignment

Observed 2026-10-20: V180 Edge gateway RPC aborted after 10s at `KERNEL_SEAL`, while Vercel heartbeat aborted the entire private request after 22s. Supabase authenticator reported `statement_timeout=25s` as of 16:45 UTC; earlier 8s. PostgREST continued logging PGRST002 / 57014 schema cache timeouts at 16:48 UTC, so **no recovery has been proven**.

## Change

- V180 retains constant-time credential comparison, Vercel OIDC probe, `command_kernel_seal_status()`, DB-backed begin/finish/lease, recovery limits, explicit WAIT/0R and no broker route.
- V180 REST read/write/RPC request deadlines are 25s, with seal-specific 22s. DB role settings and global scheduler remain untouched.
- Vercel private-kernel fetch deadline becomes 70s, bounded by the existing 90s function maxDuration and five-minute cron cadence. No parallel retry loop added.
- Not a repair for PostgREST catalog cache failures. Increasing transport deadlines could increase latency and serverless cost under sustained failure. Revert if this makes queue pressure worse.

## Acceptance

- Require two consecutive `V180_KERNEL_HEARTBEAT_SUCCEEDED` receipts, with seal present and actual successful recent DB cron results. Merely seeing a 200 site deployment does not count.
- Preserve `cron.launch_active_jobs=on`, `WAIT`, `0R`, and no external trading. Check PostgREST schema-cache error trend and query/load pressure.
- If PGRST002 persists, keep commercial launch HOLD and escalate database/catalog diagnosis rather than relaxing further timeouts.

## Rollback

- Vercel: revert bounded timeout change in `api/ops-heartbeat.js` to 22s in a new CI-verified `[deploy]` commit.
- Edge: re-deploy previous checked-in V180 `index.ts` version with Supabase MCP/CLI. Avoid changing `verify_jwt` (currently false because the function enforces its own OIDC and service-role authentication).
- Do not alter `cron.launch_active_jobs`, or trading permissions, as a rollback action.
