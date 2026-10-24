# V271 · Commercial billing source repair and no-charge research enquiry

Date: October 24, 2026 UTC. Production baseline: V270 `9f0e507e4afe7018d1173be7999057e71f83db62`.

## Change and reason
The pricing browser page previously used a direct Supabase Edge `public-billing-acceptance` fetch with an `apikey` header. The already-shipped `public-acceptance-connection.mjs` reader deliberately performs an anonymous, credentialless simple GET so browsers do not require an unnecessary CORS preflight. V271 reuses that tested reader, separating public plan catalog status from paid checkout permission. It adds a bounded manual Retry and clean plan-specific links to the locally composed research enquiry.

The provider's *current* recurring USD amount appears only if public acceptance HTTP succeeds, its timestamp is within ten minutes, and that specific plan's pricing is provider-verified. A 503, CORS/network error, stale timestamp or invalid plan evidence shows **Price withheld**. Historical provider payment records never make the page claim an active member entitlement.

The real self-service checkout stays hard-sealed in `src/checkout.ts`: `CHECKOUT_SERVER_GUARD_DEPLOYED=false`. The public pricing page ALWAYS says **SELF-SERVICE PAYMENTS · ON HOLD**, never initiates provider charge, member creation, API writes or an email submission. Plan-specific research enquiry only pre-fills a user-controlled email draft; visitors must send it independently.

## Current commercial blockers
- Supabase management SELECT worked once at ~06:52 UTC with 22 sessions and 58 active cron, then subsequent diagnostic reads timed out.
- Latest sample contained timeout strings in 36/109 PostgreSQL, 13/40 PostgREST and 5/50 Supavisor log events. Text-hit counts are not incident rates or root-cause proof.
- V180 sealed kernel continued `DATABASE_SEAL_TRANSPORT_TIMEOUT`, public triage `DATABASE INCIDENT REPORTED`; independently fetched public billing Edge endpoint returned HTTP 503.
- Authenticated login, current signed payment/entitlement evidence, deployed server charge guard, forecast freshness, market data redistribution licensing and backup/restore verification are outstanding.
- No production SQL changes, cron mutation, payment processing, Auth/RLS change, kernel seal bypass or trading.

## Next steps
Complete provider Supabase support diagnosis, verify consistent DB SQL and cron runtime, pass independent signed kernel cycles, authenticate customer sign-in, deploy and verify reviewed pre-charge server guard, test real signed payment/webhook and entitlement/renewal/cancellation flows only with explicit permission, audit commercial market data rights and backups, then final browser/prod QA and operator release. Do not merge or activate the separate draft billing rollout prematurely.
