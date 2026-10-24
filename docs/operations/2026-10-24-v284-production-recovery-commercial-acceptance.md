# V284 · Production Recovery and Commercial Acceptance (isolated, no charges)

**UTC 24 October 2026.** Baseline V283 production commit `e6ecc24e63348c27d3b58306ecaaf7c028f4a1bf`.

## Verified live recovery checks
At 22:35–22:39 UTC several independent read-only Supabase `execute_sql` probes succeeded. PostgreSQL **17.6**, 18–20 connections (max 60), one active, zero lock waiters. **58** scheduled pg_cron jobs remained enabled. Last 45 minutes at 22:35 showed **104 succeeded, 0 failed**; last 10 minutes at 22:38 **23 succeeded, 0 failed**. Separate last 30 minute unified log sample recorded **zero text hits** for PGRST003, Supavisor auth timeout or pg_cron startup timeout in 264 PostgREST, 98 Supavisor and 176 PostgreSQL log messages. These are interval-limited observations, not proof the provider incident's underlying cause is eliminated.
Public Auth health/settings returned 200, but no real test account login or Google OAuth callback was performed. The live `public-final-readiness` was at one point `BUILD_READY_ACCEPTANCE_PENDING`; around 22:38, the deeper V66 observatory independently reported `HOLD` / data-plane degraded while V282 public recovery returned `RECOVERY_BLOCKED`. **Do not erase this inconsistency**. Two distinctly separated signed, private OIDC kernel receipts are not certified.

Read-only `command_ops_kernel_runs` counts from last 24h: **72 SUCCEEDED**, **19 FAILED**, latest successful finish 22:34 UTC; `command_ops_kernel_state`: one HEALTHY state with latest heartbeat 22:34 UTC, no dead letters; last 24h autonomous QA: 6 FAIL rows, latest 22:27 UTC. These are database operational observations, not sealed private-kernel certification.

## Authentic member access fix
Original member browser persisted Supabase Auth's access/refresh token in `sessionStorage` **BEFORE** calling private `member-session` and ignored its semantic `ok` flag: a 200 with `ok:false` could be displayed as authenticated. It also labelled a `limited` free/expired account as MEMBER. V284 fixes:
1. Get password Auth response, require valid token, verify exact current **member-session v12** response, *then* persist session.
2. Fail closed and clear browser session for malformed/negative/503 member responses; no local admin bypass, remote service role or elevated privileges.
3. Label free or expired accounts **LIMITED / FREE** and do not imply paid entitlement. Verify plan, server period_valid and future current_period_end for paid access; owner identity does not claim MFA.
4. Bound member private verification to 8s.
5. Standalone pure tests and local Chrome exercise unauthorized, limited, paid fixture, sign-out and owner/MFA checkout locks with **synthetic JWT only**. No actual account registration, password reset, owner MFA or Google OAuth performed.

## Payment metadata parity, actual PG17 integration
Read-only production `information_schema`, `pg_indexes`, `pg_constraint` and plan metadata now verify the actual tables, column types, unique transaction/reference/subscription indexes and plan prices:
Pro **$79**, Executive **$499**, Business **$1,500**, Enterprise **$5,000** per month (USD, recurring). Source snapshot: `docs/operations/evidence/v284-live-billing-schema-snapshot.json`, with NO provider plan ID, user IDs or transaction records. Isolated `tests/fixtures/v284-postgres17-prod-schema.sql` reconstructs relevant constraints and synthetic `auth.users`. New Github CI runs unmodified **V276** atomic initial fulfillment and **V278** atomic renewal together on disposable **postgres:17**, checking service_role privileges, all actual prices, replay, old $29 price rejection, rollback, canceled account and concurrent same-period renewal rejection.

This is a **live schema metadata audit + local synthetic provider tests**, NOT a real signed Flutterwave transaction, commercial license or full production mirror. Actual production SQL continues to have **zero installed V276/V278 candidate functions**, 1 historical paid checkout, 1 historical successful event and **0 currently future-valid paid terms**. Current webhook v7 retains a non-atomic legacy event→checkout→subscription flow. The provider period and signed renewal/cancellation/refund flows require separate reviewed migration and authenticated test. Do not change original records or charge anyone.

## Launch boundaries
Public research remains independently accepted by exact SHA smoke subject to honest source provenance and redistribution rights. Commercial paid access stays **HOLD** until strong sustained DB/Auth evidence, actual signed owner/member login, two healthy private sealed cycles >=60 seconds apart, confirmed provider billing HMAC/periods, entitlement/refund/cancel lifecycle, backup/restore and reviewed schema migration. No DB schema, cron, account data, Auth provider config, billing webhook, checkout permission, broker orders or production secrets changed. Capital remains `WAIT / 0R`.

Known limitation: interactive external browser automation was not available because connected provider reported zero wallet credit; rather than purchase anything, V284 includes independent real Chrome in CI using mocked responses. These are simulated login flows, not real production user authentication.
