# V252 | Gold, WTI Oil and DXY live research data

**Date:** 2026-10-23. **Launch policy:** public research enabled; private autonomous commerce and trading remain locked.

## Source selection and verification
- Gold API XAU/USD remains the independently verified indicative Gold lane at `/api/public-market-reference`. Strict 120-second provider timestamp and non-execution posture are unchanged.
- An actual Yahoo Finance chart response for `CL=F` included NYMEX, USD, FUTURE, `Crude Oil Dec 26`, `regularMarketTime` and a price. This is a **WTI front-month futures quote, not WTI cash spot or MT5 bid/ask**. Contract label is vendor-supplied and updates across expiry. URL is `https://query1.finance.yahoo.com/v8/finance/chart/CL%3DF?interval=1d&range=1d`.
- `DX-Y.NYB` returned ICE Futures, INDEX, USD and U.S. Dollar Index with a source market timestamp. This is the **DXY index**, not the US Dollar Index futures or an EURUSD-inverted proxy. URL is `https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=1d`.
- Yahoo Finance documents up to **30-minute delayed** ICE Futures U.S. and NYMEX coverage. Sources are intentionally marked *DELAYED · INDICATIVE · NOT EXECUTABLE*. Any observation >65 minutes old (or >5 seconds future-dated) is withheld instead of displayed as live. The Yahoo endpoint can restrict access without notice.
- **Redistribution and commercial data licensing are unverified.** This feed is evaluation-only, and must be replaced with an appropriately licensed source or have permissions confirmed before monetizing market data. See https://help.yahoo.com/kb/finance-for-web/SLN2310.html, https://developer.ice.com/fixed-income-data-services/catalog/ice-data-indices-currency-indices.
- OilPriceAPI requires an authenticated server API key for production WTI/Brent API calls. Do not put API keys in browser source. Its public demo is intentionally NOT used as a live source. See https://docs.oilpriceapi.com/api-reference/prices/latest.

## Architecture
- `GET /api/public-macro-reference`: independent bounded read-only server-side fetches for fixed WTI/DXY vendor URLs, 3.5s upstream timeout, 25s positive cache, strict timestamp/identity/source/license/safety checks and partial availability. No Supabase, private auth, trading or arbitrary query URLs.
- `/market-observatory/` gains delayed WTI and DXY cards with source times and honest in-tab observation traces; `/live-markets/` gains independent Oil/DXY price references. Failure in macro API does not make existing public Gold and BTC disappear.
- Weekend/closed-session values age out. Browser validates every second independently of network availability, while polling up to once every 30 seconds when visible.
- No invented historical candles, no executed order, no dealer/broker depth, and no claim of market-leading low latency.

## CI, deployment and rollback
- V252 regression tests reject wrong symbol, wrong venue, wrong type, future/stale time, bad price, tampered source or implied licensing, and verify Gold fallback/broker gate unchanged.
- Run V241–V252 plus complete repository QA, branch merge and Vercel READY for the exact commit. Verify real production endpoint results **after** deploy and interpret timestamps at actual UTC.
- Roll back the independent macro feed/API and two dashboard additions without touching the Gold public or private lanes, 58 existing pg_cron jobs, identity, subscriptions or risk engines.

**Capital permission WAIT / 0R, live order submission OFF, commercial launch HOLD.**
