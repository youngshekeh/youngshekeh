# THE FATHER ANALYTICS v52.1 Production Source

Production branch: `thefatheranalytics-production`

This static frontend is designed for both Vercel and Cloudflare Workers/Pages.

## Canonical gateway
Browser calls use same-origin paths on `thefatheranalytics.com`:
- `/auth/v1/*` -> Supabase Auth
- `/functions/v1/*` -> Supabase Edge Functions
- `/rest/v1/*` -> Supabase REST
- `/storage/v1/*` -> Supabase Storage

This keeps normal browser traffic off raw `*.supabase.co` URLs while preserving Supabase as the backend.

## Critical routes
- `/access`
- `/member`
- `/owner`
- `/live-markets`
- `/gold-live`
- `/status`

Owner access remains server-authorized and requires TOTP MFA/AAL2 after password authentication.

## Cloudflare
`_worker.js`, `_redirects`, and `wrangler.toml` are included. The worker proxies the Supabase API paths and serves static assets through the `ASSETS` binding.

## Vercel
`vercel.json` contains equivalent clean routes, security headers, and same-origin Supabase rewrites.

## Acceptance gate
Deployment is not equivalent to login acceptance. After publish, test one member password login, one owner password + MFA flow, recovery, Google OAuth if enabled, and one controlled real Flutterwave checkout.
