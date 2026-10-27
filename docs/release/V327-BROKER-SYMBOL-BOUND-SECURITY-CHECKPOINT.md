# V327 · Symbol-Bound MT5 Relay + No Public Price Leakage

**Date:** 2026-10-27 UTC · **Status:** REVIEW ONLY · **Draft PR:** #294
**Branch:** `security/v327-broker-symbol-provenance`, cumulative on V326.
**Production:** V311 remains deployed and unchanged. This source is NOT deployed.

## Verified production findings, read only

- Supabase live-read-only bridge registry contains **one active XAUUSD bridge**, no successful bridge credential authentication (`last_used_at IS NULL`), and **zero persisted broker tick records** in `public.gold_live_xauusd_ticks`.
- Kernel sample was **HEALTHY**, last success 2026-10-27 07:09:45 UTC, zero consecutive failures and dead letters. Vercel production remained **READY**, Git SHA `03fa474389fdf704bff1d0ab434840063a6a33c1`.
- Already deployed `broker-live-market-intake` Edge v1 uses service role to query `get_v186_gold_live_market_status`. Its GET returns private RPC fields unchanged including **broker mid, bid/ask, bridge identifier, label and terminal metadata** if a broker tick arrives. There are zero actual ticks currently, so this is **a prospective data exposure**, not evidence that a client's live quote has already leaked.
- On POST, the deployed intake authorizes an enrolled bridge but does **not** compare the broker-specific `XAUUSD` suffix actually relayed against the bridge's stored `provider_symbol`. A misconfigured owner-operated relay can send the wrong symbol under a valid bridge key.
- The V326 relay allows a known-symbol read-only tick from a Windows terminal but lacks transient retry and exact symbol assertion; V326 readiness's credential-vs-tick fix is **also only staged**.
- Live market-data redistribution/display licences are not verified. Receiving a quote does not establish resale rights or safe algorithmic order execution.

## V327 staged code and protections

1. `docs/release/V327-REVIEW-ONLY-broker-live-market-intake.mjs`: copy of the actual deployed Edge handler with strict `X-TFA-MT5-Symbol` header. It requires the relay's declared symbol to exactly equal **the authenticated bridge's enrolled `provider_symbol`** before ingest. Invalid symbol and mismatched suffix reject with HTTP 422 without writing a tick. A header alone is **client assertion, not independent proof** of a broker terminal.
2. Unauthenticated GET is now a **redacted health envelope** only: active/none/stale, first saved tick evidence, vetted observed-at and independent age/clock-skew check, independent fresh flag. No spot/bid/ask/mid price, owner ID, bridge key, bridge ID, account number, source code or terminal details. Even if upstream incorrectly claims `BROKER_LIVE`, stale or future source observations are demoted to `BROKER_STALE`. `Cache-Control: no-store` and governance `WAIT/0R` in all cases.
3. POST only replies with a minimal ACK: persisted/not, recorded/duplicate/rejected, symbol binding boolean and immutable `WAIT/0R` governance. No private database RPC raw rows, tick IDs, URLs, provider identity or quote prices are returned.
4. `docs/release/V327-REVIEW-ONLY-broker-live-market-index.ts`: self-contained Deno deployment wrapper importing the staged handler module, kept separate from the live Edge.
5. `scripts/v327_mt5_xauusd_symbol_bound_relay.py`: owner-operated **Windows MetaTrader5 read-only** relay candidate sending exact configured symbol header, narrow accepted account trade-mode enumeration, strict schema, capped 3-attempt same-sequence retry only on transport HTTP/connectivity errors while the tick remains younger than 8 seconds. No automated trading, no account login, no storage of broker/bridge secrets or endpoint redirects.
6. `tests/v327-broker-symbol-bound-intake.test.mjs`: full Node24 execution of the staged Edge handler with isolated fake Supabase REST and synthetic live quote records. Checks GET redaction, missing/bad/stale/future prices, exact symbol match, no unauthorized ingest, sanitized duplicate/idempotent ACK, method disallow and 0R.
7. `tests/test_v327_mt5_symbol_bound_relay.py`: pure Python offline tests for exact header, bounded retry with same sequence, expired/no retry, strict account mode, invalid responses, hardcoded TLS destination, and no order commands.
8. Cumulative CI still includes the V317–V326 atomic payment, cancellation, billing liveness and incidents, owner AAL2 and safe market-source tests, plus browser acceptance.

## Important staged-vs-live sequencing

**Do not claim production symbol binding is enforced yet.** The deployed v1 receiver ignores the new symbol header. Running the V327 relay against the old v1 handler does not establish symbol binding even if it successfully inserts a read-only tick. A safe production rollout must deploy an explicitly reviewed intake change together with appropriate V326 public-bridge-status correction after owner review, rights check, real Edge staging test and rollback preparation.

V327 does **not** repair Gold spot archive (last seen 2026-09-15), establish licensed Gold/DXY/Oil/BTC feeds, connect a real Windows MT5 terminal, change Supabase project data or run live trades.

## Acceptance and next actions

- On a real authorized Windows host, have the actual owner confirm an enrolled bridge ID and private one-time key using owner AAL2. **Never paste bridge key, Supabase keys, password or broker account numbers into ChatGPT/GitHub.**
- Verify in a controlled test that a valid symbol/key/tick is accepted and an exact-symbol-suffix mismatch is denied **before** considering replacing production intake.
- Once source deployment is explicitly approved, require independent tick receipt and timestamp from `gold_live_xauusd_ticks` (currently zero). Credentials/use count are not enough.
- Verify the registered market-data source explicitly licenses the intended display/redistribution. Do not expose executable quotes or broker credentials in public GET.
- Resolve backup inventory/isolated restore, real Flutterwave signed merchant sandbox and stuck billing jobs, legitimate second AAL2 owner, member RLS/security and controlled rollback. These remain outside V327.

**Immutable:** Production V311 READY, checkout/charges OFF, commercial HOLD, all automatic trading disabled, `WAIT / 0R`. This draft does not deploy, change production SQL, Edge, cron, credentials, subscriptions or market data.
