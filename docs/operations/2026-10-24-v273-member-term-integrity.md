# V273 | Strict paid-period member authorization

**Date:** 2026-10-24 UTC. **Production baseline:** V272 `258cb22dd43179cc77eac1578fece81829fbd210`.

## Actual provider evidence
- Supabase management SQL intermittently connected; a read-only aggregate found **4** subscriptions with status `active` or `trialing`, **0** valid future periods, and **4 missing current_period_end**. There were **0 pending checkouts** and **0 payment_events in the past 7 days** in the separately sampled ledger. Only **1 subscription row** was tied to `provider=flutterwave`. These are **record counts, not proof of four paid customers or four correct entitlements**. Individual plan IDs and customer identities were not inspected or published.
- SQL queries still frequently time out. The last 20m log window included the text `timeout` in 42/113 PostgreSQL, 7/54 PostgREST, and 16/50 Supavisor log messages. These are text-match counts, not request error rates or root-cause proof.
- Deployed Supabase `member-session` **ACTIVE v11**, `verify_jwt=true`, had `const periodOk=planId==='free'||!sub?.current_period_end||...`. Missing paid term was therefore mistakenly considered valid for non-owner `active`/`trialing` rows. Its `effective_tier` and label also reflected plan name after expired status even when entitlements were free.
- Live `flutterwave-webhook` remains ACTIVE v7 (`verify_jwt=false` to receive provider signatures). This is **not modified** in V273: a blind replacement could harm existing renewals or cancellations. Its source is not currently tracked in the production tree and requires separate idempotency/replay security review.

## V273 change and impact
- Add the deployed `member-session` source to GitHub with **strict paid term**: a paid term counts only when `current_period_end` is a nonempty parseable ISO date **after now**. A missing or expired period is `period_valid:false`, `access_state:'limited'`, free feature entitlements and `effective_tier:'free'`. Non-owner plan labels no longer claim paid privileges while limited.
- A verified **owner** user remains determined by `owner_users` lookup and retains owner feature policy. Genuine non-owner paid members with a valid future period remain granted.
- Tighten browser checkout's `validateMember` (which was previously broad enough to accept `limited`) so future eventual checkout verification accepts only an explicit owner session or granted membership with `period_valid:true`. **Its hard payment switch remains OFF**.
- No payment data was modified. There are no changes to subscription rows, checkout intents, plans, pg_cron, Auth, RLS, Flutterwave webhook, real-money trading or historical receipts. This change only corrects access assessment and records an audit trail.

## Rollout and acceptance
Deploy tested code only with `verify_jwt=true`; inspect actual Supabase Edge version and compare byte-for-byte with the Git-reviewed source. Verify the existing website is Vercel READY, public V268 smoke and separate membership security acceptance tests. Direct authenticated live account testing cannot be claimed without a user token (and no user credentials should be requested in chat). A small anonymous API status alone does not certify correct signed-in access.

## Full commercial hold
Fix DB timeouts and authenticate user login, verify new signed Flutterwave transactions and idempotent event+entitlement atomicity, reconcile missing paid terms (with provider proof, not fabricated dates), confirm two sealed kernel cycles, market data rights, full DB backups and customer communications before activating new payments. A green public research smoke remains research-only.
