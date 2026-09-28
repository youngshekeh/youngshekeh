# THE FATHER ANALYTICS deployment

Canonical Vercel rescue branch for the production frontend.

- Build: `npm run build`
- Output: `dist`
- Framework: Vite
- Backend/data services: Supabase project `mpcelmjiycjpdyyflisn`
- Production domain: `thefatheranalytics.com`

The AppDeploy-only `backend/index.ts` adapter is intentionally omitted so the Vercel source has no dependency on `@appdeploy/sdk`.

Preview deployment trigger: Vercel Git connection verification.
