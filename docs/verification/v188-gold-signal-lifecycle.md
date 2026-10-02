# V188 Gold Signal Lifecycle + Session Liquidity

V188 closes the session-structure gap in the Gold Live engine.

- Private runtime extracts Asia, London and New York/COMEX signal-window ranges from delayed GC=F 5-minute bars.
- Each venue exposes high, low, open, close, first-30-minute opening range and same-venue sweep/acceptance state.
- Cross-session logic compares London versus Asia and New York versus London.
- V188 fuses V187 Signal Day/Signal Time with V79 liquidity phase, acceptance, extension and exhaustion.
- Lifecycle states include NORMAL_DAY, PRE_SIGNAL_WINDOW, WAITING_FOR_LIVE_XAUUSD, ACTIVE_SIGNAL_SCAN, LIQUIDITY_RAID, RECLAIM_ACCEPTED, ACCEPTANCE_CONFIRMED, EXTENSION_ACTIVE, EXTENSION_EXHAUSTION_WATCH and OFF_WINDOW_STRUCTURE_WATCH.
- When V186 has a fresh live XAUUSD quote, session levels are translated from delayed GC futures to XAUUSD with the same contemporaneous basis used by V187.
- Detector score is deterministic completeness, not a probability or expected return.
- V188 cannot submit orders and always preserves WAIT / 0R.
