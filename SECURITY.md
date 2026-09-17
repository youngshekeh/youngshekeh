# Security posture

- Browser clients use only the Supabase publishable key.
- Supabase service-role secrets are never shipped to the frontend.
- Owner access requires server-side owner authorization plus TOTP MFA/AAL2.
- Member entitlements are derived from server-side subscription/payment state.
- Browser payment returns cannot grant premium access by themselves.
- Private `/member` and `/owner` routes are no-store and noindex.
- Public market surfaces use bounded polling and cached backend sources.
- Raw timestamp cache-busting and browser-triggered capture jobs are not part of the production frontend.
