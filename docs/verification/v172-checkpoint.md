# V172 paper broker quote intake

V172 adds an owner-authenticated demo XAUUSD quote intake, a sanitized public status and a Gold dashboard panel. It is a connection foundation, not a broker connection or a live order adapter. No real broker source is connected.

The existing owner registry and verified Supabase user session authorize writes. MFA assurance `aal2` is required after server-side token validation; identity is resolved from that verified session. Public GET only returns sanitized paper status. Direct table and RPC access is revoked from anon/authenticated roles. The Edge function uses custom authentication (`verify_jwt=false`) to support anonymous status reads while enforcing owner/MFA for every POST. API credentials remain server-side; modern secret keys use the apikey header.

Quotes must declare PAPER_DEMO, canonical asset XAUUSD and BROKER_DEMO_USER_SUPPLIED provenance. Provider symbol aliases such as XAUUSDm are retained. Numeric bid/ask, positive spread capped at 2% of bid, explicit timestamp timezone, age below ten seconds, no future timestamp, and an integer sequence are required. Claimed verification, execution grade or live-order permission is rejected. Accepted quotes are append-only; serialized owner/source intake enforces identical replay idempotency, conflicting/old sequence rejection, non-regressive quote time and a one-per-second source rate limit. These thresholds govern paper intake only and establish no execution SLA.

The public status rechecks freshness on every request and withholds stale prices. The browser independently withholds expired/future/malformed prices and checks expiry every second, including without a network refresh. A recent connected feed refreshes every five seconds while the tab is visible. No feed produces NOT_CONNECTED and no invented quote. The demo spread is a received bid/ask difference, not realized trading cost or independently verified broker data.

## Validation and live boundary

- Migration includes 31 deterministic quote cases, a null-clock case and nine transactional ingest/replay/immutability cases, plus privilege assertions. All passed atomically. Synthetic quote rows were rolled back; identity sequence gaps are expected.
- 15 handler tests cover owner/MFA, identity substitution, denied unauthenticated writes, malformed/oversized bodies and replay/rate response codes. Nine browser-view tests cover expiry and fail-closed display.
- Live Edge status: HTTP 200, NOT_CONNECTED, latest quote null. Anonymous live POST: HTTP 401, missing_token. No test broker quote remains persisted.
- Security advisor reported zero ERROR/WARN notices; the existing INFO notice concerns RLS tables without direct-client policies. New quote table intentionally has no direct-client policies.
- Full runtime QA passed 77/77 on its first V172 run at 2026-10-01T19:06:21.965Z. The three added checks cover paper status, live anonymous denial and the Gold surface. Production closure remained RESEARCH_AND_PAPER_PRODUCTION_READY_LIVE_EXECUTION_LOCKED; all 44 registered modules retained their contracts.
- All 26 pull-request workflows passed, including the production Vite build and V172 tests. The feature-branch V172 push check also passed (27 successful runs total). PR #110 merged as `69af8bd4d7e7b6f871aa9f0614b3f0ca1292874b`.
- Vercel production deployment `dpl_H2iexdHXUrgPRDEtQVAhW7R1TvDR` is READY and assigned to thefatheranalytics.com. Gold HTML returned HTTP 200 with the new panel. The browser initially displayed UNAVAILABLE with all prices withheld, then recovered on its normal refresh to NOT CONNECTED. A direct request with the browser's public-key/Origin headers returned HTTP 200 and valid CORS headers. No application console error was captured; the cause of the initial unavailable response was not established. Visual inspection confirmed the final panel and surrounding simulation lab.
- Applied database migration: `20261001185208_v172_paper_broker_quote_intake`. Quote intake Edge version 1 is ACTIVE. Runtime QA Edge version 43 is ACTIVE with the existing private authentication boundary preserved.

WAIT / 0R, live orders OFF, execution-grade=false and broker-verified=false are fixed boundaries. V172 does not clear the delayed-market-feed, sample maturity, spread/slippage, production reconciliation, kill-switch or human release gates. Existing research engines, report sections and D/W/M/Q zones remain intact. No cron schedule is added or changed.

## Source connection contract

POST a JSON quote to `https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/paper-broker-quote-intake` with the active owner's Supabase access JWT (MFA aal2) in Authorization. A publishable API key may be supplied as apikey; never put a service-role key on a user device. Quote fields: mode=PAPER_DEMO, asset=XAUUSD, provenance=BROKER_DEMO_USER_SUPPLIED, source_code (3–64 uppercase letters/digits/underscore/hyphen), provider_symbol (XAUUSD plus optional suffix), sequence (positive safe integer), observed_at (ISO timestamp with timezone), bid and ask (JSON numbers). The timestamp/sequence must originate with the demo quote; do not retimestamp an old quote to bypass freshness. This is an intake contract, not a completed MT5 exporter.

A signed-in owner's real authenticated HTTP quote submission and broker-origin verification have not been exercised; handler auth tests use controlled mocks and database integration tests use the existing active owner only inside a rolled-back transaction. These tests do not prove a genuine broker feed.

For recovery, `v172-disable-paper-intake.sql` revokes service-role ingestion and insert authority while retaining read status and immutable evidence. Frontend publication can be reverted independently. Do not drop evidence tables or delete receipts to roll back the intake.
