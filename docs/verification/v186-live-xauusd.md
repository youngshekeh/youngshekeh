# V186 Live XAUUSD Engine

V186 separates live market data from execution permission.

## Source priority
1. Fresh owner-enrolled MT5 XAUUSD broker tick for current bid/ask/mid/spread.
2. Existing governed public Gold spine for COMEX/macro/structural context.
3. Fail closed when neither source is usable.

## Live tick contract
The relay sends observed_at, monotonic sequence, DEMO/REAL account mode, bid,
ask, terminal tick timestamp, flags, volume_real, terminal build, symbol digits
and point. No account number, balance, password, API key or order capability is
transmitted.

The public Gold page polls the lightweight live-price status every two seconds
while visible. Structural and diagnostic engines retain their slower governed
cadence. A fresh REAL-account quote may be used as a manual execution reference,
but machine execution and real-capital permission remain disabled.
