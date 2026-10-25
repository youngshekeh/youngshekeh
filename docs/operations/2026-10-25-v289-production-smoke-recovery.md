# V289 real production smoke recovery (2026-10-25)

**Scope:** Recover the disabled production smoke verifier only. Do not conflate a scheduler enqueue with a completed smoke test, and do not mark paid entitlement, broker quotes, private OIDC/kernel, or the 107-check private QA certified.

## Confirmed root cause
- The active production `production-smoke-sweep` Edge function, version **60**, is a static load-shed placeholder. It returns HTTP 200 with `ok:false` and `LOAD_SHED_DB_RECOVERY`, and performs **zero** smoke probes or audit writes.
- Cron job 30 remains scheduled every 15 minutes; succeeding cron runs prove only the `net.http_post` request was enqueued.
- `agent_runs` has had no completed production smoke since **2026-10-07 22:21 UTC**. The latest then had 9/9 passing probes; one later run remains incomplete.
- The machine's `refresh_autonomous_machine_state` requires a completed `agent_runs` `production_smoke_sweep` status `succeeded` within 60 minutes to set `smoke_state=FRESH`. Failed or absent completed runs leave it `STALE`.
- The public database incident shield was read as `ok:true`, `incident_active:false`, `postgrest:ONLINE`, `ALLOWED_WITH_BOUNDS`, with a current generated timestamp. A single positive response is NOT permanent permission to ignore new database incidents.

## Safe restorative diff
- Restore nine exact fixed smoke probes from the retained source: three public Edge cores, three anonymous auth-denial boundaries, and three short-timeout governed-store checks.
- Keep cron-secret SHA-256 authorization, 10-minute minimum interval, fixed upstream URLs and 2.5–3s request deadlines.
- Require **fresh** (within two minutes) explicit cleared incident shield with PostgREST ONLINE and bounded reads before starting any probe or new evidence write.
- Exact nine-probe validation: every HTTP status, result, kind, and path must match. Any failure is honestly recorded as `failed`, never `succeeded`.
- Prior failed smoke in cooldown cannot generate a green `skipped_recent` response.
- All smoke responses preserve `WAIT / 0R`, no orders and no paid certification.
- No migrations, schema/RLS changes, secret extraction, changes to schedules, automation permissions or execution privileges.

## Release protocol
1. Merge only after exact-commit CI, full regression and Chromium tests pass.
2. Confirm active Edge function remains static load-shed version 60; upload *only* the two reviewed files; keep existing `verify_jwt=false` because a hashed cron secret is checked server side.
3. Observe real scheduled invocation, corresponding `agent_runs` row and nine individual results before claiming any smoke recovery. HTTP 200 from pg_cron or Edge alone is not a pass.
4. Verify `refresh_autonomous_machine_state` eventually reflects the completed proof; a 503 or failing probe remains HOLD.
5. Roll back the Edge function to the exact original static load-shed code if provider pressure worsens; never manufacture a smoke record.

No private 107-test QA, payment checkout or live trading is enabled by this change.
