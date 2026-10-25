# V297 Production QA cause attribution without loosening certification | 2026-10-25

## Verified post-V296 evidence
- Genuine QA matrix #451: `2026-10-25 08:46:07Z`, `77/107`, `30 FAIL`. Exactly 57 planned probes were started, 0 not started, 0 deadline aborted, 0 pressure withheld, `transport.incomplete=false`. This is evidence of a completed measurement, **not** private engine health, OIDC user login, paid entitlement or commercial readiness.
- Transport-probe receipts in complete QA: `mission` HTTP 503 (~136ms), `productionClosure` HTTP 503 (~6051ms). Other named market routes generally returned HTTP 200 but many lacked expected healthy fields.
- The private mission-brief Supabase Edge function is **intentionally** deployed as `runtime-v115-mission-brief-load-shed-v1` with `state=LOAD_SHED_DB_RECOVERY`, `ok=false`, `usable=false`, `WAIT/0R`. Public Vercel `src/private-state-bridge.mjs` correctly translates this to 503 and never treats it as a healthy private-brain receipt. Missing mission fields explain several related QA failures, including the empty 44-module registry. Never construct fake registry rows or relax the existing identity/governance assertions.
- The `runtime-v115-oidc-probe` itself emitted multiple HTTP 200 logs during the full QA run. That does **not** establish customer login, contract approval, or all private scopes; it does disprove the claim that every failure is simply an unreachable OIDC endpoint. The QA's `v116_vercel_workload_identity_transport` is an **upstream mission-brief contract failure** while load shed is active.
- Production closure's 503 is separate: its output reports research not ready, paper true, live false, capital 0R. Restore only after actual upstream Gold market feed and required private admission receipts pass; changing the HTTP status or test expectations to green would be false.
- V295.1 QA reconciliation and V296 deadline repairs are independently verified; they do not turn these FAIL results into PASS.

## V297 scope
- Add `src/v297-private-qa-causality.mjs`, a **pure, zero-network** summarizer of the already-requested 107-check payload. It refuses absent 503 evidence, bogus 0/1 synthetic records, arrays with fewer than 100 tests, impossible summary arithmetic, non-boolean passes, and any capital permission other than 0R.
- It attributes HTTP 503 observations to the mission and production-closure dependencies and counts missing-value indicators, without asserting this is the only cause of all failed tests. No release result, OIDC assertion, QA pass, market price, or execution permission is changed.
- Integrate a short causal evidence label in `src/status.ts` **only inside the existing incident-aware admission flow**, with NO additional private QA requests or fallback probes.
- Preserve `src/v287-qa-observation.mjs`, full `evaluateLaunchReadiness`, membership locks, auth, Supabase schemas, cron, and all market-data source restrictions. No cost-amplifying auto-retry or background polling.
- Future safe recovery: design a private mission-brief lightweight cache/restore process that proves PostgREST and provider data rights, has a verified rollback, and only resumes its original workload after independent database and Edge acceptance. A previous full 124KB mission implementation exists in GitHub but makes broad HTTP/provider requests, so an untested direct redeploy is specifically disallowed here.

## Commercial acceptance
Full QA must pass with true 100+ case evidence and live signed identity; weekend BTC and market-source contracts need licenses; 9/9 smoke, payment/membership signed lifecycle, and live trading policies remain independent gates. This V297 release is a **diagnostic correction**, not the 30-failure cure.
