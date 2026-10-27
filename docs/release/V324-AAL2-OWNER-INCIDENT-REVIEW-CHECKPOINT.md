# V324 · Owner AAL2 Incident Investigation and Independent Attestation

**Date:** 2026-10-27 UTC. **Draft PR:** #291, `security/v324-mfa-owner-incident-review`. Cumulative release candidate V313–V324, based on V323. **Production V311 remains unchanged**. This is a staged and synthetic-tested design, NOT a deployed or commercially accepted workflow.

## Verified real authorization boundary

Supabase project `mpcelmjiycjpdyyflisn` read-only SQL confirmed `public.owner_users` has exactly **one** row, **one active owner**, and that row's role is `owner`. This is not evidence that this owner has completed MFA enrollment. No second owner is authorized today. Without a genuinely different, vetted second owner, two-person closure attestations **must remain impossible**; do not fabricate one or let an administrator merely act twice.

The separate autonomous private kernel remains HEALTHY; eight billing `agent_runs` were previously observed still `running` and are not rewritten by this candidate. There is still no verified project-specific database backup inventory/isolated restore. Existing SQL/Edge payment/checkout release flags remain OFF.

## Real review-only source

- `docs/release/V324-REVIEW-ONLY-OWNER-INCIDENT-ATTESTATION.sql`: Introduces `public.billing_incident_reviews_v324`, a private append-only review-event ledger with evidence key (foreign key to V323 incident), authenticated actor UUID, action, SHA-256 hash of **off-platform investigative evidence**, client-side idempotency key and UTC timestamp. No raw case text, customer details, transaction amount or secrets.
- Authenticated-only `record_billing_incident_review_v324(text,text,text,uuid)`: **SECURITY DEFINER**, explicit empty `search_path`, JWT-derived identity `auth.uid()` and MFA `auth.jwt()->>'aal'='aal2'`, checks actual active owner membership from `public.owner_users`. Untrusted client-provided reviewer identities are never accepted. AAL1, anonymous, ordinary members, inactive owners, unknown case, invalid hash or unapproved action fail closed.
- A matching evidence SHA-256 `propose_operational_closure` from **another** verified owner must exist before `approve_operational_closure` is accepted. Proposal author cannot approve own request. Client UUID replay returns idempotent confirmation but changed action on same UUID is rejected. Service role has no direct RPC execution permission to impersonate user review through Data API.
- `billing_incident_review_summary_v324()` is owner and AAL2 only, returns grouped counts: open cases, unreviewed, awaiting second reviewer, matching dual-attestation events. No raw notes or customer data.
- **Review evidence is NOT settlement:** every review reply returns `commercial_activation_permitted=false`, `payment_reconciled=false`, `incident_closed=false`. V323 incident evidence stays `open`; the existing V323 commercial-readiness gate keeps checkout blocked. A future separately tested provider/source reconciliation workflow and explicit owner-approved runbook are required for actual incident closure.
- RLS is enabled. Direct table DML is revoked from anon, authenticated and service_role. Review through the narrow authenticated owner/MFA RPC only. This is an intentional highly restricted SECURITY DEFINER function; verify any additional Supabase security advisor findings before rollout.

## Isolated acceptance coverage

`tests/fixtures/v324-owner-aal2-incident-schema.sql` models **one active** synthetic owner and two unprivileged/inactive accounts; it provides disposable stub `auth.uid()` and `auth.jwt()` only for CI, never for production.

`tests/v324-owner-incident-review-acceptance.sql` seeds synthetic V323 incident evidence and verifies AAL1 denial, AAL2 member denial, real owner AAL2 investigation and proposal, duplicate idempotency, changed-evidence replay rejection, self-approval denied, inactive reviewer denied, active reviewer without MFA denied, mismatching second-owner evidence denied, and **independent** AAL2 matching approval after activating a *fictitious second owner solely inside ephemeral PG17*. Checks source incident remains open, review ledger three append-only records, and no payment changes.

The updated cumulative GitHub workflow replays V317 payment atomicity, V318 cancellation, V321 cron liveness, V322 transport, V323 incident evidence and new V324 MFA owner review acceptance. A synthetic passing MFA test is NOT proof of real owner MFA enrollment or real user browser sessions.

## Practical steps required before launching a usable owner review UI

1. Owner configures a supported MFA factor in Supabase Auth, signs in and verifies AAL2 on a real hosted session. Do not relax the AAL2 check or add shadow owner rows.
2. Establish a legitimately independent second authorized reviewer only through a separately approved identity verification and least-privilege onboarding process; current owner count is one. Do not manufacture a second reviewer or share credentials.
3. Ensure the owner-facing review UI submits only opaque evidence identifiers, SHA-256 digests of evidence stored in protected off-platform files and client idempotency keys, never tokens, payment data, signatures or raw notes.
4. Verify owner and non-owner sessions through hosted Chromium QA and Supabase Auth JWT assurance, plus negative tests for expired tokens, AAL1 and role revocations.
5. Obtain instance-specific Supabase backup inventory and **isolated restore** before SQL deployment. The connected API did not expose exact project restore points, and no clone or fee approval is assumed.
6. Build/verify an independently controlled **real payment reconciliation and incident-resolution** transaction using exact provider data; only then can a future explicitly reviewed transition close an incident. Keep scheduled billing watches and audit records preserved.

**Launch gate unchanged:** production V311 READY, no deploy, paid checkout/merchant charging OFF, staged V317/V318 payment and cancellation release locks OFF, commercial HOLD, automated trading WAIT/0R. Real Flutterwave signed sandbox events, customer RLS, live market data licenses/freshness, backups and rollback still need certification.

Supabase docs: https://supabase.com/docs/guides/database/functions and https://supabase.com/docs/guides/auth/auth-mfa .
