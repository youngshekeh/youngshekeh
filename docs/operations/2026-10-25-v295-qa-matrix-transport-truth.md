# V295 · Production QA transport evidence integrity | 2026-10-25

## Confirmed incident
- Supabase cron job 59 `tfa-v78-qa-matrix` runs hourly at :27, and job 60 `tfa-v78-qa-reconcile` runs hourly at :29. Both jobs are active. The latter invokes `public.reconcile_v78_qa_probes()`.
- The exact live definition previously recorded a `v78-unknown` **0/1** fake matrix whenever pg_net returned 503/timeout/malformed responses. These were inserted into `autonomous_qa_runs` even though `tests=[]`, and overwrote the visible latest full 107-check QA. It also downgraded the incident to `important` because it saw only one fake failure.
- Example `autonomous_external_probes.id=29260`, request 72446 on 2026-10-25 07:27 UTC: pg_net timed out after 20,061ms. Reconciliation inserted QA run 450 at 07:29 UTC with `version=v78-unknown`, `passed=0`, `failed=1`, `total=1`. The previous genuinely completed run 449 at 06:27 UTC was **77 passed / 30 failed / 107** (real status HTTP 200), with failures dominated by 21 missing/`undefined` engine evidence paths. No fake pass was observed.
- Full automated production smoke separately remains 8/9, failing stale Friday (2026-10-23) combined market snapshot; this V295 patch does **not** cure it.

## Exact change and safety
- The checked-in `supabase/recovery/v295_qa_matrix_transport_truth.sql` derives from `pg_get_functiondef()` of the actual production function. It preserves the exact signature, `SECURITY DEFINER`, controlled search_path, trusted service-only grants, original cron frequencies, original full-matrix insert/ops semantics.
- Only record a QA matrix if HTTP 200 without timeout, version `v[0-9]...` not `v78-unknown`, summary counts are well-formed, a 100-1000-element test array exists and **individual boolean pass/fail counts exactly match summary**, an invariants object exists and capital permission is still `0R`. Never treat transport state or partial body as a full QA run.
- Missing/partial/timed-out 503 responses are reconciled into the pre-existing `autonomous_external_probes` row with `state=QA_TRANSPORT_UNVERIFIED`, `complete_matrix_received=false`, status and timeout metadata; **no new `autonomous_qa_runs` row**. The same existing `autonomous_ops_events` incident remains **OPEN/CRITICAL**, never marked as cleared by a 0/1 placeholder.
- The function return explicitly reports `transport_failures` and `qa_certified_by_reconciliation:false`. This is **not** a private kernel, QA success, customer entitlement, or market-data certification.
- Historic placeholder records remain unmodified, preserving the audit trail. Existing `autonomous_machine_state.smoke_state=STALE` and capital `WAIT / 0R` stay in place.
- Real 107-test evidence can still be recorded even when **failed**, and cannot be promoted into a commercial release without independent gates.

## Execution plan
1. Run exact-head CI, including V295 transport classifier and previous V287 QA-observation tests. Require full repo, Supabase release gate, Chromium and frontend to succeed.
2. Check no drift of live `pg_get_functiondef('public.reconcile_v78_qa_probes()')` against the backup checked into `supabase/recovery/v295_qa_matrix_transport_truth_rollback.sql`; verify function has service_role/postgres EXECUTE only. Check active severe database incidents before write; do not run this schema change during an incident.
3. Deploy **only** the one `CREATE OR REPLACE FUNCTION` from the audited SQL using the Supabase supported migration action. Preserve security definer and existing grants; do not alter cron schedule, RLS, roles or views.
4. Verify `pg_get_functiondef()` contains complete-matrix verification and the transport-only branch, no changes to function privileges, and security/performance advisor output. Read-only check `public.autonomous_external_probes` and `autonomous_qa_runs` after the next ordinary hourly reconcile; do not force high-volume 107-probe QA.
5. If migration fails or any public/private access changes, restore the exact separately checked-in rollback SQL only under a separate incident release gate. Historical QA rows must not be deleted or rewritten.

## Remaining certification gates
Private runtime needs actual OIDC/workload health and missing engine evidence repaired; root causes for 21 `undefined` failures remain unresolved. 100+ completed matrix status should be refreshed by the original bounded private QA, not invented. Paid checkout and live trading remain intentionally locked. Vendor rights for public market data remain unverified.

**Scope:** Data-integrity production repair; no frontend changes, no Vercel deployment marker needed, no paid checkout, live broker, market data, or trading permission modifications.
