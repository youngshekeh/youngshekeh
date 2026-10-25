# V289.1 · Hosted Supabase service credential transport recovery

Date: 2026-10-25. Production function V289 version 61 launched but returned HTTP 500 on the single controlled smoke invocation (pg_net request 72397). The Edge error log showed `server_jwt_unavailable`. No new smoke agent run was produced. The prior legacy service-role JWT was unavailable in this deployed function.

## Correction
Use the hosted Supabase `SUPABASE_SECRET_KEYS` JSON's `default` opaque `sb_secret_` key for internal PostgREST calls with **only** the `apikey` header. If a genuine legacy `SUPABASE_SERVICE_ROLE_KEY` JWT is present, retain `apikey` plus `Authorization: Bearer <JWT>`. Never put opaque `sb_secret_` into a Bearer header. Reject publishable or malformed keys. This matches current Supabase's documented service-to-service key transport.

The secret is read only inside the Edge runtime, is never retrieved by ChatGPT, and is never committed, logged or returned to clients. The external caller still must supply the separate hashed, Vault-backed cron secret before incident checks or any privileged read. All incident-shield gates, nine-probe exact checks, 10-minute cooldown and WAIT / 0R governance stay unchanged.

## Verification protocol
- Pass full exact-head CI and nine-probe/credential contract tests.
- Before modifying Edge, verify live V61 source equals the V289 merged baseline.
- Deploy reviewed two-file bundle, retain `verify_jwt=false` because the handler verifies the cron secret.
- Run one controlled Vault-backed smoke request, inspect net response and real `agent_runs` record.
- Smoke only becomes `FRESH` after a completed, succeeded, actual nine-probe result and scheduled machine refresh. HTTP 200 alone is not a certification. If runtime still errors, stop and inspect logs; never insert success manually or relax commercial gates.
