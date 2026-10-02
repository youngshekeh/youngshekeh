# V199 First-Tick & Relay Observability

V199 distinguishes bridge enrollment from actual relay contact.

States:
- NO_BRIDGE_ENROLLED
- CREDENTIAL_ISSUED_AWAITING_RELAY
- AUTH_REACHED_AWAITING_ACCEPTED_TICK
- FIRST_TICK_ACCEPTED_PROBATION
- RELAY_STREAMING
- RELAY_STALE

Because V186 authenticates the bridge before validating and ingesting the tick body, an incremented bridge use count with zero accepted ticks means the credential reached intake but no tick was accepted. This distinction makes relay troubleshooting observable without exposing bridge IDs, secrets, owner identity, tick sequence values or account numbers.

V199 never grants trade permission. It is market-data observability only and remains WAIT / 0R.
