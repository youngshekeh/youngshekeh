# V227 | Supabase provider root-cause support packet

Observed 2026-10-21 UTC; read-only connected Supabase, Vercel and GitHub evidence.

Direct database management SQL and Supabase performance advisors timed out. Supavisor returned 20 authentication timeouts, 5 failed connection checkout entries across 82 sampled log entries; PostgREST logged 4 57014 statement timeouts and no PGRST002 in the window sample. PostgreSQL registered 72 pg_cron startup timeout records, while V180 remained KERNEL_SEAL fail-closed and public Gold returned 503. Source-specific counts were captured in separate calls, so they must not be represented as exhaustive simultaneous interval totals.

V227 adds a strict schema, redacted, support-ready incident triage module, snapshot, offline report CLI and regression workflow. It identifies the most frequently observed pg_cron job IDs as candidates for operator review, but categorically does not pause or modify them. Hypothesis: shared database connection or resource contention. The hypothesis is NOT confirmed. Ask Supabase support to correlate backend authentication, database host metrics, pg_cron worker pressure, PostgREST schema cache introspection and connection pool saturation. Read-only log capture cannot prove a root cause or that the database is recovered.

All source changes are offline-only. No runtime cron, pooler, database, Edge function, OIDC, Flutterwave or trading changes. No secrets, customer data or raw logs copied to GitHub. The capture excludes financial account and payment records.

Acceptance: full PR checks pass, static support report generated, exact merged SHA confirmed on Vercel, source continuity archive confirmed. Commercial release still needs independent positive database/cron receipts, two recent sealed V180 runs, live Gold, private QA, end-to-end login/OIDC and signed payment-to-entitlement proofs. Checkout remains locked; WAIT / 0R.
