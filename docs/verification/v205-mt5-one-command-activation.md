# V205 MT5 one-command activation launcher

V205 moves the Windows activation sequence into a versioned public PowerShell launcher while keeping the one-time bridge key only in the current Owner Command session.

Sequence:
1. Validate Windows, bridge environment variables and XAUUSD symbol.
2. Download the V201 doctor and V186 read-only relay into a temporary working folder.
3. Pin MetaTrader5 Python package 5.0.6231.
4. Run V201 and stop on any failed prerequisite.
5. Send exactly one V200 smoke-test tick.
6. Poll V204 for first_tick_accepted for up to 60 seconds.
7. Enter continuous read-only streaming only after server confirmation.
8. Restart an unexpectedly exited relay at most five times, then fail closed.

The launcher never prints the bridge key, never logs in to MT5 and contains no order path. Live-data activation cannot change WAIT / 0R governance.
