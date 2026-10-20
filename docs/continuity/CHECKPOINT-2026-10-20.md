# THE FATHER CONTINUITY | Checkpoint V213

Snapshot saved on 2026-10-20 for the next V214 continuity build.

- Production commit: `006d01902d2cd4554b4e12859ae24218dd3e993e`.
- Archive branch: `archive/tfa-prod-v213-20261020` (separate Git ref to the full committed source).
- Vercel deployed checkpoint: `dpl_38pvyZ2XrMmpz2Nv92LGGhj8jEnM`, domain `thefatheranalytics.com`.
- Supabase configured project: `mpcelmjiycjpdyyflisn`, 369 Edge Functions and 242 migrations inventoried.
- Payment code/runtime discrepancy: stricter unshipped `create-checkout` source exists in repo; deployed Edge v8. Keep browser payments HARD LOCKED.
- Machine status: degraded backend, last successful V180 at 08:20:24 UTC, pg_cron ON 58 configured jobs.
- Public capabilities: website/research enquiries, pricing categories and SEO sitemap available. Actual paid SaaS and live trade execution not approved.
- Last CI before this snapshot: 61/61 green on V213; earlier V212 62/62 green.
- Latest PRs: #147 research intake, #148 sitemap repair.
- Restoration protocol: [RECOVERY](./RECOVERY.md).
- Integrity snapshots: [GitHub Actions V214 Production Continuity Vault workflow](../../.github/workflows/v214-continuity-vault.yml). Source SHA and archive SHA256 validated before use.
- AppDeploy assets: six independent pre-existing deployments; do not misidentify their versions as current Vercel production code.
- Database, Auth, Storage files, runtime-only Edge sources and secrets require separate privately managed backups; this checkpoint is not a full customer-data backup.
