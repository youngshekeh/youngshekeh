# V280 Institutional provenance license-metadata hardening

**Date:** 24 October 2026. **Baseline:** V279 production `78b24910588275f99b5972651d6d4ef34235f377`.

A quarter-based research visualization must not classify public OHLC bands as valid unless **both Gold and Bitcoin assets** explicitly identify their market-data rights status as `COMMERCIAL_REDISTRIBUTION_NOT_VERIFIED`, both deny actual order-book liquidity and both use prior completed-quarter OHLC proxy methodology.

An unknown, missing or newly claimed licensed status is NOT sufficient. These labels report research provenance, not commercial licensing, which remains unverified. No paywall, redistribution entitlement, broker quote or order permission is created. Trust requires provider documentation and operator verification; never promote a remote flag claiming rights to a licensed state automatically.

V280 hardens null/malformed upstream quarterly source data (including missing `assets`), and adds fail-closed tests for missing rights on either asset, unknown/claimed approved codes and incomplete provider packets. The initial branch fixture had accidentally duplicated the Gold field and omitted Bitcoin; this was fixed before PR acceptance.

Only the pure presentation evaluator, its test fixture, and this operator note are changed. Live research source APIs, checkout, member auth, security policies, Supabase SQL, cron, funds, and `WAIT / 0R` are untouched. Follow full CI, exact SHA deployed production smoke, and record actual results. License rights, private DB health and commercial release remain uncertified.
