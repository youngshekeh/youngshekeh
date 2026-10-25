# V296 Private QA deadline-envelope correction | 2026-10-25

## Observed production symptom, not an inferred OIDC failure
The **2026-10-25 08:27 UTC** hourly QA request, `public.autonomous_external_probes.id=29273`, pg_net request 72504, HTTP **503**, returned the exact app reason `UPSTREAM_PREFLIGHT_TRANSPORT_UNAVAILABLE`. This occurred **before workload identity was obtained**, so the response alone does not establish bad JWT, OIDC issuer, signature or credential configuration. The V295.1 reconciler recorded `QA_TRANSPORT_UNVERIFIED`, opened the CRITICAL incident, and did not generate synthetic 0/1 QA rows. The prior genuine QA remains 77/107 pass and 30 fail.

The V285 private QA preflight allowed only **3500 ms** to fetch `/api/public-recovery-triage`, whereas that endpoint permits **9000 ms** for its public-final-readiness upstream and has a Vercel `maxDuration:20` setting. A cold, healthy diagnostic can therefore exceed its caller deadline. The DB hourly pg_net `http_get` used a separate **20000 ms** hard timeout, shorter than worst-case preflight + 30-second private backend request. Cold-path scheduling mismatches are verified from live source; the actual 08:27 internal latency is not known.

## Reviewed bounded fix
- `QA_PREFLIGHT_TIMEOUT_MS=10500` (9s cold source + 1.5s transit). Still **one** source-bound, read-only, unauthenticated GET; no fallback, no retries, no incident bypass.
- Private upstream QA fetch still **30000 ms**, concurrency and pressure circuit unchanged, negative cooldown **60s**.
- Scheduled `public.enqueue_v78_qa_probe()` pg_net HTTP timeout raised **20s → 45s**, at **one request per hour**. Only this literal changes in a separate `CREATE OR REPLACE FUNCTION`; the endpoint, SQL security definer, stable search_path, EXECUTE roles, schedules and external probe audit are retained.
- Vercel QA handler `maxDuration:50` explicitly caps one worker. `QA_PREFLIGHT(10.5s) + QA_UPSTREAM(30s) + 4s <= PGNET(45s)`, and 4s additional reserve to Vercel(50s). This is a bounded execution envelope, not permission for extra work.
- Full 107 QA may remain FAILED after transport succeeds; missing engine fields and private OIDC semantics still require independent evidence.
- Production smoke **8/9**, licensed Bitcoin display hold, paid checkout HOLD and trading WAIT/0R remain unchanged.

## Release gates
1. Exact-head full GitHub tests, Chromium and checked-in critical public safety contracts pass, with change restricted to V296 source, configuration and preexisting enqueue-function literal.
2. Merge with Vercel `[deploy]` marker so website QA handler is actually built and promoted. Vercel production must be READY with exact SHA and public domains.
3. Before Supabase migration, exact live `pg_get_functiondef()` equals checked-in rollback source (ignoring trailing whitespace); SQL grants only postgres/service_role, no current severe DB incidents, hourly job 59 and 60 still active unchanged, and `pg_net.max_timeout_ms` permits 45000 (when configured).
4. Apply only the reviewed enqueue function; verify exact post-deploy definition and roles, no scheduler changes, report actual tests.
5. If transport is admitted, one controlled real QA request may be performed only after incident/load preflight and well outside scheduled probe execution. Do NOT flood expensive private QA; waiting for hourly automatic recurrence is safer during DB instability. An HTTP 200 by itself is not QA certification.
6. If blocked, report 503/timeout truthfully. Do not insert synthetic QA results or relax 107 semantic assertions.

No market-data entitlement grants, payment activation, broker live routing, funds, capital permission, hidden secret access or automation pressure increase beyond one bounded hourly request.
