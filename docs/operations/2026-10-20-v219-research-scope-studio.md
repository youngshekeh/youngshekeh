# V219 | Public Research Scope Studio

**Date:** 2026-10-20. **Business lane:** Public independent research and enterprise enquiries. **Source:** GitHub production branch; V214 Continuity Vault auto-preserves committed deployments.

## Commercial availability
The existing `/research/` service is public and does not depend on Supabase availability. V219 improves the enquiry funnel into a self-service **request for quotation** tool without adding any payment, database, unverified pricing or false fulfilment statements.

Customers can select up to four research deliverables, specify data access rights, a preferred output format and confidentiality needs; these appear in the draft email and a locally downloaded `the-father-research-enquiry.txt`. The visitor explicitly must email the draft themselves. No request is created server-side, no automatic communication is sent, and no data is stored by THE FATHER ANALYTICS before receipt of an actual email. This is a free proposal enquiry, not a sale, subscription, guarantee or financial advisory agreement.

## Supported output requests
Executive decision memo, source provenance/methodology register, sector data tables, risk/scenario matrix, forecast assumptions and validation, dashboard concept, stakeholder briefing. Every request is subject to feasibility, written quotation, licensing, source validation and confirmed delivery terms. No amount or timeframe is invented.

## Safety and QA
- Static allowed-value dictionaries protect email composition from arbitrary checklist data, while existing V212 input validation sanitizes line breaks.
- Browser `FormData.getAll` correctly handles multiple selected deliverables; the old V212 form without selections remains valid with an explicit `To be agreed` description.
- Copy and local text download are initiated by the visitor. `mailto:` preparation still requires a configured mail app and an explicit Send action. Text files are built in browser memory and are not sent automatically.
- Automated payment remains hard-locked because the deployed create-checkout backend v8 lacks the reviewed production gate, and the connected database still emits PostgREST `57014` timeouts despite recent successful kernel cycles.
- Trading remains WAIT / 0R. No live market price, execution or investment-return claim is added.
- QA acceptance: V212 legacy tests, V219 unit tests, 61-platform CI suite, verified production deploy alias, actual public page read, source checksum artifact and off-platform continuity copy.

## Database incident: partial kernel recovery does not unlock billing
At 21:04 UTC 20 Oct 2026, PostgreSQL recorded 5 recent successful V180 kernel runs, latest finished 21:00:36 UTC; 62 recent successful cron history entries and 58 jobs remain enabled. **Yet** PostgREST still logged statement timeout code 57014 at 21:03:25 UTC. This means infrastructure is improving but full continuity/payment acceptance is not yet proven. The V217/V218 Supabase support pack remains available for provider escalation; do not reconfigure cron, payment gates or RLS to create artificial readiness.

## Recovery
Rollback only the V219 changes from the next reviewed GitHub release. The site continues to operate V212 research email intake if the new options are removed. All saved V218 source and Supabase Edge versions remain available. Do not publish customer contact details in GitHub issues, artifacts or logs.
