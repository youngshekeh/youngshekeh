THE FATHER ANALYTICS · V184 MT5 DEMO BRIDGE

1. Open MetaTrader 5 on Windows and sign in to a DEMO account.
2. In Owner Command, create a V184 demo bridge after MFA.
3. Copy the one-time PowerShell configuration shown there.
4. Keep the bridge key private. Do not paste MT5 passwords or broker credentials into the website.
5. The relay is read-only: it streams demo quotes and observes demo order/deal history. It contains no order submission code.
6. Stop the relay with Ctrl+C. To record the sandbox bridge kill-switch proof, run:
   python .\mt5-demo-bridge.py --kill-switch

Pinned dependency: MetaTrader5==5.0.6231
Capital permission remains 0R. Production order routing remains disabled.
