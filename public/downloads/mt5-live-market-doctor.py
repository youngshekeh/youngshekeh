#!/usr/bin/env python3
"""THE FATHER ANALYTICS V201 MT5 live-market relay doctor.

Read-only diagnostics for the V186 XAUUSD bridge. This script never logs in,
places orders, modifies positions, prints broker credentials, bridge keys,
account numbers or broker server names.
"""
from __future__ import annotations
import argparse, json, os, platform, sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

EXPECTED_MT5_VERSION="5.0.6231"
INTAKE_URL=os.getenv("TFA_LIVE_MARKET_URL","https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/broker-live-market-intake")
OBS_URL="https://thefatheranalytics.com/api/gold-relay-observability-v199"
BRIDGE_ID=os.getenv("TFA_LIVE_BRIDGE_ID","").strip()
BRIDGE_KEY=os.getenv("TFA_LIVE_BRIDGE_KEY","").strip()
REQUESTED_SYMBOL=os.getenv("TFA_MT5_SYMBOL","XAUUSD").strip()

def emit(name, ok, detail, rows):
    rows.append({"check":name,"ok":bool(ok),"detail":str(detail)})
    mark="PASS" if ok else "FAIL"
    print(f"[{mark}] {name}: {detail}")

def safe_get_json(url, headers=None, timeout=6):
    req=Request(url,headers=headers or {"Accept":"application/json","User-Agent":"THE-FATHER-ANALYTICS-V201-DOCTOR/1.0"})
    with urlopen(req,timeout=timeout) as response:
        return response.status,json.loads(response.read().decode("utf-8"))

def main():
    parser=argparse.ArgumentParser(description="THE FATHER ANALYTICS V201 read-only MT5 relay doctor")
    parser.add_argument("--json",action="store_true",help="Print a final JSON summary.")
    args=parser.parse_args()
    checks=[]
    emit("windows_client",platform.system()=="Windows",platform.system() or "unknown",checks)
    emit("bridge_id_present",BRIDGE_ID.isdigit() and int(BRIDGE_ID)>0,"present" if BRIDGE_ID else "missing",checks)
    emit("bridge_key_present",BRIDGE_KEY.startswith("tfa_live_"),"present" if BRIDGE_KEY else "missing",checks)
    emit("symbol_requested",bool(REQUESTED_SYMBOL) and REQUESTED_SYMBOL.upper().startswith("XAUUSD"),REQUESTED_SYMBOL or "missing",checks)

    try:
        import MetaTrader5 as mt5
        pkg=str(getattr(mt5,"__version__",""))
        emit("mt5_python_package",pkg==EXPECTED_MT5_VERSION,f"{pkg or 'unknown'} (expected {EXPECTED_MT5_VERSION})",checks)
    except Exception as exc:
        emit("mt5_python_package",False,f"import failed: {type(exc).__name__}",checks)
        mt5=None

    if mt5 is not None:
        initialized=False
        try:
            initialized=bool(mt5.initialize())
            emit("mt5_initialize",initialized,"connected to local terminal" if initialized else f"failed: {mt5.last_error()}",checks)
            if initialized:
                terminal=mt5.terminal_info()
                emit("terminal_connected",bool(terminal and getattr(terminal,"connected",False)),"connected" if terminal and getattr(terminal,"connected",False) else "not connected",checks)
                account=mt5.account_info()
                mode=getattr(account,"trade_mode",None) if account else None
                demo=getattr(mt5,"ACCOUNT_TRADE_MODE_DEMO",0)
                real=getattr(mt5,"ACCOUNT_TRADE_MODE_REAL",2)
                safe_mode="DEMO" if mode==demo else "REAL" if mode==real else "UNSUPPORTED"
                emit("account_mode_supported",safe_mode in ("DEMO","REAL"),safe_mode,checks)

                symbol=None
                if REQUESTED_SYMBOL and mt5.symbol_select(REQUESTED_SYMBOL,True):
                    symbol=REQUESTED_SYMBOL
                else:
                    for item in mt5.symbols_get(group="*XAUUSD*") or ():
                        if mt5.symbol_select(item.name,True):
                            symbol=item.name
                            break
                emit("xauusd_symbol",bool(symbol),symbol or "not found",checks)
                if symbol:
                    tick=mt5.symbol_info_tick(symbol)
                    bid=float(getattr(tick,"bid",0.0) or 0.0) if tick else 0.0
                    ask=float(getattr(tick,"ask",0.0) or 0.0) if tick else 0.0
                    valid=bid>0 and ask>=bid
                    emit("broker_tick_available",valid,f"bid/ask available; spread {ask-bid:.3f}" if valid else "invalid or unavailable",checks)
        finally:
            if initialized:
                mt5.shutdown()

    try:
        status,body=safe_get_json(INTAKE_URL,{"Accept":"application/json","User-Agent":"THE-FATHER-ANALYTICS-V201-DOCTOR/1.0"})
        emit("intake_endpoint_reachable",status==200 and isinstance(body,dict),f"HTTP {status} · state {body.get('state','unknown') if isinstance(body,dict) else 'unknown'}",checks)
    except HTTPError as exc:
        emit("intake_endpoint_reachable",False,f"HTTP {exc.code}",checks)
    except URLError as exc:
        emit("intake_endpoint_reachable",False,f"network error: {exc.reason}",checks)
    except Exception as exc:
        emit("intake_endpoint_reachable",False,f"{type(exc).__name__}",checks)

    try:
        status,body=safe_get_json(OBS_URL)
        state=body.get("state","unknown") if isinstance(body,dict) else "unknown"
        emit("v199_observability_reachable",status==200 and isinstance(body,dict),f"HTTP {status} · {state}",checks)
    except Exception as exc:
        emit("v199_observability_reachable",False,f"{type(exc).__name__}",checks)

    passed=sum(1 for x in checks if x["ok"])
    total=len(checks)
    ready=all(x["ok"] for x in checks if x["check"] not in ("intake_endpoint_reachable","v199_observability_reachable"))         and any(x["check"]=="intake_endpoint_reachable" and x["ok"] for x in checks)         and any(x["check"]=="v199_observability_reachable" and x["ok"] for x in checks)
    summary={"ok":ready,"version":"v201-mt5-relay-doctor-v1","passed":passed,"total":total,"checks":checks,
             "governance":{"market_data_only":True,"prints_sensitive_credentials":False,"automatic_execution":False,
                           "live_order_submission_enabled":False,"action_permitted":"WAIT","capital_permission":"0R"}}
    print(f"\nV201 RESULT: {'READY FOR V200 SMOKE TEST' if ready else 'FIX FAILED CHECKS'} · {passed}/{total} checks passed · WAIT · 0R")
    if args.json:
        print(json.dumps(summary,separators=(",",":")))
    return 0 if ready else 2

if __name__=="__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Relay doctor stopped.",file=sys.stderr)
        raise SystemExit(130)
