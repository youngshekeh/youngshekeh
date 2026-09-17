# Cloudflare production setup

This branch is Cloudflare-ready.

- Source branch: `thefatheranalytics-production`
- Static assets directory: repository root
- Worker entry: `_worker.js`
- Wrangler config: `wrangler.toml`
- Canonical domain: `thefatheranalytics.com`

The Worker keeps browser traffic on the canonical hostname and proxies the Supabase API families server-side. It does not expose service-role credentials and it does not bypass Supabase authorization.

After deployment, verify `/health.json`, then `/access`, `/member`, `/owner`, `/status`, `/live-markets`, and `/gold-live`.
