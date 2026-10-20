# THE FATHER ANALYTICS | CONTINUITY VAULT v214

**Recovery baseline:** 20 October 2026 UTC. This register is versioned in Git and is not a claim that production is healthy.

## Source-of-truth hierarchy

1. **GitHub source:** `youngshekeh/youngshekeh` deployment branch `the-father-analytics-deploy` is the release source of truth. Production state **before V214** is immutable commit `006d01902d2cd4554b4e12859ae24218dd3e993e`, separately preserved as `archive/tfa-prod-v213-20261020`. This branch holds the complete committed repository at that exact point. It is NOT a copy of Supabase data, uncommitted changes, or privately deployed code outside Git.
2. **Vercel website:** project `the-father-analytics`, site `https://thefatheranalytics.com`; baseline deployment `dpl_38pvyZ2XrMmpz2Nv92LGGhj8jEnM` is READY. Deployments are immutable release references. Domain aliases must be checked after any rollback. No live-data health is inferred from READY state.
3. **Supabase backend:** source project `mpcelmjiycjpdyyflisn`. On 20 Oct 2026 the inventory had **369 ACTIVE Edge Functions** and **242 migrations**; `runtime-v180-continuous-kernel` v6, `create-checkout` v8, `flutterwave-webhook` v7. These function versions are runtime inventory only, NOT off-site backups of their deployed source, credentials, database data, Auth users, or Storage objects. Backend gateway and kernel remain degraded.
4. **Separate AppDeploy workspaces:** six pre-existing deployed applications were inventoried, covering portfolio universe, playlist growth lab, playlist growth OS, Analytics decision OS, autonomy cloud and music network. Their current AppDeploy versions are independent and have NOT been copied/republished by this release.
5. **Customer-facing policy:** public research and enquiries are reachable, subscription payment is hard-disabled. `src/checkout.ts` has `CHECKOUT_SERVER_GUARD_DEPLOYED=false` because the reviewed server-side checkout safety deployment was blocked. Capital Permission is **WAIT / 0R**, no live trade execution. Keep these controls intact during restoration.

## What v214 preserves automatically

- On each push to the deployment branch, GitHub Actions runs `scripts/continuity-vault.mjs` and creates an archive of **exact committed source files** with an exact Git SHA, SHA-256 digest and manifest.
- The snapshot is retained as an Actions artifact for **90 days**, subject to GitHub repository/platform retention limits. Artifacts expire; they are not an eternal off-site backup.
- Credential-looking tracked filenames (dotenv, private-key, credentials) reject the archive rather than copying potential secrets.
- An archive branch pinned to a known-good/reachable source commit provides a second Git ref for rollback but not independent storage. For external resilience, periodically export the source archive to a controlled private drive and retain an off-platform recovery manifest.
- Current operating metrics should be verified anew on every release: no fabricated prices, historical trades, job receipts or forecasts.

## Recovering safely

1. Freeze new deployments and confirm which production SHA and Vercel deployment the domain currently serves. Do NOT delete/disable production scheduler or rotate credentials as a first response.
2. Verify the archive's SHA-256 against `source-manifest.json`. Review `git log` and replay selected changes from the immutable commit, not from a guessed branch name. Deploy a staging site first.
3. Validate the website and routes `/`, `/status/`, `/research/`, `/pricing/`, `/checkout/`, `/sitemap.xml`. Keep subscription checkout hard-disabled unless backend safeguards and accepted payment flows are deployed and tested.
4. **Supabase Database → Backups:** inspect backup status, retention and integrity directly in the project dashboard. Supabase's Pro projects generally receive daily backups with limited retention, but this snapshot has **not verified a restorable database backup**. Backups do not restore Storage objects. For independent backup follow the documented Supabase CLI logical export using securely held credentials; do not upload customer data to a public repository or ChatGPT Library.
5. Inventory and restore necessary Supabase Edge Functions, Auth settings, RLS policies, migrations, provider/webhook configurations, Storage buckets AND underlying objects as separate steps. Never assume source in GitHub covers all 369 runtime functions. Verify privileged Auth and webhook signatures before granting entitlements.
6. Verify recent cron/job receipts, `public.command_kernel_seal_status()`, owner/policy governance, source freshness and **two consecutive successful autonomous kernel cycles**. A 200 response, READY deployment or enabled cron scheduler are not success receipts.
7. Require controlled end-to-end payment, **signed webhook**, subscription ledger activation, cancellation/refund pathway and authorization tests BEFORE enabling subscriptions. Never enable live trades without explicit owner approval, separate environment controls and validated risk limits. Preserve **WAIT / 0R**.
8. Rebuild member application, OAuth and password reset from verified settings, not a copied production access token. Rotate any compromised credentials through platform consoles and validate least-privilege roles.
9. Confirm domain ownership/DNS separately and test all custom domain aliases before redirecting traffic. Do not disrupt the existing site merely to inspect its state.

## Never store in public logs/artifacts

Production `OPENAI_API_KEY`, database connection strings or passwords, Supabase service-role keys, OAuth client secrets, Flutterwave secret/hash, Vercel OIDC tokens, customer/financial records, private payment payloads, subscriber PII, signing keys, or `.env` files. Store encrypted credentials only in their designated host secret managers. The archive includes only source files already committed to the repository.

## Recovery quality status on 20 October 2026

- Vercel production deployed: YES.
- Public research enquiry and SEO assets: verified accessible.
- PostgREST gateway: **DEGRADED**, schema-cache timeout/connection problems.
- Last verified full V180 kernel success: `2026-10-20 08:20:24 UTC` as of a later read.
- Cron launch control: ON; 58 scheduled jobs active at last read, not proof of successful execution.
- Paid hosted billing: **HOLD**. Deployed `create-checkout` function v8; reviewed stricter v9 source exists in Git but was not deployed.
- No live order permissions: **WAIT / 0R**.

## Source documents

- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/clone-project
- https://supabase.com/docs/guides/database/postgres/timeouts
- Github archive ref: https://github.com/youngshekeh/youngshekeh/tree/archive/tfa-prod-v213-20261020
