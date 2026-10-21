# V229 | Bound Gold reads to reduce database incident amplification

21 October 2026 UTC. V228 production commit 31f53071 READY. Gold read returned HTTP 503 at 09:31:15 UTC; broker status 503 at 09:33:25 UTC. V180 KERNEL_SEAL persisted and management SQL failed. 08:30–12:00 UTC sampled logs contained 143 pg_cron startup timeouts, 11 Supavisor authentication timeouts and 3 PostgREST 57014 timeouts.

V228 Gold gateway could wait for 11500ms plus 9500ms sequentially while public Gold page attempted refreshing every five seconds. V229 uses fixed-source sequential provider reads with 2800ms each (up to 5600ms combined upstream timeout budget). It makes no parallel call to a second overloaded provider when fresh broker proof is available. The browser request timeout is now 7500ms and its broker-live display uses the exact shared strict 5-second verification from V222; stale or malformed broker prices cannot be displayed as LIVE.

No live market data provider or bridge is yet proven connected. No source vendor contract or redistribution rights have been validated. This change does not repair database/pg_cron/PostgREST/V180 failure, private QA, OIDC, or real Flutterwave billing. No Supabase database, cron, Edge, credential, charge, entitlement or trade operations. Checkout stays disabled; capital WAIT / 0R. Validate all PR and post-merge CI, Vercel exact SHA and source archive.
