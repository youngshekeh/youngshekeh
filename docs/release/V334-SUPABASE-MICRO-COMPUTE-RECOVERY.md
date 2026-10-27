# V334 · Supabase Pro Nano → Micro Compute Recovery

**27 October 2026 · Review-only · Not deployed**

**Project:** `mpcelmjiycjpdyyflisn` (eu-west-1; PostgreSQL 17.6.1)  
**Public commercial status:** HOLD · **Checkout:** OFF · **Trading:** OFF · **Capital:** WAIT / 0R

## 1. What the real provider has established

Supabase support has inspected the project's instance metrics and specifically reported that it was **exhausting multiple resources due to load**. Their recommended remedy includes moving **Nano to Micro**, which they state can be done on Pro **with no additional charge**. They also recommend identifying the limiting CPU, RAM, disk I/O and expensive SQL queries, and consulting the index and performance advisers.

The current official [Supabase Compute and Disk documentation](https://supabase.com/docs/guides/platform/compute-and-disk) independently confirms the paid Nano/Micro **same rate**, Nano up to 0.5 GB RAM, Micro 1 GB RAM and baseline disk throughput / IOPS improvements (5→11 MB/s and 250→500 IOPS). The [Manage Compute usage guide](https://supabase.com/docs/guides/platform/manage-your-usage/compute) explains the Pro compute credit and warns compute changes incur downtime. Neither screenshot nor the connected project metadata verifies what tier the project **currently** is on; only the authenticated project Dashboard does. A sizing recommendation does not establish that resize has happened.

Support asks to look at CPU, memory, disk I/O and slow queries **after** the tier change. Scaling is likely the necessary first infrastructure remediation, **not a guarantee of permanent recovery** if query loops or connection contention persist.

## 2. Verified nonintrusive sample

At **2026-10-27 10:35:52 UTC**, a read-only SQL check returned **18 PostgreSQL sessions out of configured 60**. This is one instant, not a long-term utilization ceiling. Separate historical unified-log aggregation for **10:15–10:30 UTC** found **90 PostgreSQL logs** with 25 containing timeout text, 2 SQLSTATE `57014` and 19 `08006`, plus **9 PostgREST logs, all containing timeout text**. These messages are not counts of independent customer requests. The compute dimension is unavailable through connected Supabase `get_project`, whose project control-plane status remained `ACTIVE_HEALTHY`. The performance advisor timed out.

Sanitized reproducible evidence is stored at `docs/operations/evidence/v334-20261027-supabase-compute-support.json`. No sender name, screenshot, account identifiers, secrets or raw log text are stored.

## 3. Required project-owner action · without copying credentials

1. Open the exact project's **[Supabase Infrastructure settings](https://supabase.com/dashboard/project/mpcelmjiycjpdyyflisn/settings/infrastructure)**, using the existing authenticated session.
2. Read the **actual current compute tier**. It may be Nano (as suggested by support); do **not** infer it from project `ACTIVE_HEALTHY`. If already Micro or larger, don't blindly downgrade or duplicate the operation.
3. Open **Database → Backups** at [this project's backup dashboard](https://supabase.com/dashboard/project/mpcelmjiycjpdyyflisn/database/backups/scheduled), verify the latest available backup, the recovery point and restore limitations. Supabase's [backups guide](https://supabase.com/docs/guides/platform/backups) says Pro organizations are normally backed up daily for seven days, but this **does not prove the project's backup inventory is available**. Storage-file objects are not included in database-only restore.
4. In Infrastructure, select **Micro** **only if** Dashboard currently shows Nano and confirms the support-reported **no additional rate**. Read any pricing, downtime and warnings; do not select Small/Medium (which cost more), and do not create an extra paid Supabase project. Ensure an operator can monitor Auth, PostgREST and live user impacts during the resize.
5. Confirm there is a recoverable backup, incident owner, accepted downtime and rollback/restore plan before applying the change. Compute resize involves a database restart/downtime and may exceed Supabase's usual short interval. User confirmation in the Supabase UI is required. **There is no connected tool exposing resize** and V334 does **not** call the private management API to perform it.
6. After the UI actually reports Micro, inspect the new CPU/RAM/swap, disk I/O/IOPS, database dashboard usage, PostgREST worker timeouts, advisor findings and connection metrics. Distinguish the persistent resource bottleneck from one-off SQL successes.
7. Run **two separate** bounded `SELECT clock_timestamp()` checks at least one minute apart, a recent authenticated read-only PostgREST check, a complete 5–15-minute clean postgres/postgrest/supavisor log window and **two separate signed/sealed healthy kernel cycles**. Also confirm billing reconciliation and customer Auth, independently. An empty log source is UNKNOWN until genuinely queried; it is not a green state.

## 4. Review-only V334 code

`src/v334-micro-compute-upgrade-acceptance.mjs` creates two distinct evaluations:
- **Preflight** checks exact project ID/status, an actual Dashboard-attested Nano tier, Pro same-rate owner billing confirmation, the project's own verified backup and recovery impact and explicit maintenance/rollback approvals. At best `OWNER_REVIEW_POSSIBLE`. It never resizes automatically.
- **Postflight** requires independent Dashboard-attested Micro state, preflight evidence, the cumulative V329 **complete clean logs + two SQL + authenticated REST** check and two **distinct, 4+ minutes apart** signed/sealed kernel health receipts. At best `POST_RESIZE_REVIEW_CANDIDATE`. Checkout, trading, automatic restore and automatic commercial activation remain OFF in every result.

`tests/v334-micro-compute-resize-acceptance.test.mjs` contains 19 contract scenarios, including missing tier, missing backup, unexpected prices, duplicate fake kernel receipt, one good SQL sample with remaining PostgREST timeouts and immutable WAIT/0R. `scripts/v334-compute-support-preflight.mjs` prints an offline fail-closed redacted checkpoint for the actual verified information. Both run in cumulative GitHub CI with V317–V333 tests.

## 5. Independent commercial conditions

Even a successful Nano→Micro change is **not a commercial launch**. Verify trusted buyer payments and signed Flutterwave sandbox, unresolved billing reconciliation incidents, authenticated owner AAL2, project backup recovery, data ownership/RLS and live Gold/Oil/DXY/BTC licensed provenance. A real Windows MT5 first broker tick (currently unverified) and trade permission remain separate. The existing on-branch browser load spreading (V332) and delta-only cloud writes (V333) are also **review-only**, not deployed.

**Production V311 remains untouched, commercial HOLD, checkout/charges OFF and capital WAIT / 0R.** This plan does not promise an ETA, perform asynchronous work, change capacity or incur any new compute charges.
