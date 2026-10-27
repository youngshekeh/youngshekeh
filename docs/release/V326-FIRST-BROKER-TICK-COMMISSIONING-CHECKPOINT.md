# V326 · First Real MT5 XAUUSD Tick Commissioning

**October 27, 2026 UTC · REVIEW ONLY · GitHub PR #293**

## Actual connected infrastructure status

Supabase project \`mpcelmjiycjpdyyflisn\`, read-only verified:
- One active/enrolled \`public.gold_live_market_bridges\`, \`mode=READ_ONLY_LIVE_MARKET_DATA\`, \`production_capable=false\`, \`live_order_submission_enabled=false\`.
- Its credential \`last_used_at=NULL\`, \`use_count=0\`. **Not yet authenticated by a sending relay**.
- **Zero** \`public.gold_live_xauusd_ticks\` rows and no last tick.
- One sandbox bridge and **zero** sandbox relay heartbeat rows. Paper broker quotes zero.
- Deployed \`broker-live-market-intake\` version 1 and authenticated owner \`broker-live-market-control\` version 1 already support real *read-only* XAUUSD tick transport. Deployed \`get_v186_gold_live_market_status\` status is \`LIVE_MARKET_BRIDGE_WAITING_FOR_TICK\` when bridge enrolled but no ticks.
- Deployed public \`public-gold-bridge-readiness-v195\` incorrectly infers \`first_tick_received\` from \`bridge.use_count\` or \`last_used_at\`, which increments on *authentication before tick insert*. This allows a false first-tick green marker when client authentication works but payload is rejected. V326 fixes this in **staged source only**, never yet deployed.
- Current deployed \`private.evaluate_v186_gold_live_tick\` requires: UTC ISO observed timestamp younger than 10 seconds (up to 5 seconds clock skew), bridge monotonic integer sequence, \`DEMO\` or \`REAL\`, positive bid/ask with <=1% spread, terminal build/connection, digits 1–6, point in (0,1], Windows OS, exactly Python MetaTrader5 package \`5.0.6231\`, relay \`v186.0\`. The receiver does **not** create trade orders.

## V326 code created

- \`scripts/v326_mt5_xauusd_read_only_relay.py\`: standalone Python script, **read-only MT5** on Windows. It has no \`order_send\`, trade initiation, login, password or account identifier code. Credentials are loaded from **environment variables only** and used solely for the pinned Supabase TLS Edge API endpoint. It never saves bridge secrets or broker credentials on disk; the local \`LOCALAPPDATA\` sequence file stores only a monotonic integer. Invalid client version, terminal, symbol, quote, timestamp, response, credential shape or redirected HTTP destination fail closed.
- \`docs/release/V326-REVIEW-ONLY-public-gold-bridge-readiness.ts\`: staged replacement for deployed v195. Real first tick proved from the trusted status RPC's **persisted quote observation**, not authentication count. Auth activity is displayed separately. Stale persisted tick is distinct from fresh tick. Public broker quote price is suppressed until the broker explicitly permits redistribution, and cache set to no-store. No public bridge ID, token, owner ID or account ID.
- \`tests/test_v326_mt5_read_only_relay.py\` and \`tests/v326-first-broker-tick-proof.test.mjs\`: offline isolated tests only; no external brokerage connection. All previous V317–V325 lifecycle, PostgreSQL/Chromium acceptance preserved in CI.

## Windows MT5 read-only first-tick commissioning runbook

**These commands run on a real owner-controlled Windows computer or Windows VPS where the MetaTrader 5 client is already installed and the terminal is logged into a legitimate account.** The ChatGPT cloud and GitHub CI cannot read your local MT5 session, run the Windows MT5 package, or retrieve an enrolled bridge key that was displayed only once. Do not paste passwords, one-time bridge key, account number or tokens into ChatGPT.

1. Review the source in PR #293, then obtain the script \`scripts/v326_mt5_xauusd_read_only_relay.py\` from that branch and save it on the Windows terminal. No code merges or server deployments required merely to test a single already-enabled *read-only* receiver.
2. Ensure a supported 64-bit Python installation and MetaTrader5 exact package version required by the **deployed** server: \`py -m pip install MetaTrader5==5.0.6231\`. Do not falsify the client version if the package cannot be installed, do not update the server requirements without source review and integration tests.
3. Confirm the terminal is connected, \`XAUUSD\` or the **exact broker-specific XAUUSD suffix** is visible in Market Watch, the market is open and live ticks are arriving. This only connects to the terminal's existing logged-in account and does not place orders.
4. In **the same Windows PowerShell session**, configure process-local environment variables, using the bridge key previously displayed by the real owner control system:
   \`\`\`powershell
   $env:TFA_LIVE_BRIDGE_ID = "<existing bridge numeric ID>"
   $env:TFA_LIVE_BRIDGE_KEY = "<existing secret bridge key displayed once>"
   $env:TFA_MT5_SYMBOL = "XAUUSD"  # use the exact broker symbol configured on the bridge
   py scripts/v326_mt5_xauusd_read_only_relay.py --self-test
   py scripts/v326_mt5_xauusd_read_only_relay.py --once
   \`\`\`
   Do not screenshot or commit secret values. Clear sensitive process environment values after testing or run a dedicated secured service account.
5. Observe only a sanitized \`V326_READ_ONLY_TICK_RECORDED WAIT_0R\` message. On success verify \`broker-live-market-intake\` GET and \`public-gold-bridge-readiness-v195\` with a new tick. The **currently deployed v195** may misinterpret auth count, so compare the server's \`get_v186_gold_live_market_status\` quote timestamp/quality and a new \`gold_live_xauusd_ticks\` row before certifying first-tick proof. Never certify merely from use_count.
6. To run repeated read-only prices: \`py scripts/v326_mt5_xauusd_read_only_relay.py --loop\`. This runs foreground. Add supervised service startup, clock synchronization, anti-crash and key-rotation only after security review. **No trading**.
7. If the existing secret key was lost, owner must revoke that bridge and enroll a fresh read-only bridge via the existing **owner AAL2** UI/control endpoint. No key extraction from PostgreSQL is possible or appropriate: only a SHA-256 hash is stored. Do not add a second bridge merely to get a green status.
8. Before including quote prices in a paid dashboard, secure documented data-display/redistribution rights for the exact provider feed. First real tick only proves ingestion, not licensing, reproducibility or execution safety.

## Acceptance after first real tick, not yet performed

- Recorded \`gold_live_xauusd_ticks\` >0, monotonic sequence, verified last observed/received timestamps under 3 seconds.
- HTTP authenticated read-only relay with authorized certificate, correct idempotent ack and zero duplicate/out-of-order errors.
- No orders/trades, no account identifiers/credentials in logs or browser data.
- All new V326 source, Python/Node/PG and Chromium tests green before promoting v326 public readiness to a controlled staging environment.
- Quote provider permission, Supabase instance backup inventory and **isolated restore** verified. Flutterwave signed sandbox/commercial payments remain separately OFF.
- Production website V311 and existing capital permission WAIT/0R until explicit real release acceptance.

**Boundary:** all source changes are saved only in a **draft GitHub PR**. Running the script on Windows is a distinct, user-controlled live read-only quote data action that has not been performed by ChatGPT or CI.
