# V262 | Current launch observations and bounded recovery checks

Baseline: V261 production commit `74d04fcc43f3e54df33a983138031063b00e9ec8`.

## Verified trigger

The October 23, 22:49 UTC production readiness sample reported BUILD_READY_EXTERNAL_VERIFICATION_PENDING with no internal hard blockers. A separate runtime sample at 22:50 UTC reported BASELINE_READY. These are current samples after the V261 database repair, not proof of permanent recovery. The preceding fifteen-minute log sample still contained 17 PostgreSQL statement-timeout entries and no PGRST002 entries.

Source inspection identified three remaining release defects:

- V66 allowed only 2 seconds for the V69 database incident service, whose own PostgREST probe allows 2.5 seconds. The final readiness reader allowed only 15 seconds for V66, which allows 18 seconds for its production-integrity dependency.
- Final readiness treated a missing incident reply as clear (`incident_active !== true`). Missing JSON and absent source timestamps could also be treated as positive observations. Both aggregators cached results for five minutes and allowed an additional ten minutes of stale HTTP reuse.
- Final readiness used the older billing-status booleans. That source can report a historical successful transaction while the billing acceptance source still withholds current entitlement. The browser already requires current entitlement, so the two release summaries could disagree.

## Final behavior

The two public observers now share a fixed-route, credentialless GET reader. It rejects redirects and arbitrary/query targets, validates JSON and explicit source success, retains source timestamps, and bounds fetch plus body consumption. It adds no retries, cache busting or new private QA probes. Each observer retains single-flight evaluation and a short cache in the worker; responses prohibit browser/CDN reuse.

A database incident is cleared only by a current explicit V69 clear result with a successful PostgREST probe. Active, clear and unverified evidence are distinct. Missing or stale integrity/configuration is a hard runtime hold. Existing semantic market-data degradation remains PARTIAL and never grants trading permission. A readable zero-sample model ledger remains SAMPLE_BUILDING; no calibrated accuracy is claimed.

Failed summaries can refresh after at most 60 seconds. Other result caches retain bounded reuse, shortened whenever a passing source would expire first. Cached replies keep their original generated_at. V69 evidence is valid for 120 seconds; other final-readiness dependencies for 600 seconds. The runtime observer retains the prior 600-second integrity and 1,200-second config/model-evidence freshness limits.

Final readiness uses the existing read-only public-billing-acceptance receipt. Merchant preflight, verified live flow and active entitlement are separate gates. Historical receipts cannot pass current entitlement. External provider rate-limit verification remains UNVERIFIED_EXTERNALLY. Public observations cannot certify actual sign-in, MFA/AAL2, private QA, member access, broker execution data or full commercial launch.

The V69 request budget is 6.5 seconds, below the 22-second outer V66 read budget; the existing V50 integrity budget remains 18 seconds. Only the browser's final-readiness request gets a 30-second allowance. Auth and billing browser reads remain 18 seconds. The V261 private diagnostics and their database timeout remain unchanged.

## Deployment and rollback

Deploy public-v66-runtime-observatory first, then public-final-readiness, with their shared and local modules included. Both were already public with verify_jwt=false; preserve that setting and the GET/OPTIONS contracts (HEAD remains supported for final readiness). No authenticated endpoint, RLS policy, secret, grant, database function, job definition, schedule or stored data is changed.

Exact pre-change entrypoints are stored under supabase/recovery/v262-public-v66-runtime-observatory-rollback and v262-public-final-readiness-rollback. The adjacent deployment manifest records original versions and source/bundle hashes. Before replacing either service, compare its current source with that snapshot. Rollback redeploys only the corresponding original entrypoint with its existing public setting; refuse to overwrite unrelated later edits. Revert the frontend helper/admission change through a reviewed PR if needed.

Validation covers malformed/stale/future sources, contradictory incident/payment evidence, original timestamps, source-expiry cache bounds, failed-snapshot recovery, shared in-flight requests, request/body deadlines, CORS, HEAD, mutation denial and preserved payment/trading locks. Require the full Node suite, build, all release checks and the four Chromium acceptance flows before merge. Record exact deployment versions and fresh production observations in the release PR.

Local validation passed 775/775 Node tests and the Vite production build. The added suite contains 22 tests covering the new observer and client admission contracts.

The provider-owned cron history index review from V261 remains outstanding. Current entitlement, actual browser sign-in and broker-feed certification remain independent launch gates. No payment, entitlement grant, provider support message or live trade is created by V262.
