# Production deployment v52.2

Source branch: `thefatheranalytics-production`

## Deployment invariant
The browser should normally use the canonical origin for Auth and application APIs. Production JavaScript selects `location.origin`, while Cloudflare/Vercel routing forwards `/auth/v1`, `/functions/v1`, `/rest/v1`, and `/storage/v1` to Supabase server-side. Local development may use the raw Supabase origin.

## Cloudflare Workers
The repository includes `_worker.js` and `wrangler.toml`. The Worker serves static assets, exposes `/__tfa/health`, proxies the four Supabase API families, rewrites raw Supabase API redirect locations back to the public origin, strips Cloudflare visitor headers before upstream, and marks Auth plus private routes no-store.

The GitHub workflow validates source and deploys only when repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are available. A green workflow with the deploy step skipped means validation passed, not that production was published.

Deploy to the workers.dev preview first. Verify `/__tfa/health`, `/access`, `/member`, and `/owner` before attaching the canonical hostname. Check the existing Cloudflare DNS record before configuring a Worker Custom Domain so an existing CNAME is not unintentionally replaced.

## Vercel
`vercel.json` contains equivalent canonical route rewrites, same-origin Supabase API rewrites and security headers. The currently connected Vercel team exposes no project, so Vercel deployment is not presently an accepted production path from this connector.

## Acceptance sequence
1. Gateway health returns version 52.2.
2. `/access` loads without direct raw-Supabase browser API traffic.
3. Member email/password login succeeds once.
4. Member sign-out and sign-in persistence behave correctly.
5. Owner password login succeeds only for an allowlisted owner.
6. Owner TOTP MFA upgrades the session to AAL2 before command data appears.
7. Password recovery returns to `/member?mode=reset` and updates the password.
8. Google OAuth returns to `/member` only if the provider and redirect allow-list are configured.
9. `/status`, `/live-markets`, and `/gold-live` load without browser-triggered capture jobs.
10. One controlled Flutterwave transaction verifies through the server-side payment/subscription ledger before entitlement is granted.

Production is complete only when hosting cutover and these real-browser acceptance checks pass.
