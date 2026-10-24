# V279 · Institutional homepage / source provenance / layered time research
Date 2026-10-24 UTC. Baseline release V278 production SHA `705ba576c16bd8f0faedc59a036071069f4fef28`.

## UI scope
Replace generic dashboard-first landing impression with a deliberate editorial 3D research lens for THE FATHER ANALYTICS. Four clearly named information axes (source, structure, scenario, time) plus three interactive horizons (session, week, quarter) are **static conceptual layers**, not fabricated volume heat maps or execution feeds. Hover-free, tap-friendly buttons with pressed state, keyboard focus and reduced-motion handling. Existing public Gold/Bitcoin monitor, WHAT CHANGED desk, all engines, command OS, quarterly zones, mobile routes and existing billing guards remain intact. CSS is scoped to the home page; no new dependencies, tracking pixels, WebGL hardware requirement or third-party scripts.

## Real data-source truth labels
A new four-cell Source Provenance Register on the homepage reads only existing same-origin anonymous read-only endpoints: `/api/public-market-reference`, `/api/public-macro-reference`, `/api/public-quarterly-zones`, `/api/public-recovery-triage`. Each request is bounded to 7.5s, anonymous (`credentials:'omit'`), no referrer and explicit manual refresh; no aggressive polling against the stressed Supabase system.
- Gold becomes SOURCE TIME VERIFIED only for a valid sub-2m Gold API timestamp and no broker/execution claim.
- Bitcoin without source_updated_at becomes RECENT RECEIPT ONLY, clearly distinguished from exchange quote timing.
- WTI/DXY remain DELAYED REFERENCE ONLY when observed and withheld on provider 503/weekend; never styled as current execution.
- Quarterly liquidity is labelled HISTORICAL OHLC PROXY, not real order-book, with last daily-bar labels and market-data redistribution permission explicitly unverified.
- Public recovery incident never silently certifies private engine health.
The status/capital doctrine stays `WAIT / 0R`.

## SEO and web security
Strengthen title, meta description and social preview copy for quant research, global macro and Africa without keyword stuffing or promising realtime guarantees. Add actually linked market-observatory page to the public sitemap. Preserve canonical and structured-data publisher graph. Existing strict CSP, HSTS, X-Frame-Options, origin allowlist and permissions policy remain unchanged. Add X-Robots-Tag noindex to APIs and nonpublic member/owner/checkout/access paths; avoid security regression or accidental indexing of private portals. No new external scripts or untrusted dynamic links; text-only node updates resist HTML injection.

## Known limitations
The new dimensional visualization is a user interface interpretation aid, NOT a true 4th spatial dimension, market heatmap, order flow or calibrated model. No end-to-end provider rights are certified. Supabase SQL attempts for plan mapping and candidate RPC continued timing out in the initial V279 read-only checks. Most recent 15-minute logs had timeout strings in 31/82 PostgreSQL and 11/104 PostgREST events (0/3 Supavisor); these are literal text hit counts, not global incident rates. Public site remains independently verifiable.
No production SQL mutations, cron edits, customer billing changes, private execution or live trading. Full commercial certification remains on hold.
