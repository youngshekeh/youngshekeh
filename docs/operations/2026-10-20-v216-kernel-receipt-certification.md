# V216 Production Kernel Receipt Certification & Database Incident

Date: 20 October 2026 UTC | Platform: THE FATHER ANALYTICS | https://thefatheranalytics.com

## Verified observations
- Production V215 Git SHA 3360a3d52a6bdf0fd69c2d6e153515aa11e77043 is READY on Vercel. This is not kernel health.
- The 19:10 UTC `V180_HEARTBEAT_FAIL_CLOSED` recorded `KERNEL_SEAL`, HTTP 503 after approximately 33.3 seconds; other cycles alternate between POLICY and KERNEL_SEAL.
- Supabase PostgREST repeatedly logs `PGRST002` schema-cache failures, SQLSTATE `57014` statement timeouts with `db-schemas=public,graphql_public` and `db-extra-search-path=public,extensions`.
- PostgreSQL logs at 19:08–19:13 UTC show simultaneous `cron job ... job startup timeout` events and statement timeouts. A prior read counted 58 configured active jobs with `cron.launch_active_jobs=on`; configuration is not proof that jobs successfully executed.
- Supabase Performance Advisor at 19:17 UTC identified 46 unindexed foreign keys and 153 unused indexes. These are performance review opportunities, not proof of the schema-cache incident root cause. Never drop an 'unused' index based solely on this advisory.
- Read-only management-plane SQL intermittently fails with connection timeout. This is wider than an individual REST endpoint and may require Supabase support or verified compute/connection remedies.

## V216 code change
Prior Vercel heartbeat treated the private Edge response with HTTP 200 and `body.ok=true` as a successful runtime cycle. But the private Edge may return `ok:true` for only SKIPPED_OVERLAP records, zero completed executions or backoff/hold; these are not positive launch evidence.

V216 requires a fresh (<=2 min) timestamp, a real DB seal with a declared verified transport, exact WAIT/0R and human-approval-not-bypassed governance, 1–20 owner records, exact owner-run count, unique run IDs, and every owner reporting SUCCEEDED/EXECUTE/HEALTHY. All missing, duplicate, pending, stale, unsealed, unverified or incomplete data fails closed with sanitized reason codes. Existing CRON_SECRET plus Vercel OIDC are required. The five-minute scheduler stays unchanged, as do Supabase functions, DB settings, existing entries, billing and capital.

## Operator actions (evidence gated)
1. Preserve the V215 backup, V216 source artifact and database logs as a support-ready incident dossier; do not include secrets or customer content.
2. Open the Supabase project's Database/Logs and API logs. Send support: region eu-west-1; project ref mpcelmjiycjpdyyflisn; repeated PGRST002/57014 with 25s authenticator timeout; management SQL sporadic connection timeout; cron startup timeouts; exact affected UTC intervals. Ask Supabase to assess database compute, PostgREST cache-generation query overhead and connection/transaction pooler health. Do not presume their infrastructure status label proves the data plane healthy.
3. Review pg_stat_statements high cumulative load and long-running transactions when management SQL is reliably available. Inspect 46 foreign key indexes individually before any concurrent index creation. Use a controlled staging/safe maintenance change reviewed for table size, disk headroom and lock risk. Never disable all cron jobs or RLS to create apparent availability.
4. Require two successive authenticated full V180 kernel runs with actual finished DB receipts, current Gold/markets freshness, successful member login and a controlled signed Flutterwave payment/entitlement/cancellation lifecycle before enabling the paid checkout. No automatic trade routing.

## Rollback
To restore previous V215 heartbeat behavior, revert only V216 GitHub files `api/ops-heartbeat.js`, `src/kernel-receipt-gate.mjs` and tests in a reviewed [deploy] commit and verify Vercel aliases. The newly stricter certification is a safety improvement; disabling it is not a recommended route to a commercial launch. No Supabase DB, Edge function, cron, RLS or billing migrations occur in V216.

## Supporting references
- Supabase database performance linter: https://supabase.com/docs/guides/database/database-linter
- Supabase Postgres timeouts: https://supabase.com/docs/guides/database/postgres/timeouts
- Repo: https://github.com/youngshekeh/youngshekeh