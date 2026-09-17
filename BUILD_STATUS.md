# Build status v52.2

Production source is staged on branch `thefatheranalytics-production`.

## Build state
- Frontend/runtime version: `52.2.0`
- GitHub production-contract QA: PASS
- Deterministic same-origin gateway smoke test: PASS
- Supabase project management status: `ACTIVE_HEALTHY`
- Supabase Edge rate limit: `VERIFIED_LIFTED_BY_SUPABASE_SUPPORT`
- Vercel team connection: visible, but no project is currently exposed by the connector
- Cloudflare Worker deployment: source validated, publish NOT yet performed because the GitHub repository does not currently expose `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to the workflow

## Included
- Mission Control homepage
- Access Gateway
- Member email/password, signup, recovery and optional Google OAuth UI
- Owner email/password, server owner verification, TOTP MFA/AAL2
- Same-origin Supabase gateway for Cloudflare and Vercel-compatible rewrites
- Auth/private-route no-store policy
- Bounded 15-second auth/network timeouts with no automatic credential retry
- Controlled-load Live Markets and Gold pages
- Production status surface
- Dynamic `/__tfa/health` gateway diagnostic on Cloudflare
- Privacy, Terms, robots, sitemap, 404 and static health marker

## External acceptance still required after hosting cutover
- Canonical domain serves v52.2
- `/__tfa/health` reports gateway v52.2 on Cloudflare
- Member password login succeeds in a real browser
- Owner MFA/AAL2 succeeds in a real browser
- Recovery callback returns correctly
- Google OAuth callback works if provider is enabled
- One controlled Flutterwave transaction verifies server-side before entitlement is granted

Do not mark production hosting or browser authentication accepted until those checks are observed on the deployed canonical host.
