# Cloudflare production setup v52.2

This branch is prepared for a Cloudflare Worker + static-assets deployment.

- Source branch: `thefatheranalytics-production`
- Worker entry: `_worker.js`
- Wrangler config: `wrangler.toml`
- Static assets binding: `ASSETS`
- Canonical domain target: `thefatheranalytics.com`
- Dynamic diagnostic: `/__tfa/health`

## What the Worker does
The browser remains on the public hostname while `/auth/v1`, `/functions/v1`, `/rest/v1`, and `/storage/v1` are proxied server-side to Supabase. The Worker does not contain a Supabase service-role key and does not bypass Supabase authorization.

Auth responses and `/member` + `/owner` are no-store. The production CSP permits application connections to the same origin and Flutterwave checkout rather than requiring browsers to connect directly to the raw Supabase project hostname.

## Safe deployment order
1. Configure Cloudflare deployment authorization outside chat. Do not paste an API token into source or conversation text.
2. Run the existing GitHub workflow. Confirm the `Deploy Worker + static assets` step actually ran rather than being skipped.
3. Open the resulting workers.dev preview and verify `/__tfa/health` returns `gateway_version: 52.2.0`.
4. Verify `/access`, `/member`, `/owner`, `/status`, `/live-markets`, and `/gold-live` on the preview.
5. Inspect the existing Cloudflare DNS record for the canonical hostname before creating a Worker Custom Domain. Avoid blindly replacing an existing CNAME.
6. Attach the canonical hostname only after preview acceptance, then repeat the browser acceptance suite.

A successful validation job is not proof that Cloudflare published the Worker. Publication is accepted only when the deployment step runs and the deployed health route is reachable.
