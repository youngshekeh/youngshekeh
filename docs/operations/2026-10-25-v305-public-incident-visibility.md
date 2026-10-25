# V305 · Automated public incident visibility without DB request amplification
Date: 2026-10-25. Production base: V304 code SHA 94bfe11d22082f29236b1d9c413cab50f3ada0e2.

## Verified incident
- At ~13:03 UTC the **public** `GET /api/public-recovery-triage` returned HTTP 200 with `state=DATABASE INCIDENT REPORTED`, `checks.database_incident_reported=true`, Auth HTTP transport `TIMEOUT`, PostgREST `HTTP ERROR 401`, and `WAIT / 0R`. These are network and incident observations, not a live SQL receipt or a successful login.
- Read-only Supabase SQL checks timed out twice, and `get_advisors` also timed out while checking project-user state. The original V304 source-pin migration was not applied; the previous attempted `apply_migration` failed *before running SQL* when migration-history initialization hit connection timeouts.
- The public website's Gold API returned a current **indicative** source observation and Bitcoin display remained LICENSE_HOLD. Neither price validates private autonomous compute, checkout or legal vendor redistribution.

## V305 change
- Existing `/status/` private release status already fetches public-final-readiness once and defers costly private Auth, billing and QA calls when the incident is reported.
- A new **prominent private database / release safety banner** consumes that same readiness response and conveys the current incident, verified absence of a reported incident, or unverified stale status. These are three distinct statuses; absence of a reported incident is never treated as SQL certification.
- Pure `classifyPublicDatabaseIncident` enforces HTTP ok, body ok, recent server timestamp and exact incident flag, returning `certified=false`, `commercial_launch_allowed=false`, `WAIT / 0R` under all conditions.
- No additional network request, private worker execution, database call, provider market-data dependency, deployment of the V304 SQL, cron edit, login, trade, money transfer or paid checkout operation.
- The banner includes a manual link to Supabase Support and continues to label the on-demand support packet as not submitted.

## Release acceptance
- Pass complete exact-head GitHub tests including Chromium, full regression and Supabase safety.
- Only the status page, its already-fetched readiness evidence, and pure tests are changed. Deploy via verified `[deploy]` production merge.
- Fetch the deployed `/status/` and its JavaScript asset to verify the banner is rendered, present in the production asset, and displays a fail-closed default even if JavaScript or Supabase fails.
- Existing private QA 77/107, smoke 8/9, Gold engine load shed, market licenses not commercially cleared, paid checkout HOLD, trading WAIT/0R.
- **This release does not fix Supabase infrastructure.** The required external dependency remains provider diagnosis of connections/cron workers and a reliable window to apply the V304 source-pinned repair.
