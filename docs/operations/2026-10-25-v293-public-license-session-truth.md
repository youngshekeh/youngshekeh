# V293 Commercial Launch Market Data License Guard | 2026-10-25

## Verified product and market facts
- As of 2026-10-25, the public `api/public-market-reference.js` calls Coinbase's `api.coinbase.com/v2/prices/BTC-USD/spot` and publishes the returned spot number to unauthenticated end users. The browser labels the Coinbase price as a receipt-timestamped reference without an exchange trade timestamp.
- Coinbase's August 7, 2026 **Market Data Terms of Use**, https://www.coinbase.com/legal/market_data, restrict use to the licensee's personal/internal research and prohibit using the data to build applications intended for third-party end users without an appropriate agreement.
- This repository has NO confirmed commercial Coinbase data license, market-data distribution authorization, or contractual downstream price-display right.
- The operational 24/7 BTC parser added in V292 is a private, unwired research adapter. Passing its source-age tests is NOT permission to distribute prices.
- The last combined `live_markets_snapshots` entry is from Friday 2026-10-23 20:55 UTC with market_status `DELAYED_LIVE`; Sunday's production smoke on October 25 was **8/9**, still failing the combined stale snapshot. 24/7 crypto cannot inherit a Friday weekday-only capture as current.

## V293 safety remediation
- Remove the **public Coinbase BTC request** from `api/public-market-reference.js`. The end-user response must return `assets.bitcoin:null`, `X-TFA-BTC-Display: LICENSE_HOLD`, and a structured `source_rights.bitcoin` field.
- Defensive UI verification **always rejects** Coinbase-sourced Bitcoin values; it does not trust flags from a client packet or unverified runtime environment settings.
- Public market observatory labels BTC as **LIVE DISPLAY WITHHELD · licensed source required**, rather than 'No current Coinbase response'.
- A standalone `src/v293-market-session-truth.mjs` classifies Sunday Friday-stamped Bitcoin as `SOURCE_STALE`, closed-session conventional markets as `WEEKEND_SESSION_REFERENCE_NOT_LIVE`, and never marks indicative reference observations as execution verified. This helper is not a certified trading-hours/holiday calendar.
- Historical source timestamps remain intact; no price, market snapshot, database row, cron schedule, RLS policy, merchant entitlement, browser refresh frequency, or broker/live trade execution state is updated.
- Gold indicative source remains unchanged in this narrow licensing fix; it also requires a separate provider data-rights review before paid redistribution claims.

## Commercial acceptance and rollout
1. Run exact-head unit and comprehensive Chromium/frontend/regression CI.
2. Deploy public endpoint/UI only after a production build is promoted and post-deployment HTTP confirms the `LICENSE_HOLD` header and null BTC, or leave the public site unchanged and report blocker explicitly. A GitHub merge without Vercel deployment does not cure production legal exposure.
3. Obtain a commercial license that expressly grants third-party app display/redistribution rights and confirm source SLAs, delayed vs realtime labeling and attribution before building the 24/7 BTC end-user feed.
4. Keep production smoke at 8/9 until a separately validated session-aware licensed lane is actually available; never relabel stale Friday combined quotes to force a pass.
5. Preserve all existing Gold session rules, auth, OIDC, checkout HOLD, capital WAIT / 0R, and the historical 30 failures in the 107-check private matrix.

This release is a licensing guard and source-truth improvement, **not** a 9/9 production smoke result, a paid subscription activation, or a broker-ready price feed.
