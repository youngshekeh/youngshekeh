# THE FATHER ANALYTICS v52.2

Access-gateway hardening release.

- Production browser traffic uses the canonical origin for Supabase Auth and API calls.
- Cloudflare Worker proxies Auth, Edge Functions, REST and Storage through the canonical host.
- Raw Supabase browser access is removed from the production CSP.
- Auth and Owner requests use bounded 15-second network timeouts with no automatic credential retry.
- Member authentication now returns clearer gateway-vs-credential errors.
- Owner recovery is reachable from Owner Command through the Member recovery flow.
- Auth responses and private member/owner pages are explicitly no-store.
- Dynamic `/__tfa/health` gateway diagnostic added for Cloudflare deployments.
- CI QA validates critical routes, proxy paths, auth surfaces, CSP and cachebuster absence.
