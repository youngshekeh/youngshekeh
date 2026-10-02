#!/usr/bin/env python3
"""THE FATHER ANALYTICS V201 read-only MT5 relay doctor.

Performs local prerequisites only. It does not send a tick, authenticate the bridge
against intake, log in to MT5, or submit/modify/close orders.
"""
from __future__ import annotations
import json, os, platform, sys
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

EXPECTED_MT5_VERSION="5.0.6231"
OBSERVABILITY_URL=os.getenv("TFA_RELAY_OBSERVABILITY_URL","https://thefatheranalytics.com/api/gold-relay-observability-v199")
BRIDGE_ID=os.getenv("TFA_LIVE_BRIDGE_ID","").strip()
BRIDGE_KEY=os.getenv("TFA_LIVE_BRIDGE_KEY","").strip()
SYMBOL=os.getenv("TFA_MT5_SYMBOL","XAUUSD").strip()

def emit(name,ok,detail):
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: {detail}")
    return ok

def public_observability():
    req=Request(OBSERVABILITY_URL,headers={"Accept":"application/json","User-Agent":"THE-FATHER-ANALYTICS-V201-DOCTOR/1.0"})
    try:
        with urlopen(req,timeout=6) as response:
            body=json.loads(response.read().decode("utf-8"))
    except (HTTPError,URLError,TimeoutError,json.JSONDecodeError) as exc:
        return False,f"unreachable:{type(exc).__name__}"
    ok=body.get("ok") is True and body.get("symbol")=="XAUUSD"
    return ok,str(body.get("state","UNKNOWN"))

def main():
    checks=[]
    checks.append(emit("WINDOWS",platform.system()=="Windows",platform.system()))
    try:
        import MetaTrader5 as mt5
        version=str(getattr(mt5,"__version__",""))
        checks.append(emit("MT5_PYTHON_PACKAGE",version==EXPECTED_MT5_VERSION,version or "missing version"))
    except Exception as exc:
        mt5=None
        checks.append(emit("MT5_PYTHON_PACKAGE",False,f"import failed:{type(exc).__name__}"))

    checks.append(emit("BRIDGE_ID",BRIDGE_ID.isdigit() and int(BRIDGE_ID)>0,"configured" if BRIDGE_ID else "missing"))
    checks.append(emit("BRIDGE_KEY",BRIDGE_KEY.startswith("tfa_live_") and len(BRIDGE_KEY)>=49,"configured" if BRIDGE_KEY else "missing"))
    checks.append(emit("XAUUSD_SYMBOL",SYMBOL.startswith("XAUUSD"),SYMBOL or "missing"))

    public_ok,public_state=public_observability()
    checks.append(emit("SERVER_OBSERVABILITY",public_ok,public_state))

    if mt5 is not None and platform.system()=="Windows":
        initialized=False
        try:
            initialized=bool(mt5.initialize())
            checks.append(emit("MT5_INITIALIZE",initialized,"connected to local terminal" if initialized else str(mt5.last_error())))
            if initialized:
                terminal=mt5.terminal_info()
                account=mt5.account_info()
                selected=bool(SYMBOL and mt5.symbol_select(SYMBOL,True))
                tick=mt5.symbol_info_tick(SYMBOL) if selected else None
                checks.append(emit("MT5_TERMINAL_CONNECTED",bool(terminal and getattr(terminal,"connected",False)),"connected" if terminal and getattr(terminal,"connected",False) else "not connected"))
                checks.append(emit("MT5_ACCOUNT_VISIBLE",account is not None,"account metadata available" if account is not None else "unavailable"))
                checks.append(emit("MT5_SYMBOL_SELECTED",selected,SYMBOL))
                valid_tick=bool(tick and float(getattr(tick,"bid",0) or 0)>0 and float(getattr(tick,"ask",0) or 0)>=float(getattr(tick,"bid",0) or 0))
                checks.append(emit("MT5_XAUUSD_TICK",valid_tick,"local bid/ask available" if valid_tick else "invalid or unavailable"))
        except Exception as exc:
            checks.append(emit("MT5_LOCAL_PREFLIGHT",False,f"{type(exc).__name__}:{exc}"))
        finally:
            if initialized:
                try: mt5.shutdown()
                except Exception: pass

    passed=all(checks)
    print("")
    print("V201 RESULT:", "READY_FOR_ONE_SHOT_TICK" if passed else "BLOCKED")
    print("No market data was transmitted by this doctor. Orders remain OFF. Capital remains 0R.")
    return 0 if passed else 1

if __name__=="__main__":
    sys.exit(main())
