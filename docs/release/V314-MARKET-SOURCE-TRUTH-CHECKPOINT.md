# V314 market-source truth and recovery acceptance

Date: 2026-10-27 UTC. This is a non-secret, review-only checkpoint. Source repository visibility is public. It contains no API keys, passwords, customer data, market price guesses, provider secrets, or database exports.

## Verified source
- Production deployment remains V311, hash `03fa474389fdf704bff1d0ab434840063a6a33c1`, READY when inspected. The V314 changes are **not deployed**.
- Source of V314: current `api/market-feed.js` still enforces a fixed list of public read endpoints, rejects arbitrary query keys, uses a 10.5 second bounded upstream deadline, does not use private service credentials, and retains the V281 feed pressure gate.
- Upstream Gold API can respond `ok:true` with `market_status: UNAVAILABLE` as a safe display fallback. Its aggregation derives a status from the oldest **present** Gold futures, DXY and Brent quote time. If a feed object is present but omits its `market_time`, it may be omitted from the age calculation. V314 prevents the proxy from presenting that as fresh market data.
- Gold futures, DXY and Brent are checked independently for positive finite price, ISO-parsable source quote time, no more than 30 minutes old, and no more than two minutes future-dated. For open-session responses, `generated_at` must be no more than three minutes old. V314 preserves delayed status and explicitly gates stale, unavailable, closed or unknown states.
- V314 changes only response-level classification and WAIT/0R safeguards. It does **not** create substitute quotes, rewrite quote timestamp fields, run a broker adapter, or approve capital.
- V314 dedicated tests: 11/11 successful on review head `c3fb9b213ac0ad8a4c02cbe6215e3e903780a57a`.

## Supabase and Vercel observation (one-time only)
- `command_kernel_seal_status()` independently returned `sealed:true` with RLS and WAIT/0R seal checks.
- Private kernel state recorded `HEALTHY`, 0 consecutive failures, 0 dead letters and a last success at 2026-10-27 02:19:48 UTC.
- Production Vercel `V180_KERNEL_HEARTBEAT_SUCCEEDED` logged 2026-10-27 02:19:48 UTC with 1 owner processed and 1 certified successful run. Earlier V180 HTTP 503 still appears in the historical error cluster; do not confuse historical errors with present runtime state.
- Succeeded `pg_cron` SQL scheduling alone does not establish successful downstream delivery. Continue monitoring for relapse before admitting production commercial use.

## Remaining release gates
- [ ] Cumulative V313/V314 exact-head full CI and production build confirmed.
- [ ] Real browser UI test for delayed/stale/closed Gold, Brent, DXY, BTC and model-state labels.
- [ ] Sustained kernel health at multiple intervals with live OIDC and sealed receipts; do not infer from SQL-only success.
- [ ] Authoritative and legally permitted feed coverage and freshness for Gold spot/futures, Oil, BTC and DXY verified.
- [ ] Auth owner MFA, entitlement RLS, signed payment webhooks, charge idempotency and test checkout verified.
- [ ] Provider backup existence, retention and isolated restore verified.
- [ ] Review rollback plan and deployment gate. Production release only on explicit reviewed `[deploy]` promotion.

## Immutable safety boundaries
Commercial HOLD. Capital permission 0R. Action WAIT. No actual live orders, fund movement or payment activation. Preserve all existing engine modules, security seals, schema, schedules and payment locks. Do not start Nebius compute or schedule provider restarts as part of this review-only fix.
