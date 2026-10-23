# Bitcoin visible order-book depth research lane

Adds independent read-only /api/bitcoin-liquidity and a shared public Eye subpanel. Existing candles, aligned windows, measured calendar ranges and all engines remain intact. No credentials, database writes, broker calls or trading operations.

The fixed Coinbase Exchange BTC-USD level-2 endpoint returns aggregated order-book levels. Only the first 20 sorted levels per side are analyzed. Size is already aggregated and is never multiplied by order count. Metrics: best bid/ask, spread USD/bps, USD notional depth, price spans and (bid USD - ask USD)/(bid USD + ask USD). This is a single-venue observation, not institutional positioning, hidden liquidity, flow or directional probability.

Validation requires positive finite prices/sizes and integer order counts, correctly ordered unique top levels, uncrossed quotes, valid sequence, no auction state and a source timestamp within 30 seconds (2-second future tolerance). Bounds: 2 MB streamed JSON, 3.5-second provider timeout, 5-second server cache/single-flight, visible-tab polling every 15 seconds, 1-second client expiry clearing. No outdated metrics survive source expiry.

611/611 local Node tests, Vite production build and whitespace check passed. Behavioral tests cover aggregated-size arithmetic, stale/future/missing timestamps, crossed/unsorted/malformed books, auctions, expiry, governance, top-20 limits, HTTP errors, oversized bodies and invalid JSON.

Official provider contract: https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-book . This remains a polled snapshot, not a maintained streaming order book. Gold/oil verified candles, persistent forecast ledger and calibration remain pending. WAIT/0R; live trading OFF.
