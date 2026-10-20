# V207 Launch receipt and freshness gate

## Operational facts (20 Oct 2026)
- The public website is deployed; the core V180 heartbeat is not yet independently certified operational.
- V181 prevents an unavailable kernel from globally stopping unrelated `pg_cron` jobs.
- SQL confirmed the V180 security seal is valid and the database scheduler remains ON, but PostgREST repeatedly failed to load its schema cache (`PGRST002`, `57014`), and V180 reported timeout errors.
- A bounded and reversible 8s→25s change to the authenticator role's statement timeout (V182) did not immediately resolve the gateway issue. Rollback: `ALTER ROLE authenticator SET statement_timeout='8s'; NOTIFY pgrst, 'reload config';`
- A separate V206 production deployment introduced the public status truth gate. V207 extends V206 without replacing its independent checks and manual refresh.

## Absolute launch standard
A full launch must not be represented as certified until independent current evidence confirms: successful password auth, full public readiness with no hard or external blockers, nonempty zero-failure private QA, verified Vercel OIDC workload identity, actual completed provider payment and entitlement evidence, **and** a distinct V180 kernel-success receipt dated within 10 minutes. The kernel receipt must report `WAIT` and `0R`.

Status data older than 10 minutes, an unreachable service, an HTTP 200 with an error state, or a QA report lacking a kernel-specific success receipt must keep the release at `LAUNCH HOLD`. The public website may remain a preview, with degraded features clearly signaled.

## Next infrastructure actions
1. Examine PostgREST schema-cache startup and timeout errors with workload metrics, statement plans and retry pressure. Avoid global cron shutdown or unverified timeout increases.
2. Make the kernel's last completed success receipt available to the private QA endpoint through a bounded authenticated read-only path. Do not accept user-provided status or bypass RLS.
3. Verify at least two consecutive successful 5-minute V180 runs plus real completion of representative market, macro and alert cron jobs.
4. Verify Gold broker quote freshness, signal quality and source labels. Keep market data and trading execution separate.
5. Perform browser sign-up, Google login, password reset and real checkout smoke tests with operator approval. Do not create arbitrary charges.
6. Record explicit owner release approval and rehearse rollback before a mass public marketing launch.

No code introduced by V207 enables brokerage order submission or promotes capital permission.
