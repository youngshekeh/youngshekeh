# V201 MT5 Relay Doctor

V201 adds a local, read-only prerequisite doctor before V200 sends its one-shot smoke-test tick.

Checks:
- Windows host
- pinned MetaTrader5 Python package 5.0.6231
- bridge ID/key present in process environment
- XAUUSD provider symbol
- public V199 observability reachable
- local MT5 initialization
- terminal connected
- account metadata visible
- XAUUSD symbol selectable
- local bid/ask valid

The doctor performs no POST request, transmits no market tick, does not log in to MT5, and contains no order path. Any failed prerequisite exits nonzero and V200 stops before the one-shot tick.
