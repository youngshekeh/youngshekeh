# V200 MT5 Relay Launch Protocol

The Owner Command one-time Windows snippet now fails closed before continuous streaming.

Sequence:
1. Download the signed-in-terminal read-only relay.
2. Pin MetaTrader5 Python package 5.0.6231.
3. Set the one-time bridge ID/key and XAUUSD symbol in process environment variables.
4. Run the relay with --once.
5. Stop immediately if the relay exits nonzero.
6. Query public V199 relay observability.
7. Require first_tick_seen before proceeding.
8. Start continuous read-only streaming.

The relay still contains no MT5 login, order create, modify, cancel or close path. V200 changes launch verification only and cannot unlock capital or execution.
