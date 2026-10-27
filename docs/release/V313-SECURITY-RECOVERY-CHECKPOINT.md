# V313 security and recovery acceptance checkpoint

As observed 2026-10-27 approximately 02:13–02:15 UTC. This checkpoint contains **no credentials, tokens, database exports, private receipts, or customer data**. It is not a database backup and does not declare the machine fully recovered.

## Production boundary

- Production Vercel: V311, commit `03fa474389fdf704bff1d0ab434840063a6a33c1`, READY at inspection.
- Supabase control plane: ACTIVE_HEALTHY. SQL was reachable with PostgreSQL 17.6; 15 current connections during sampled query.
- Sampled cron jobs 13, 16, 17, 39 recorded recent successful runs as of 02:14 UTC. The 12-hour sample also contains prior failed runs; successful cron dispatch does **not** certify downstream processing or receipt integrity.
- Public heartbeat application recorded HTTP 503 from a private kernel on 2026-10-26. This must remain fail-closed until exact signed execution receipts verify recovery.
- Security advisory: 143 informational RLS-enabled tables without policies (deny-by-default, no automatic policy changes). Of 122 public-schema SECURITY DEFINER functions, 0 were EXECUTE-accessible to `anon` or `authenticated` in the sampled SQL privileges.
- Database incident and fresh-market-source, authentication, billing and private-kernel end-to-end certification remain open.
- **Commercial launch: HOLD. Trading: WAIT / 0R. Checkout: disabled.**

## Non-disruptive V313 changes

1. Add repository-level tests of CSP, transport protections, private-page cache/indexing, cron secret + OIDC, sealed receipts, WAIT / 0R and explicit production deployment opt-in.
2. Add an unprivileged GitHub Actions workflow with read-only repository permissions, no service secrets and no automatic production deployment.
3. Preserve source tree, all existing migrations, RLS policies, existing scheduler configuration, live runtime and payment locks. No schema changes, endpoint invocation, secret rotation, fund movements, deployments or broker actions in this V313 branch.

## Release gate (must satisfy all before commercial activation)

- [ ] Branch tests and existing full CI pass on the exact reviewed head.
- [ ] Production smoke, mobile browser and auth/owner MFA tests pass in the intended environment.
- [ ] Supabase stability: sustained SQL, Auth, network and scheduler successes without recurring timeouts; provider incident closure or documented mitigation.
- [ ] Private kernel: signed, recent valid receipts and monotonic state proven end-to-end; no 503 failure loop.
- [ ] Gold, Oil, BTC and DXY: permitted sources, timestamps, freshness, truthful delayed/stale display and graceful fail-closed states.
- [ ] Auth and entitlement boundaries, webhook signatures, idempotency, payment-schema parity and a verified end-to-end test payment.
- [ ] Inspect backup availability and restore points in provider; perform a safe restore test in an isolated environment before claiming disaster recovery readiness.
- [ ] Production stage, test, review, explicit [deploy] commit, and post-deploy observability. No blind promotion or bypass of HOLD.

## Handling

Never add keys, tokens, database dumps, customer identifiers or confidential provider logs to this public repository. Backup and restore evidence must be kept in restricted provider-managed storage. This checkpoint alone does not certify an offline backup or restore.

## Evidence boundaries

Checks in this document refer only to the single samples listed; a successful SQL query or pg_cron status does not establish full autonomous engine health. Re-run exact-head tests and verify private receipts before changing the launch verdict.
