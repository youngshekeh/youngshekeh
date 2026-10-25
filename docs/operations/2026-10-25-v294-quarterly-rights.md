# V294 · Public derived Bitcoin quarterly market-data rights HOLD
Date: 2026-10-25

## Verified issue, not the smoke fix
V293 removed public Coinbase BTC-USD spot display and made source rights explicit. V294 audit found `api/public-quarterly-zones.js` still fetched Coinbase Exchange `BTC-USD/candles` (daily OHLC) and derived public quarterly high/low proxies from it. Coinbase Market Data Terms updated 2026-08-07 prohibit redistribution/dissemination of Market Data and Derived Works to unaffiliated third parties without written authorization, even when endpoint access is public. Reference: https://www.coinbase.com/legal/market_data

## Change
- No public Coinbase OHLC requests. Eight Yahoo Finance daily history requests remain separate and unmodified for now; their commercial redistribution and derivative analytics rights are **also unverified**, not declared approved.
- Strict `enforcePublicQuarterlyRights` removes Bitcoin historic range payload and labels it null. Public response records explicit `source_rights.bitcoin.public_quarterly_range_allowed=false`.
- Nine-asset market-observatory layout is preserved, with the Bitcoin quarterly position visible but labeled `licensed commercial data source required`, not a fabricated range. Bitcoin tab chart and spot price remain withheld from V293.
- No mutation of database, historical warehouse, Gold, DXY, Oil, OIDC, auto-engine, any payroll/payment route, monitoring cadence, trading, cron schedules, production smoke, or private QA certification.
- No further Coinbase AI modeling or automated market-data training is authorized; the V292 parser remains private and inactive and must be reviewed against applicable Coinbase data use conditions before use.

## Acceptance gates
- Isolated V294 tests prove eight and only eight fixed public data calls, zero Coinbase network access, no synthesized Bitcoin candles, 9-card UI layout and fail-closed commerce.
- 71+ complete exact-head GitHub checks incl Chromium, full regression and frontend before merge.
- Vercel production must deploy exact merged SHA; verify `/api/public-quarterly-zones` returns `assets.bitcoin:null`, explicit X-TFA-BTC-Quarterly HOLD, and the frontend displays an honest licensed-source-required placeholder.
- 8/9 production smoke **remains failed** due Friday `DELAYED_LIVE` combined snapshot in a weekday capture schedule, not cured by changing these rights safeguards.
- Latest full private QA is 77/107, 30 failed, mostly upstream private runtime evidence withheld. Keep launch and payments HOLD and capital WAIT / 0R.
- Actual licensing negotiation/provider contract with express display and derivative-analysis redistribution permitted is required for public BTC live & quarterly bars.

## Follow-on work
Trace private 503 OIDC/kernel dependencies for 30 QA failures. Pursue express license rights for **every vendor** including Yahoo historic-derived ranges and Gold API indicative spot. Design allowed 24/7 crypto independent source from licensed provider, with timestamp and separate weekend smoke. Never relabel last-Friday Bitcoin prices as live or relax security to inflate QA.
