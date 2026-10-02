# V184 MT5 Demo Bridge

V184 connects an already logged-in MetaTrader 5 **demo account** to the V183 sandbox evidence ledger.

## Safety boundary
- The relay refuses non-demo accounts.
- It contains no order submission, modification or closing path.
- It never asks for an MT5 password.
- Bridge credentials authorize only sandbox evidence intake.
- Production broker verification stays false and capital permission stays 0R.

## Enrollment
1. Sign in to Owner Command and complete MFA.
2. Create a V184 bridge with your MT5 XAUUSD provider symbol.
3. Copy the one-time bridge key immediately. Only its SHA-256 digest is stored server-side.
4. On the Windows machine running MT5, install the official MetaTrader5 Python package.
5. Set TFA_BRIDGE_ID, TFA_BRIDGE_KEY and TFA_MT5_SYMBOL, then run scripts/mt5-demo-bridge.py.

The bridge publishes fresh bid/ask observations and watches new demo deal history. A broker-history order record is relayed as ORDER_ACK before its matching FILL receipt. TFA_SANDBOX_REQUESTED_R is a research annotation used by the sandbox receipt schema and is not a broker-measured value.

Run with --kill-switch to emit a sandbox bridge kill-switch acknowledgement and terminate the relay.

## Direct download
The production site publishes the same audited relay at /downloads/mt5-demo-bridge.py and a pinned requirements file at /downloads/requirements-mt5-bridge.txt. The Owner Command one-time configuration uses MetaTrader5==5.0.6231.
