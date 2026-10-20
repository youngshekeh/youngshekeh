# V208 Private SQL Pooler Seal Isolation

Date: 20 October 2026 UTC.

Problem: V207 kernel still fails the mandatory security-seal request after about 23 seconds because PostgREST is timing out during schema-cache reconstruction. Read-only SQL via management connections succeeds intermittently, and existing private seal infrastructure already uses a database pooler.

V208 changes only the way V180 verifies the mandatory database seal. It first calls the existing public.command_kernel_seal_status() function through the existing private SQL transaction pooler. Authorization through service-role credentials or Vercel OIDC still happens BEFORE SQL access. The pooler has a hard single-connection ceiling, four-second connect limit, nine-second application deadline, and forced cleanup. If the database explicitly says sealed=false, the kernel immediately fails closed. If the direct route is unavailable, the previous PostgREST RPC is used, still requiring sealed=true.

No new scheduler is created. No pg_cron change, DB migration, capital permission change, or live trade route is introduced. Subsequent owner/policy/ledger operations continue to use PostgREST. V208 therefore tests the isolation of the seal stage, not entire autonomous recovery.

Acceptance:
1. All PR CI workflows pass and deployed Edge source matches merged GitHub.
2. Confirm kernel logs show either SQL_POOLER_VERIFIED or the original PostgREST verified seal, and monitor next two heartbeats.
3. New downstream failure at LOAD_OWNERS is diagnostic progress, not proof of successful operations.
4. Only two consecutive real CONTINUOUS_KERNEL_ACTIVE receipts plus successful database job entries justify announcing backend recovery.
5. Rollback by deploying previous V180 kernel source from production GitHub commit 0871fd33671cbc4692bd6ec34fd6ef8861e0c9fe. Preserve verify_jwt=false only because this function already enforces its own private authorization.

No direct DB URL, credentials or raw connection error text may be returned publicly. Maintain WAIT/0R and external_execution=false.
