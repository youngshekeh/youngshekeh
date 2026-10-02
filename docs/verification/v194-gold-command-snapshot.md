# V194 Gold Command Snapshot

V194 adds one canonical, read-only command surface above V186–V193.

## Inputs
- V186 live XAUUSD broker bridge
- V187 Signal Day / Signal Time / multi-timeframe zones
- V188 lifecycle and session liquidity
- V189 trigger watch and review gate
- V191 immutable material-event ledger
- V192 alert router
- V193 owner inbox represented only as an AAL2-protected review capability. Private owner payloads are never exposed publicly.

## Compression
The snapshot publishes one deterministic state, current blockers, latest material event, alert state, next signal window, component freshness, tradeable-zone context, and the decision-compression triplet: what changed, what matters, what is permitted.

A disconnected broker feed is a valid machine state, not a fabricated live price. Structural GC context may remain visible while XAUUSD live price stays withheld.

## Governance
V194 cannot place, prepare or transmit an order. HUMAN_REVIEW_READY still means WAIT / 0R. Acknowledgement in V193 is evidence handling only and cannot become trade approval.
