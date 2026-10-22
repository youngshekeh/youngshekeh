# V234: Editorial homepage and independent read-only reference prices
Published source for source time: Gold API public spot XAU/USD https://gold-api.com/docs ; Coinbase spot BTC/USD https://api.coinbase.com/v2/prices/BTC-USD/spot .
The market-reference endpoint is independent of Supabase. It never fetches arbitrary URLs, accepts writes, or reads trading/checkout credentials.
Gold is marked INDICATIVE_SPOT and requires provider updatedAt within 120s. BTC Coinbase spot only provides amount, so shown as time of retrieval, not fake market-source timestamp or authenticated broker quote.
Two sources are isolated with Promise.allSettled; partial display is supported. Two brief timeouts and a 4s per-instance success coalescing cache reduce provider pressure; data freshness remains checked. No guarantee of uninterrupted uptime or price refresh without provider availability.
The visible editorial monitor replaces the decorative animated hero globe. Existing engines and risk systems are preserved unchanged and continue to fail closed if their upstream private kernel is unavailable.
Release: run all GitHub checks, validate Vercel prod build and smoke test endpoint from live origin. Keep WAIT/0R and checkout disabled. Never interpret public Gold API spot as MT5 authenticated bid/ask.
