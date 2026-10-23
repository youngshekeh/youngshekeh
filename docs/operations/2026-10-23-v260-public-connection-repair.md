# V260 | Public acceptance connection repair

Baseline: V259 production commit `5f3d423bf0356c8f45e8ccb95e8eeae1754fc560`.

The deployed status page showed readiness UNAVAILABLE and deferred Auth/billing even while management SQL, public Auth, and the existing private kernel recovered. Provider OPTIONS responses directly confirmed that `public-final-readiness` and `public-billing-acceptance` allow `content-type`, but the frontend sent `apikey`, requiring a CORS preflight those endpoints cannot authorize. Auth's public read does allow that header, so a healthy Auth service was hidden behind the failed readiness dependency.

Use one fixed-route anonymous public reader for status, access and checkout's public prechecks. Send only a simple GET with Accept; omit credentials, prohibit redirects and arbitrary paths, keep original timestamps and errors, coalesce overlapping requests, and bound reads to 18 seconds. Readiness itself has 15-second upstream deadlines, so the previous 6–7 second caller budget could also abort a valid cold response. No result cache or automatic retry was added.

Member-session Authorization and create-checkout authentication are preserved. Checkout's server-deployment lock remains false. Public observations cannot certify sign-in, current entitlement, broker quotes, private QA, or trading. Admission and release gates are unchanged.

Independent operational observations on October 23, 2026:

- Management SQL succeeded repeatedly. At 22:01 UTC the observed connection sample was well below max_connections=60, with no competing active queries. This does not establish the earlier outage's root cause.
- The database recorded consecutive SUCCEEDED V180 runs at 21:44, 21:49, 21:54 and 21:59 UTC. State was HEALTHY with zero consecutive failures. Recent receipts explicitly recorded no funds moved, trades sent, external execution or approval bypass.
- Cron history contained 95 successful completions in the preceding 30 minutes and no ended failures in the preceding 20 minutes. Existing schedules were preserved.
- External Auth health/settings responded 200; public Auth reported PASSWORD_AUTH_READY. Actual user sign-in remains unverified.
- Public billing acceptance responded READY_FOR_CONTROLLED_LIVE_TEST with active entitlement WITHHELD. Its separate older public billing status still reports BILLING_LEDGER_UNAVAILABLE. No payment or entitlement was created.
- Public final readiness still reports BUILD_HOLD for runtime_baseline and billing_preflight. Preserve those blockers.

Verification: add request-contract, allowlist, credential-isolation, concurrent-read, retry-after-failure, invalid-JSON and deadline regression cases. Add Chromium status → access → locked-checkout acceptance to the existing release workflow. Require all release checks and production READY before claiming deployment. Production browser acceptance must confirm Auth and billing observations display while launch/payment remain held.

Local validation passed 749/749 Node tests and the production build. The first CI attempt exposed an existing browser fixture failure: the 30-second Bitcoin receipt expired during a slow Chrome startup before its first response. V256/V257 fixtures now date that synthetic receipt when served. Production freshness policy and notification-deduplication assertions remain unchanged. CI must pass again after this harness correction.

Rollback: revert the shared reader, its three callers, and the regression/CI additions. No database, secret, Auth policy, cron schedule or Edge Function deployment is changed by V260.
