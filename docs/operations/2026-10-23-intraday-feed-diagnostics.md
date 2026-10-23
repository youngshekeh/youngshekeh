# Intraday launch diagnostics and bounded candle windows

Production sometimes rejected Bitcoin candles while downloaded 1m/5m series validated locally. The prior DETECTOR_REJECTED category did not establish a root cause. This release exposes exact per-interval integrity state, last completed candle time, age at evaluation and closed row count. No claim that all provider outages are solved.

Coinbase requests now specify both start and end, bounded to 299 intervals; response row and OHLCV limits remain. Calendar range calculations remain independent. Official contract: https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles . Coinbase notes historical data may have missing intervals and recommends streams for real-time data; this remains a minute-refresh research service, not streaming execution data.

Validation rejects non-aligned timestamps and future buckets, malformed OHLCV, duplicate/gapped completed candles, insufficient history and stale closed candles. Current incomplete candles are excluded from detection, never used to grant a trigger. UI displays safe diagnostics without provider response bodies or credentials.

606/606 local tests, Vite build and whitespace diff check passed. Regression coverage includes 299-interval request windows, per-interval diagnostics, stale/gapped/future/misaligned rejection. Existing ranges and engine framework preserved. Gold/oil adapters, canonical forecast storage and calibration remain pending. Live trading OFF, WAIT/0R.
