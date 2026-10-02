THE FATHER ANALYTICS · V186 LIVE XAUUSD READ-ONLY BRIDGE

This package streams current XAUUSD bid/ask market data from an already logged-in
MetaTrader 5 terminal to THE FATHER ANALYTICS.

Safety:
- DEMO and REAL accounts may supply quotes.
- No MT5 password is requested or stored.
- No order_send, order_check, login, order modification or close path exists.
- The bridge cannot unlock capital or submit an order.
- Capital permission remains 0R.

Install:
python -m pip install MetaTrader5==5.0.6231

Create a V186 live-market bridge in Owner Command after MFA, copy the one-time
PowerShell configuration, and run mt5-live-market-bridge.py on the Windows PC
where MT5 is already open and logged in.
