# V185 Demo Broker Bridge Health Attestation

V185 adds a health preflight in front of V184 sandbox evidence.

## New evidence boundary
- Every machine-to-machine quote/fill request is authenticated by the V184 bridge key.
- Before V183 accepts sandbox evidence, V184 intake checks the latest V185 heartbeat for that same bridge.
- The heartbeat must be fresh and healthy: Windows client, DEMO trade mode, relay v185.0, MetaTrader5 5.0.6231, XAUUSD resolved, terminal connected and history readable.
- Heartbeats are append-only, sequenced and replay-protected.
- Health telemetry never counts as trading evidence and cannot unlock capital.
- No account login, password, broker API key or other credential is stored in health telemetry.
- The MT5 relay remains read-only and contains no order_send path.

Production governance remains WAIT / 0R.
