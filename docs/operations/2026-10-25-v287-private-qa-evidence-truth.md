# V287 • Private QA Evidence Truth (2026-10-25)

## Scoped source evidence (read-only)
- V286 production ref: `f8b8f418091f617472fba37ace81dc4be511b0f8`.
- Last full private matrix: **2026-10-24 23:27:14 UTC**, V205, **77 passed / 30 failed / 107 total**. Retain the failure count.
- Repeated October 25 `v78-unknown` **0 passed / 1 failed / 1 total** records contain empty tests and represent private transport failures, not full QA reruns.
- Full-matrix failures include upstream `v116_vercel_workload_identity_transport` (HTTP 503), plus dependent provenance, registry, Gold research and source checks with missing fields. These are still 30 failures; grouping dependencies never converts a failure into a pass.
- Live DB and agent runs are observable; neither is proof of OIDC release certification.
- Gold snapshot tables last populated on the Friday session. Recheck on open market; Sunday inactivity does not itself establish failure.

## Changes
- Add a pure presentation classifier that separates *deferred*, *HTTP transport failure*, *synthetic one-check transport record*, *complete but uncertified QA matrix*, and *unverified/malformed payload*.
- Existing `/status` displays the classification when the authoritative launch gate does not certify the QA. This change makes **zero extra QA calls**.
- Existing strict `evaluateLaunchReadiness` remains unchanged. No release gate or paid entitlement is granted by a diagnostic status.
- Existing `/api/autonomous-qa-matrix` OIDC, preflight, cooldown, private API and homepage restrictions are unchanged.
- Paid checkout remains locked (`V272_CHARGES_ENABLED=false`, `CHECKOUT_SERVER_GUARD_DEPLOYED=false`); orders remain WAIT / 0R.

## Acceptance and next steps
1. Run pure unit tests for all five classifications and preservation tests for V285/V286.
2. Run exact-head CI and Vercel preview (if available). Only then consider deployment after a separate production decision.
3. Diagnose 503 from the provider and capture *two independently signed OIDC private kernel receipts* at least 60 seconds apart. Until verified, private certification remains HOLD.
4. During next market session validate independent market sources and source age. Do not label historical as execution-grade live.
5. Keep the immutable 107-failure matrix and synthetic errors distinct, and require signed payment/entitlement lifecycle before full commercial release.

This is an observability and truthfulness patch, not an OIDC infrastructure repair, not a completed private 107-test pass, and not a commercial release.
