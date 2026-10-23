# V257 · Independent public market coverage on service status

**Date:** October 23, 2026. **Production baseline:** V256 df63078d, 67 GitHub checks passed including real Chromium browser interaction under simulated market responses.

## Problem found
The dedicated public /status/ page showed webpage availability and Gold/BTC status only. Actual market research now consists of three independently served source families: Gold API/Coinbase public quotes, delayed Yahoo NYMEX Oil futures/ICE DXY quotes, and nine previous-quarter OHLC price ranges. Visitors could not tell from the operating-status page whether Oil/DXY or quarterly data were healthy. An optimistic overall label could confuse research source reachability with authenticated, paid, or broker-certified launch readiness.

## V257 changes
- Add two independent status slots for Oil/DXY and all nine quarterly OHLC reference sources, next to the existing Gold/BTC reference and page-delivery slots.
- Include exact verified source counts (0/2,1/2,2/2; or 0-9/9), earliest qualified market-observation timestamp (not receipt time for Yahoo), and oldest reported historical daily bar, with explicit delayed and data-license caveats.
- Reuse the existing spot fetch instead of requesting Gold/BTC twice. Use separate concurrent Oil/DXY and quarterly reference calls, both independent of Supabase private auth/PostgREST. Each failure stays local to that lane; stale/missing responses never turn green.
- Reuse the existing market source verifiers; quarterly OHLC is a potential liquidity *proxy* rather than a broker tick or actual stop/order book. No commercial redistribution permission implied.
- Private readiness continues to use only independent verified auth, billing, kernel, broker and QA inputs. This change **does not** participate in evaluateLaunchReadiness and never grants capital or order permission.
- No new background polling: page initialization and manual status refresh only. No additional Supabase database queries, Edge changes, scheduler edits, billing or user PII access.

## Production incident evidence
16:30–16:46 UTC public research endpoints served 9/9 quarterly, 2/2 Gold/BTC, 2/2 Oil/DXY. Private final readiness still returned BUILD_HOLD and database/auth/billing blockers. Direct Supabase SQL timed out, with repeated Supavisor 15-second backend authentication timeouts, PostgREST timeout-manager kills and several cron startup failures. **No database repair is claimed** and global scheduler changes remain prohibited.

## Acceptance
- Node tests independently exercise full, partial, stale, malformed and capital-bypass packets across three market families.
- Real Chromium status-page test must verify the page shows all source lanes even when private final readiness is on hold, and demonstrate that an Oil outage does not blank nine intact quarterly ranges.
- Existing V241–V256 tests and V256 Chromium notification acceptance must remain green.
- Only merge after complete CI and verify exact Vercel production READY commit and all public endpoints.

**Commercial launch:** BUILD_HOLD until Supabase Auth/PostgREST, sustained V180 kernel receipts, active subscription entitlement, licensed market data and broker-grade quote acceptance are independently certified. **Execution OFF, WAIT / 0R**.
