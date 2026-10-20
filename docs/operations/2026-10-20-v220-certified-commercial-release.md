# THE FATHER ANALYTICS V220 | Commercial Entitlement & Continuous Kernel Certification

**Date:** 2026-10-20 UTC. **Release scope:** strict read-only public launch decisions, public status transparency, no paid service activation.

## Observed recovery and remaining blockers

At 21:17 UTC, a Supabase read-only query confirmed six successful private V180 kernel runs in the preceding 30 minutes, latest at 21:15:33 UTC, with 58 configured cron jobs on and 54 recent successful cron receipts. These are real recovery signals.

The public billing function reported merchant credentials PASS, provider plan parity PASS, signed historical payment evidence PASS and paid checkout evidence PASS. It still returned `active_entitlement_evidence: WITHHELD`, `live_flow_verified:false`, and `READY_FOR_CONTROLLED_LIVE_TEST`. A historical Pro payment dated 2026-09-13 is not proof that today's webhooks, subscriptions, cancellation/refunds and active membership provisioning work end to end.

The auth runtime endpoint changed from AUTH_UNAVAILABLE to PASSWORD_AUTH_READY within a short interval at 21:20 UTC. The final-readiness state moved from BUILD_HOLD to BUILD_READY_EXTERNAL_VERIFICATION_PENDING, but `provider_rate_limit` remains externally unverified and the runtime baseline is PARTIAL. Independent PostgREST logs still returned SQLSTATE 57014 at 21:15 UTC. Inconsistent probes are not permission to launch.

## V220 exact requirements

1. `evaluateLaunchReadiness` now requires two or more **integer** consecutive successful authenticated V180 cycles (previously one recent receipt could appear green), still with a fresh completion timestamp, OIDC-backed QA and WAIT / 0R.
2. A green `billing` decision requires the same recent signed provider evidence as before PLUS explicit provider plan parity PASS, signed payment evidence PASS, active entitlement evidence PASS and LIVE_FLOW_VERIFIED state.
3. `planEligible` now requires these same provider and entitlement positive proofs before a plan can be offered for checkout, separately from a correctly verified USD plan price. Prices and eligibility are not the same thing.
4. The /status interface distinguishes observed processing from release certification and distinguishes provider preflight from verified entitlement. It still shows LAUNCH HOLD until all independent checks pass.
5. The browser checkout remains compile-time locked with `CHECKOUT_SERVER_GUARD_DEPLOYED=false`. The currently ACTIVE deployed Supabase `create-checkout` Edge Function is version 8, while the stricter reviewed server-side source is not deployed. Do not bypass the deployment safety restriction or enable payments based solely on positive website checks.
6. Market intelligence retains original freshness labeling and trading remains WAIT / 0R. No cash movement or order routing.

## Release verification

Run `node --test tests/launch-readiness-gate.test.mjs tests/v210-commercial-launch-guard.test.mjs tests/v220-entitlement-launch-proof.test.mjs`. Require all GitHub Actions workflows green, a Vercel production READY deployment with matching git SHA, and public page verification. Save the exact source SHA256 manifest and independent archive copy.

## Later controlled acceptance

Provider-side rate limiting confirmed; consistent Supabase/PostgREST recovery; production password/login/reset/Google OAuth tests; two or more real sealed kernel successes; current portfolio/macro quote provenance; signed Flutterwave webhook, authoritative active subscription record, member entitlement; renewal/cancellation/refund evidence; explicit owner acceptance of live billing. Only then may a separately reviewed server-side checkout guard be deployed and the website payment lock intentionally changed. Real-money trading requires separate approval beyond subscription launch.

**V220 neither charges customers nor changes RLS, cron, secrets, Edge deployments or database rows.** Roll back source with a reviewed GitHub revert if needed, preserving prior archive and authenticated platform resources.
