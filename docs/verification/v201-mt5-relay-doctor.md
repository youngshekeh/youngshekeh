# V201 MT5 Relay Doctor

V201 is a read-only Windows-side preflight for the V186/V200 XAUUSD market-data bridge.

It checks:
- Windows runtime
- presence of bridge ID and bridge key without printing either value
- requested XAUUSD symbol form
- MetaTrader5 Python package pinned at 5.0.6231
- local MT5 initialization
- terminal connection
- supported DEMO or REAL quote mode without exposing account number
- XAUUSD symbol discovery
- current broker bid/ask availability
- V186 intake endpoint reachability
- V199 observability endpoint reachability

The doctor does not send a tick. V200 invokes it first and halts if any prerequisite fails. Only after V201 passes does V200 send a one-shot read-only tick, verify V199 first_tick_seen, and then start continuous streaming.

No login, order, modify, cancel or close path exists. WAIT / 0R remains unchanged.
