# V196 Live Feed Quality Probation

V196 prevents a newly connected MT5 relay from being treated as stable after a single packet.

## Certification gates
- latest tick age <= 5 seconds
- at least 3 valid ticks in the latest 60 seconds
- at least 5 seconds of observed tick span
- strictly increasing relay sequence
- terminal connected
- relay v186.0 on MetaTrader5 Python 5.0.6231 on Windows
- transport lag <= 5 seconds
- valid non-negative bid/ask spread
- DEMO or REAL market-data trade mode

The deterministic quality score is not a probability.

## States
NO_TICKS → PROBATION_WARMING → LIVE_FEED_QUALITY_PASS, with FEED_STALE and FEED_QUALITY_DEGRADED fail-closed states.

V196 is market-data certification only. It cannot authorize execution or capital.
