# v52.1 QA checklist

- JavaScript source is syntax-checkable with Node.
- `vercel.json` is valid JSON.
- Canonical same-origin gateway paths are present for Auth, Edge Functions, REST and Storage.
- Private member and owner pages are configured no-store/noindex on Vercel and by the Cloudflare worker.
- Market pages poll at bounded intervals and do not trigger capture jobs.
- Owner access requires the backend owner allowlist and MFA/AAL2.
- Payment/browser return state does not grant paid access by itself.
- Supabase Support confirmed the temporary Edge Function rate limits were lifted; the production frontend records that as provider-confirmed rather than inferred from runtime health.
