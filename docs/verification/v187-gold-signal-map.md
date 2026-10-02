# V187 XAUUSD Signal Map

V187 adds deterministic Signal Day, Signal Time and multi-timeframe tradeable-zone detection to the live Gold surface.

- Live anchor: V186 read-only MT5 XAUUSD mid when fresh (<3s); otherwise delayed GC=F structural fallback.
- Signal Day score: framework signal-day flag, range expansion, breakout quality, resolved breakout/failure and structural pressure.
- Signal Time windows: Tokyo 08:00–10:00, London 08:00–10:30 and COMEX New York 08:20–10:30 in each venue's local time.
- Tradeable zones: Daily, Weekly, Monthly, Quarterly and Yearly lower quartile, equilibrium and upper quartile.
- When live XAUUSD is available, GC-derived structural zones are translated by the contemporaneous GC−XAU basis and explicitly labeled as a structural translation.
- Breakout timing includes first break time, bars since break, acceptance minutes, quality and false-break risk.
- Direction is a candidate classification only. V187 always returns WAIT / 0R and has no order route.
