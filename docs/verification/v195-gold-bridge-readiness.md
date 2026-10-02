# V195 Broker Bridge Commissioning

V195 turns the V186 connection gap into a deterministic commissioning state machine.

## Gates
1. Owner AAL2 bridge enrolled.
2. First authenticated MT5 tick received.
3. Broker quote is fresh.
4. Broker state is live.

## Public privacy boundary
Only aggregate counts and readiness states are public. Bridge IDs, one-time keys, owner identity and broker account numbers are never exposed.

## State progression
- NO_BRIDGE_ENROLLED
- BRIDGE_ENROLLED_WAITING_FIRST_TICK
- BRIDGE_ACTIVITY_WITHOUT_FRESH_QUOTE / BROKER_QUOTE_STALE
- BROKER_LIVE

## Governance
Commissioning cannot authorize a trade. V195 remains market-data only with WAIT / 0R, machine execution off and live order submission off.
