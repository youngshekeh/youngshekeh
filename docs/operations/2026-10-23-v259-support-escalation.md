# V259 | Supabase Pro P0 incident support escalation and operator handoff

**2026-10-23 · V258 production baseline:** Vercel READY, all 73 release workflows passed. **Commercial authorization:** BUILD_HOLD. **Live trading:** OFF / WAIT / 0R.

## Why
Supabase project eu-west-1 control plane reports ACTIVE_HEALTHY, but tiny read-only SQL timed out. V180 private kernel seal returned 503 multiple times (last independently inspected ~18:04 UTC KERNEL_SEAL / DATABASE_SEAL_TRANSPORT_TIMEOUT). Supavisor logs show 15-second backend authentication timeouts and connection errors, PostgREST timed out, and multiple pg_cron jobs could not start. These are observed symptoms, not proof that connections maxed out or any particular job is faulty. Support investigation is needed.

## What was implemented
- A permanent `src/v259-support-escalation.mjs` pure support report builder, validating a recent read-only `v258-readonly-recovery-triage-v1` packet (<=5 minutes old), exact WAIT/0R/zero private modifications, and allowlisted network states, provider codes and blockers.
- A deliberately manual **PREPARE & COPY SUPPORT REPORT** action on `/status/`, enabled only after a valid read-only recovery check. Generates a copy-ready, source-time-stamped support handoff including project reference, Auth / PostgREST transport, reported incident code, bounded known blocker names, UTC evidence and recommended safe provider investigation. Reveals the text in a read-only field. Attempts a Clipboard API write only from the operator click; if denied, leaves text selectable.
- **No automatic submission**; no Supabase support ticket or GitHub issue was created. Attempts to open a P0 GitHub issue returned HTTP 410 because GitHub Issues are disabled for this repo. Do not claim external notification or ticket acceptance.
- The handoff discloses the limits: 401 is not a successful DB query, Auth HTTP success is not a signed-in user, and diagnostic/public readiness cannot certify the V180 seal, billing entitlement, market-data redistribution rights, or broker execution.
- No raw remote `message`, `error`, stack trace, injected HTML, user PII, credentials, database secrets, cron changes, trade execution or billing writes are included.

## Delivery QA
Add Node tests covering dated evidence, stale/invalid packets, source data sanitization, no unsafe actions, and public launch denial. Extend the existing Chrome suite to verify zero automated support report creation on page load, disabled action before a recovery check, operator preparation and copy only after a user click, stale case refusal, and no extra backend calls. Require all existing engine and browser tests green.

## Provider recovery request
Open https://supabase.com/dashboard/support/new and paste the generated report. Ask provider to inspect backend reachability, Supavisor auth lookup, PostgREST timeouts, CPU/IO/connections and pg_cron workers in eu-west-1. Demand a safe recovery plan preserving data and 58 existing pg_cron schedules, then obtain a real case ID and response before changing credentials or services. This app does not have permission to submit cases.

## Launch certification gates (not bypassed)
Successful management SQL read repeatedly, actual authenticated PostgREST data read and account sign-in, >=2 consecutive fresh sealed private V180 execution receipts, active production entitlement/checkout acceptance, licensed trade/research data, broker quotes and launch QA. None is granted by operator support report or an HTTP response.

**Rollback:** revert V259 static support-builder module and the status page manual export control. No database/edge/Vercel secret mutation to undo.
