# V286 • Public Homepage QA Load Isolation (25 October 2026)
## Production source-of-truth before this change
- Public production: V285 commit `f3be63d6689f7e3382fe7696aa7128f241fce4cb`, Vercel deployment READY.
- Supabase project Postgres 17.6 reported `ACTIVE_HEALTHY`.
- At 05:31 UTC: 58 enabled cron jobs; 75 succeeded and 0 non-successful executions in sampled prior 30 minutes.
- Kernel SQL: HEALTHY, 0 consecutive failures, 0 dead letters, latest heartbeat 05:29 UTC. This **does not** equal two independently OIDC-signed private release receipts.
- Hourly V78 QA transport: most recent requests HTTP 503 at 05:27/04:27 UTC (03:27 timed out after 20 seconds). Synthetic rows labelled `v78-unknown`, 0/1 FAIL with empty tests are transport-failure records, **not** a new 107-test matrix.
- Last complete V205 QA matrix recorded 23:27 UTC 24 Oct: 77 passed, 30 failed, total 107, state FAIL. Do not replace or silently clear this failure ledger.
- Archived Gold snapshots last Friday 23 Oct; weekday-only captures explicitly use `*/5 * * * 1-5`, so Sunday inactivity is not by itself a bug. Independently updated Gold desk snapshots exist on Sunday but do not certify execution quotes.
- Active paid subscription terms remained 0; V276/V278 atomic candidates uninstalled, real flutterwave lifecycle not certified.

## V286 patch
Root cause: public homepage `refreshMissionExperience()` invoked costly `loadQaMatrix()` on boot and every 60 seconds for each visitor, while the same refresh already obtained a mission brief with an informational QA score. This can amplify a degraded provider and make traffic spikes worse.
- Retain all homepage market, quant, macro, six-desk and engine visuals.
- Retain source labelled mission brief refresh at 60 seconds.
- Preserve full QA implementation for development and existing precheck-gated `/status/` private QA path.
- Do **not** auto-request 107 private QA checks on public homepage. The extra development-only path is guarded by hostname localhost/127.0.0.1.
- The cheap score is *always* explicitly marked `NOT CERTIFIED`, even when a source score says PASS.
- Keep real-money checkout disabled, member auth unchanged, cron/RLS/database untouched, capital permission WAIT/0R.

## Mandatory launch follow-up
1. GitHub PR 247: require full exact-head-sha CI, legacy QA concurrency/backoff tests and new V286 tests. Do not merge on merely successful Vercel preview.
2. After a verified deploy, inspect exact production commit and domain alias, homepage and /status HTTP 200, sampled runtime errors, verified 60-second page refresh without `/api/autonomous-qa-matrix` fetch, and no payment unlock.
3. Diagnose the genuine 30 QA failures separately; collect signed private OIDC receipts twice >=60 seconds apart, real authenticated sign-in/MFA, source-freshness and signed billing lifecycle evidence. Commercial checkout stays HOLD.
4. If regression, roll back only to verified V285 deployment, without touching database, pg_cron or payment locks.

**No provider incident is marked resolved and no real charges/trades are authorized by this document.**
