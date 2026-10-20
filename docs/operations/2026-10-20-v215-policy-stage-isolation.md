# V215 Policy Stage Isolation | 2026-10-20

## Why
Production V214 kernel heartbeats alternated between KERNEL_SEAL and POLICY failures (18:40 through 18:55 UTC). PostgREST has repeated schema cache PGRST002 / 57014 timeouts. The V180 private kernel currently rewrites the same DEFAULT_V180 policy through REST every five minutes, before attempting lease/ledger operations. Management SQL confirmed existing DEFAULT_V180 with positive bounded thresholds, last updated 08:20 UTC. The policy table has RLS enabled, and the SQL transport is already privileged. This release only ADDS an owner-scoped READ of an existing policy; it does not write over it through the privileged SQL connection.

## Change
- Once existing OIDC/service role authorization, a positive database security seal and owner selection have passed, verify the existing DEFAULT_V180 policy via one prepared-statement-disabled, owner-parameterized, single-connection SQL pooler read (4s connection, 9s request deadline and cleanup).
- Return the exact stored policy ONLY if user ID and key match the caller and all five safety thresholds are positive integers. Invalid/mismatched policies fail closed, not replaced.
- If the policy row is missing or the pooler transport is unavailable, use the original authenticated REST upsert with original strict defaults. That path may still timeout and the kernel then stays closed.
- Existing run lock, recovery leases, V179 governance, run finish, auth, WAIT/0R and external trading firewall unchanged.
- Never claim that the full kernel is recovered solely because POLICY is bypassed: two real successful complete kernel cycles and DB receipts are mandatory.

## Evidence and rollback
The project reports a healthy configured schema set, authenticator statement_timeout 25s, notification queue usage 0 at one observation, with sporadic DB management connection timeouts and unproven provider health. V215 is a scoped reliability probe, not a cure for PostgREST schema reload overhead or compute starvation.
Rollback to V214 GitHub commit d083257a14c0e00c240c6364a9cefa4c72b0ee9a Supabase Edge source and Vercel matching version. Preserve verify_jwt=false only because V180 checks private auth directly. Keep all DB and cron job settings untouched. Do NOT enable checkout or trading.
