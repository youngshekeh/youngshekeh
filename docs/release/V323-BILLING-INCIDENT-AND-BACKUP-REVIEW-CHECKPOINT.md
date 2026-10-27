# V323 · Append-only Billing Incident Evidence and Backup Acceptance HOLD

**Date:** 2026-10-27 UTC. **Draft:** GitHub PR #290. **Branch:** `security/v323-billing-incident-evidence-ledger`. Based on cumulative V313–V322. **Current production is V311**, unchanged.

## Operational evidence (production SQL, read-only)

- Supabase project `mpcelmjiycjpdyyflisn` is `ACTIVE_HEALTHY` on PostgreSQL 17.6, region eu-west-1.
- Private autonomous kernel independently `HEALTHY`, last sampled success 2026-10-27 05:24:47 UTC, zero consecutive failures/dead-letter count. This does not prove billing operations healthy.
- **Eight unresolved historical `public.agent_runs`** remain `running`, seven reconciliation and one subscription watch, with no completion markers. Production rows were never rewritten, marked completed or deleted by V323.
- Latest read-only moving 72-hour sample shows **34 reconciliation and five subscription-watch failed scheduler executions** classified timeout. The 72-hour cutoff changes naturally. Scheduler timeout is not a confirmed failed merchant payment. Earlier three-day samples included 35+5 as time shifted.
- Active `pg_net` worker and empty request queue observed previously. Global pg_net responses cannot be attributed to Flutterwave from aggregate figures alone; never disclose network headers, response contents, URLs, provider credentials or customer references.

## V323 scoped remediation: durable incident *evidence*, not payment activation

Review-only SQL `docs/release/V323-REVIEW-ONLY-BILLING-INCIDENT-LEDGER.sql` defines:
- `public.billing_incident_evidence_v323`: append-only `RLS ENABLED` table with deterministic source-scoped hashed evidence key, `stale_agent_run` or `cron_timeout` category, named billing component and observation time only. Its one allowed status is `open`; no auto-delete, auto-resolve or customer identifiers.
- `capture_billing_incidents_v323()`: authenticated by **service_role only**, reads existing billing agent and cron metadata, limits the scan to 200 candidates and explicitly reports truncation. Deduplicates via a primary key and `ON CONFLICT DO NOTHING`. Its *only writes* are INSERTs into the new evidence table. It does not update existing run records or call Flutterwave, local payment RPCs, Supabase Edge endpoints, checkout, subscriptions or the cron scheduler.
- `billing_incident_readiness_v323()`: **read-only**, private service-only status `HOLD` for any open evidence or stale agent records. Zero incidents returns `NO_RECORDED_INCIDENTS` only, never commercial permission.
- Each response includes `commercial_activation_permitted=false`.

Cumulative staged `docs/release/V321-REVIEW-ONLY-public-billing-acceptance.ts` now requires V321 completed-job evidence, V322 transport availability, and V323 incident-readiness before querying merchant plan parity. Any unknown or unresolved incident state returns `BLOCKED_UNRESOLVED_BILLING_INCIDENTS` and `ready_for_checkout=false`. Even all private gates passed leave `COMMERCIAL_ACTIVATION_RELEASED=false`; production checkout remains disabled separately.

**CI coverage:** `tests/v323-billing-incident-acceptance.sql` runs in an ephemeral PostgreSQL 17 service and seeds 7+1 stale agent runs and 35+5 scheduler timeouts, plus an unrelated permission-only failure. It verifies exactly 48 captured incidents, idempotent replays, one additional stale event, preservation after simulated source completion, RLS and service-only grants. The V323 release gate has three additional VM-based HTTP handler tests, with no network.

## Real backup gap / restore sequence

Supabase documents **Pro daily database backups retained for 7 days** (https://supabase.com/docs/guides/platform/backups), but this is a product statement **not proof** that this project's restore points exist or are restorable. No project-specific backup inventory endpoint was available through the connected Supabase tools, and `list_branches` returned an empty list. No restoration, cloning, new project creation or extra spending was attempted.

Acceptance steps before a production schema deployment:
1. Owner verifies actual backup timestamps and latest successful project backup at `https://supabase.com/dashboard/project/mpcelmjiycjpdyyflisn/database/backups/scheduled` in the Supabase dashboard and documents the backup type and retention. Inspect whether Point-in-Time Recovery is enabled rather than assume it.
2. Use Supabase's [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project) workflow only after separately confirming price and permission. Restore **to a NEW isolated project**, NEVER overwrite the production project, and never expose real customer data to a public preview. Restores are database-only; verify Storage object contents and Edge/Auth config independently.
3. In the isolated copy, verify business-critical table counts, foreign keys, RLS/grants, authentication account linkage, subscription expiry invariants, cron/Edge function configuration and private customer-data isolation. Report exact source backup timestamp, restore duration, resulting database project, query results and rollback acceptance.
4. Approve review-only migrations in dependency order and only on a protected staging database after restore evidence. Maintain production V311 code lock, merchant checkout OFF and trading WAIT/0R.
5. Do not auto-resolve old incident evidence, grant entitlement or charge customers to make release reports green.

## Remaining commercial risks

Real signed Flutterwave merchant sandbox payment, renewals, cancellation and chargeback/refund tests; operator-assigned incident resolution and redacted event correlation; real member and owner MFA/AAL2 and RLS; licensed, timestamped Gold, DXY, Oil, BTC feeds; hosted no-store and rollback rehearsal. Current V323 code handles **incident evidence**, not actual paid transaction recovery or timeout root-cause repairs.

**Immutable operational boundary:** production V311 READY; no prod SQL/Edge functions deployed; no cron/job/agent/payment/subscription writes, no merchant charges, no customer entitlements, no autonomous trading; commercial HOLD and capital WAIT/0R.
