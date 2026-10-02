# V202 Relay Connectivity Event Ledger

V202 persists only material V199 connectivity-state changes.

## Source
The public reader consumes the canonical V199 relay observability endpoint. Public callers cannot submit event bodies.

## Stored event classes
- bridge credential issued / absent
- intake authentication first seen
- first accepted tick
- sustained relay streaming
- relay stale / recovery
- current next-step code and aggregate counters

Bridge IDs, bridge keys, tick sequence numbers, owner identity and broker account numbers are excluded.

## Integrity
- append-only table
- UPDATE and DELETE blocked by trigger
- state fingerprint prevents unchanged event spam
- global SHA-256 previous-event chain
- read RPC verifies both previous-hash links and event-hash contents
- database constraints enforce WAIT / 0R / automatic_execution=false / live_order_submission_enabled=false

## Access
RLS is enabled. anon/authenticated table access is revoked. Capture and read RPC execution is restricted to the backend service role. The public Edge Function emits only sanitized ledger data.

The Supabase advisor may report RLS-without-policy as informational because this table intentionally has no client policy.
