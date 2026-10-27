# V316 · Auth and payment fail-closed acceptance checkpoint

**Date:** 2026-10-27 UTC. **Scope:** Source-only, review-first. **Production:** V311 at `03fa474389fdf704bff1d0ab434840063a6a33c1`. This repository is public: do not add real authentication tokens, provider keys, user data, payment receipts or database exports.

## Independently confirmed, non-mutating evidence

- V315 cumulative review head `0ec1cdec821f60c9a3b7420282d2f8593f912eb3`: 76/76 GitHub workflows succeeded.
- Production V180 private heartbeat emitted one certified successful owner run at **2026-10-27 02:59:52 UTC**; database kernel state HEALTHY, consecutive failures 0, dead letters 0 in sampled SQL.
- Existing Supabase `create-checkout` Edge function v9 contains a hardcoded `V272_CHARGES_ENABLED=false`, checked before user authorization, checkout intent insertion or Flutterwave provider interaction. Source read-only inspection confirms the code structure, not a real POST or payment transaction. The browser separately keeps `CHECKOUT_SERVER_GUARD_DEPLOYED=false`.
- Current `member-session` Edge v12 supplies server-side membership and period verification; owner frontend requires a valid owner session followed by MFA AAL2 before private controls.

## V316 improvements

1. Remove unnecessary `refresh_token` storage from `src/member.ts`. Keep only the access token in same-tab session storage for the protected member-to-checkout handoff, after a successful server member-session verdict. This reduces persistent credential exposure without changing backend Auth endpoints, subscription plans or token validity rules.
2. Add deterministic Chromium tests for legitimate limited-member sign-in, invalid password, a spoofed/invalid member-session response, owner access denied to an ordinary member, payment HOLD with a planted session token and invalid checkout-plan denial.
3. Add Node regression guards for no browser refresh-token persistence, both front-end payment locks and pre-charge QA, and AAL2-gated owner capabilities.
4. Extend prior V315 GitHub Actions exact-source Vite+Chromium workflow with V316 tests. Tests use entirely **synthetic** credentials and intercept remote providers. No real authentication, provider orders or payments are initiated.

## Open gates, unchanged

- [ ] Latest V316 exact-head full repository CI and browser tests pass.
- [ ] Authenticated staging account test with a real, consenting member, including expiration, logout, recovery, MFA and server-entitlement RLS.
- [ ] Actual host-delivered private no-store headers after release, production domain and mobile acceptance.
- [ ] Flutterwave server billing parity, verified signed webhook idempotency and entitlements; test with legitimate merchant sandbox account only after explicit release authorization.
- [ ] DB backup location/retention and **isolated restore rehearsal**; this source checkpoint is not a database backup.
- [ ] Full market-source licenses and freshness across Gold, Oil, DXY and Bitcoin; OIDC private kernel sustained receipts.
- [ ] Formal reviewed production deployment/rollback and post-deploy checks.

**Immutable safety:** Commercial HOLD, checkout disabled in both current browser and backend, live trading OFF, action WAIT and capital permission 0R. No production deployments, source merges, database writes, Supabase function deployment, secret rotation or provider charges in this V316 PR.
