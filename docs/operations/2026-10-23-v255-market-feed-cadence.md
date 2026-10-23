# V255 | Independent market source cadence and alert data freshness

2026-10-23. Public Market Observatory release. No Supabase schema, Edge function, private cron, broker, customer account or payment changes.

## Evidence motivating this
V254 displayed 9/9 valid prior-quarter research zones; the public Gold/BTC API and delayed Oil/DXY API returned verified recent source-time observations on 2026-10-23 at 16:18 UTC. Supabase public readiness remained BUILD_HOLD with POSTGREST_RUNTIME_UNAVAILABLE and AUTH_UNAVAILABLE; private V180 scheduled heartbeats were failing the mandatory database seal even while Supabase control plane reported ACTIVE_HEALTHY and direct read-only SQL could return 21 sessions, 2 active, no waiting locks.

**Bug:** Quarterly Observatory polls all three independent feeds once every 60 seconds. Coinbase BTC receipt expires after 30 seconds, causing avoidable missing price/alert time. The nine-source quarterly historical response requires multiple Yahoo/Coinbase HTTP requests and remains valid for 12 minutes, with provider results cached for 8 minutes; 60-second polls are unnecessary.

## V255 implementation
- Strict client-side source schedule: **Gold and BTC public spot references every 15 sec**, **delayed NYMEX Oil futures/ICE DXY references every 30 sec**, **quarterly OHLC ranges every 300 sec**, while the UI independently revalidates source age every 15 sec.
- Separate in-flight request/cancel state per stream and bounded 7-second spot/macro, 9.5-second quarterly fetch budgets. One failed stream cannot overwrite another. Manual Refresh independently requests all three.
- Pure fail-closed `market-feed-cadence.mjs` confirms public research, exact source/verifier, 0R and orders OFF for every packet. Source state strip reports independently which lanes have verified content, partial data, or are unavailable. No private-data request.
- Existing quarterly OHLC computation, V254 two-observation event ledger, notification user opt-in, trading safeguards and no-background-delivery statement remain unchanged.
- Historical data endpoint requests drop from **up to 60/hour to 12/hour per active tab** (5x fewer). This does not guarantee the vendor sees 5x fewer requests because server caches, other visitors and distributed functions affect upstream traffic.
- Public market source licensing/redistribution still unverified. WTI Oil is futures and Gold quarterly zones are GC COMEX futures, not Gold API XAU spot.

## QA acceptance
Run all V241–V255 suites, full repository test, Gold and launch truth security gates, production Vercel deploy exact reviewed commit and validate public spot/macro/quarterly APIs. Assert 9/9 historical source availability when provider observations meet coverage, retain fallback UNAVAILABLE otherwise. Alert permission button browser click test remains unverified without actual interactive QA.

## Rollback
Revert V255 Observatory stream refresh source/HTML status/CSS and pure source admission helper. No persistent DB or Vercel environment mutation; no live trading.
