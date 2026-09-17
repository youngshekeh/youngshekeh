# Production deployment

Source branch: `thefatheranalytics-production`

## Cloudflare Workers / Pages
Use this repository branch as the production source. The project includes `_worker.js`, `_redirects`, and `wrangler.toml`. The worker serves static assets and proxies `/auth/v1`, `/functions/v1`, `/rest/v1`, and `/storage/v1` to Supabase while the browser remains on `thefatheranalytics.com`.

## Vercel
The same source can deploy with `vercel.json`, which contains equivalent rewrites and security headers.

## DNS / custom domain
Point `thefatheranalytics.com` and `www.thefatheranalytics.com` to the selected production host. Keep only one canonical host and redirect the other.

## Acceptance test
1. `/access` loads.
2. Member password login succeeds.
3. Owner password login succeeds and requires TOTP MFA/AAL2.
4. `/status`, `/live-markets`, and `/gold-live` load without raw browser fan-out.
5. Password recovery callback returns to `/member`.
6. Google OAuth callback returns to `/member` only if the provider is enabled.
7. One controlled Flutterwave transaction verifies through the server-side ledger before entitlement is granted.
