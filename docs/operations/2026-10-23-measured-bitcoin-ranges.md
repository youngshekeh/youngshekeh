# Measured Bitcoin calendar ranges and feed diagnostics

Preserves the v3.0 framework and Directional Eye research-only status. No trading, database, billing, or private-kernel changes.

Adds an independent bounded daily Coinbase Exchange candle request, validates finite OHLCV, positive prices, aligned UTC dates, daily continuity and current-day presence, then calculates current daily/weekly/monthly/quarterly observed ranges. Missing calendar starts are withheld. Monday defines the UTC week. The current day's candle is explicitly incomplete. The 40/20/40 partition is range arithmetic, not an order book or institutional valuation.

The daily feed is independent of intraday detection failure. Its HTTP receipt expires after 60 seconds; provider update time is not supplied and remains null. No source-timestamped live-price claim is made for the daily range. Intraday Eye expiry now uses the earlier of its 1m and 5m evidence deadlines. Public cards expose provider health, failure reason and candle counts; expired health checks are labelled.

Validation: 604/604 local Node tests, Vite production build. Downloaded real Coinbase daily series passed UTC range validation for all four current periods. Coverage includes malformed/gapped/future daily buckets, missing calendar starts, intraday expiry, HTTP failures and invalid provider payloads. Gold and other asset candle adapters remain unavailable. Canonical forecast storage, unattended alerts, measured order-book liquidity, calibrated probabilities and commercial release remain unverified.
