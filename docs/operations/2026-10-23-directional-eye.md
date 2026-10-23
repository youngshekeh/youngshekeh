# Directional Eye v1 — research implementation

Added after WHAT CHANGED on the homepage. Existing engines and all capital gates are preserved.

The pure model accepts source-attributed, contiguous completed 1m and 5m candles (at least 60 each). It detects compression, proximity to the prior 20-bar range, sweep/reclaim, volume anomalies, and a two-bar breakout/retest with minute-close agreement. A volume anomaly is not evidence of institutional identity. Readiness is five equal rule checks, not an estimated probability. ATR targets and a 60-minute research horizon are hypotheses requiring calibration.

The read-only endpoint attempts Coinbase Exchange BTC-USD candles with bounded requests. Every other asset is explicitly unavailable until an attributed candle adapter is implemented. Existing spot quote feeds are not repurposed into candles. No R540 levels or unsupported prices are embedded. WAT windows use date-specific London/New York daylight saving conversion; holiday/session calendar validation remains pending.

ARMED/TRIGGER snapshots can be exported from the current tab (maximum 500). This is not the persistent canonical forecast ledger. No outcome scoring, backtest, MFE/MAE, win rate, EV or calibrated probability is claimed. Refresh runs while the page is open; this is not unattended alert delivery. Automatic live trading is disabled.

Validation: six behavioral model tests pass. Full local Node suite: 595/595 passed. Runtime request from this environment returned UNAVAILABLE for every asset; live BTC provider connection has not been verified here. Browser visual QA and real historical expansion backtesting are pending. Public research publication must not be described as a validated early-move prediction system.
