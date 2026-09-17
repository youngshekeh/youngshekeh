# THE FATHER ANALYTICS v52.1

This release moves the public frontend toward a canonical same-origin gateway architecture.

Key changes:
- canonical `/auth/v1`, `/functions/v1`, `/rest/v1`, `/storage/v1` proxy paths
- rebuilt member and owner sign-in surfaces
- owner server authorization + TOTP MFA/AAL2
- controlled-load market and Gold surfaces
- production status and health markers
- Cloudflare Worker/Pages and Vercel routing configs
- no browser-triggered capture pulses
- no timestamp cache-busting in active frontend paths
- bounded market polling
- private route no-store/noindex headers

Provider note: Supabase Support confirmed the temporary Edge Function rate limits were lifted.
