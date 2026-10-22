# V248 · Independent Market Observatory public release

Date: 2026-10-22. Production target: `/market-observatory/`.

## Why
Private Supabase Postgres/Supavisor connections remain intermittent. Latest V180 scheduler samples at 19:44 and 19:50 UTC produced 503 with kernel-seal transport failure or 70-second upstream timeout. Database control plane `ACTIVE_HEALTHY` does not certify the kernel. 58 pg_cron jobs remain active and unchanged.

## What ships
- A new bright, editorial, responsive, accessible public research desk at `/market-observatory/`, linked from homepage, live markets and status.
- Gold: attributed **Gold API** indicative spot, showing the actual provider `updatedAt` timestamp, never a fabricated broker bid/ask.
- Bitcoin: attributed **Coinbase** spot receipt time. Its provider's original price timestamp is not supplied, so it is **not** claimed to be source-timestamped.
- A read-only, in-tab observation trace assembled solely from **actual source-verified public API responses received while the page is open**. It is explicitly labeled session-only, auto-scaled and not historical exchange candles.
- Every second, source validity is rechecked; Gold source age >120 seconds and BTC receipt age >30 seconds are withheld. Retries every 15 seconds when tab visible and manual refresh. Any HTTP/upstream failure clears current observations rather than showing stale success.
- No additional Supabase, private QA, payment, broker/execution dependencies. No generated forecast probabilities.

## Gates and limits
- Public source availability is independent of authenticated private kernel, browser token, customer data, trading and paid membership.
- `WAIT / 0R`, live orders OFF, checkout locked, no private runtime certification inferred from public prices.
- Browser memory only for the history trace. No local storage, persistence or data store. Closing tab clears trace.
- V248 QA covers shape, timestamp integrity, stale/future expiry, receipt vs source timestamp, simulated history prevention, bounded data retention and static route.
- Full repository GitHub suite, build, existing V241–V248 integrity suite and Vercel READY required before production release.

## Verification after release
1. Check homepage, `/market-observatory/`, `/live-markets/`, `/status/`, and `/api/public-market-reference` load from production.
2. Check source timestamp attributed correctly; Gold source recent or unavailable, BTC receipt not source timestamp.
3. Check V156 Gold Live first paint still `OFF / 0R` and unverified when live broker evidence missing.
4. Observe V180 private heartbeat separately. A successful public data API call does **not** resolve the underlying Supavisor incident.

## Next block
Infrastructure support should inspect DB authentication (SQLSTATE 08006), cron startup timeouts, IO/CPU/pool connection pressure, and PostgREST exhaustion. Do not globally disable cron to make the launch gate green.
