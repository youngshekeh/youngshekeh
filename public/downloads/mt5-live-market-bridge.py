#!/usr/bin/env python3
"""THE FATHER ANALYTICS V186 live XAUUSD read-only MT5 relay.

Reads the current XAUUSD broker tick from an already logged-in MetaTrader 5
terminal and sends market data only. DEMO and REAL terminal accounts are allowed
for quotes. The relay contains no order submission, modification, close or login path.
"""
from __future__ import annotations
import argparse, json, os, platform, sys, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import MetaTrader5 as mt5

RELAY_VERSION="v186.0"
EXPECTED_MT5_VERSION="5.0.6231"
INTAKE_URL=os.getenv("TFA_LIVE_MARKET_URL","https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/broker-live-market-intake")
BRIDGE_ID=os.getenv("TFA_LIVE_BRIDGE_ID","").strip()
BRIDGE_KEY=os.getenv("TFA_LIVE_BRIDGE_KEY","").strip()
INTERVAL=max(0.5,float(os.getenv("TFA_LIVE_TICK_INTERVAL_SECONDS","1")))
STATE_PATH=Path(os.getenv("TFA_LIVE_MARKET_STATE_PATH",str(Path.home()/".tfa-mt5-live-market-state.json")))

def utc_now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")

def load_state():
    try:
        value=json.loads(STATE_PATH.read_text(encoding="utf-8"))
        if isinstance(value,dict):
            value.setdefault("sequence",0)
            return value
    except (FileNotFoundError,json.JSONDecodeError,OSError):
        pass
    return {"sequence":0}

def save_state(state):
    STATE_PATH.parent.mkdir(parents=True,exist_ok=True)
    tmp=STATE_PATH.with_suffix(STATE_PATH.suffix+".tmp")
    tmp.write_text(json.dumps(state,separators=(",",":")),encoding="utf-8")
    tmp.replace(STATE_PATH)

def next_sequence(state):
    value=int(state.get("sequence",0))+1
    if value<=0 or value>9_007_199_254_740_991:
        raise RuntimeError("sequence_exhausted")
    state["sequence"]=value
    save_state(state)
    return value

def ensure_config():
    if not BRIDGE_ID.isdigit() or int(BRIDGE_ID)<=0:
        raise SystemExit("TFA_LIVE_BRIDGE_ID is required.")
    if not BRIDGE_KEY.startswith("tfa_live_"):
        raise SystemExit("TFA_LIVE_BRIDGE_KEY is required.")
    if platform.system()!="Windows":
        raise RuntimeError("WINDOWS_CLIENT_REQUIRED")
    package_version=str(getattr(mt5,"__version__",""))
    if package_version!=EXPECTED_MT5_VERSION:
        raise RuntimeError(f"UNSUPPORTED_MT5_PACKAGE_VERSION:{package_version or 'unknown'}:expected={EXPECTED_MT5_VERSION}")

def trade_mode(account):
    if account.trade_mode==getattr(mt5,"ACCOUNT_TRADE_MODE_DEMO",0):
        return "DEMO"
    if account.trade_mode==getattr(mt5,"ACCOUNT_TRADE_MODE_REAL",2):
        return "REAL"
    raise RuntimeError("UNSUPPORTED_ACCOUNT_TRADE_MODE")

def resolve_symbol():
    requested=os.getenv("TFA_MT5_SYMBOL","XAUUSD").strip()
    if requested and mt5.symbol_select(requested,True):
        return requested
    for item in mt5.symbols_get(group="*XAUUSD*") or ():
        if mt5.symbol_select(item.name,True):
            return item.name
    raise RuntimeError("XAUUSD_SYMBOL_NOT_FOUND")

def post_tick(payload):
    request=Request(INTAKE_URL,data=json.dumps(payload,separators=(",",":")).encode("utf-8"),method="POST",
        headers={"Content-Type":"application/json","Accept":"application/json",
                 "X-TFA-Live-Bridge-Id":BRIDGE_ID,"X-TFA-Live-Bridge-Key":BRIDGE_KEY,
                 "User-Agent":"THE-FATHER-ANALYTICS-V186-LIVE-XAUUSD/1.0"})
    try:
        with urlopen(request,timeout=6) as response:
            body=json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail=exc.read().decode("utf-8",errors="replace")[:500]
        raise RuntimeError(f"live_market_http_{exc.code}:{detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"live_market_transport:{exc.reason}") from exc
    if body.get("ok") is not True:
        raise RuntimeError(f"live_tick_rejected:{body.get('error','unknown')}")
    if body.get("governance",{}).get("capital_permission")!="0R":
        raise RuntimeError("unsafe_governance_response")
    return body

def capture(state,symbol):
    account=mt5.account_info()
    terminal=mt5.terminal_info()
    info=mt5.symbol_info(symbol)
    tick=mt5.symbol_info_tick(symbol)
    version=mt5.version()
    if account is None or terminal is None or info is None or tick is None or not version:
        raise RuntimeError(f"MT5_MARKET_DATA_UNAVAILABLE:{mt5.last_error()}")
    if not bool(getattr(terminal,"connected",False)):
        raise RuntimeError("MT5_TERMINAL_NOT_CONNECTED")
    bid=float(tick.bid);ask=float(tick.ask)
    terminal_tick_ms=int(getattr(tick,"time_msc",0) or 0)
    if terminal_tick_ms<=0 or abs(int(time.time()*1000)-terminal_tick_ms)>8000:
        raise RuntimeError("STALE_OR_INVALID_TERMINAL_TICK")
    if bid<=0 or ask<bid:
        raise RuntimeError("INVALID_BROKER_TICK")
    payload={
        "observed_at":utc_now_iso(),
        "sequence":next_sequence(state),
        "trade_mode":trade_mode(account),
        "bid":bid,
        "ask":ask,
        "last":float(getattr(tick,"last",0.0) or 0.0),
        "terminal_tick_time_msc":int(getattr(tick,"time_msc",0) or 0),
        "tick_flags":int(getattr(tick,"flags",0) or 0),
        "volume_real":float(getattr(tick,"volume_real",0.0) or 0.0),
        "terminal_build":int(version[0]),
        "terminal_connected":True,
        "digits":int(info.digits),
        "point":float(info.point),
        "relay_version":RELAY_VERSION,
        "mt5_package_version":str(getattr(mt5,"__version__","")),
        "os_family":platform.system(),
    }
    return payload

def run(once=False):
    ensure_config()
    if not mt5.initialize():
        raise RuntimeError(f"mt5_initialize_failed:{mt5.last_error()}")
    try:
        symbol=resolve_symbol()
        state=load_state()
        last_signature=None
        while True:
            payload=capture(state,symbol)
            signature=(payload["terminal_tick_time_msc"],payload["bid"],payload["ask"],payload["tick_flags"])
            if signature!=last_signature:
                result=post_tick(payload)
                last_signature=signature
                print(f'{payload["observed_at"]} {symbol} {payload["trade_mode"]} BID {payload["bid"]} ASK {payload["ask"]} · tick #{result.get("tick_id","?")} · market-data only')
            if once:
                return
            time.sleep(INTERVAL)
    finally:
        mt5.shutdown()

if __name__=="__main__":
    parser=argparse.ArgumentParser(description="THE FATHER ANALYTICS V186 live XAUUSD read-only MT5 relay")
    parser.add_argument("--once",action="store_true",help="Send one current XAUUSD tick and exit.")
    args=parser.parse_args()
    try:
        run(args.once)
    except KeyboardInterrupt:
        print("Live market relay stopped.")
    except Exception as exc:
        print(f"Live market relay halted: {exc}",file=sys.stderr)
        sys.exit(1)
