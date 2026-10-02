#!/usr/bin/env python3
"""THE FATHER ANALYTICS V184 MT5 demo relay.

Read-only relay for an already logged-in MetaTrader 5 DEMO terminal.
It sends quotes and demo execution receipts to V184. It never submits,
modifies or closes an order and refuses non-demo accounts.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import MetaTrader5 as mt5

BRIDGE_URL = os.getenv(
    "TFA_BRIDGE_URL",
    "https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/broker-sandbox-bridge-intake",
)
BRIDGE_ID = os.getenv("TFA_BRIDGE_ID", "").strip()
BRIDGE_KEY = os.getenv("TFA_BRIDGE_KEY", "").strip()
REQUESTED_R = float(os.getenv("TFA_SANDBOX_REQUESTED_R", "0.10"))
QUOTE_INTERVAL = max(1.0, float(os.getenv("TFA_QUOTE_INTERVAL_SECONDS", "3")))
STATE_PATH = Path(
    os.getenv(
        "TFA_BRIDGE_STATE_PATH",
        str(Path.home() / ".tfa-mt5-demo-bridge-state.json"),
    )
)

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

def load_state() -> dict:
    try:
        value = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        if isinstance(value, dict):
            value.setdefault("sequence", 0)
            value.setdefault("deal_progress", {})
            return value
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass
    return {"sequence": 0, "deal_progress": {}}

def save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_PATH.with_suffix(STATE_PATH.suffix + ".tmp")
    tmp.write_text(json.dumps(state, separators=(",", ":")), encoding="utf-8")
    tmp.replace(STATE_PATH)

def next_sequence(state: dict) -> int:
    current = int(state.get("sequence", 0)) + 1
    if current <= 0 or current > 9_007_199_254_740_991:
        raise RuntimeError("sequence_exhausted")
    state["sequence"] = current
    save_state(state)
    return current

def post_event(state: dict, event: dict) -> dict:
    payload = dict(event)
    payload["sequence"] = next_sequence(state)
    payload.setdefault("observed_at", utc_now_iso())
    request = Request(
        BRIDGE_URL,
        data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-TFA-Bridge-Id": BRIDGE_ID,
            "X-TFA-Bridge-Key": BRIDGE_KEY,
            "User-Agent": "THE-FATHER-ANALYTICS-V184-MT5-DEMO-BRIDGE/1.0",
        },
    )
    try:
        with urlopen(request, timeout=8) as response:
            body = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"bridge_http_{exc.code}:{detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"bridge_transport:{exc.reason}") from exc
    if body.get("ok") is not True:
        raise RuntimeError(f"bridge_rejected:{body.get('error', 'unknown')}")
    if body.get("governance", {}).get("capital_permission") != "0R":
        raise RuntimeError("unsafe_governance_response")
    return body

def ensure_config() -> None:
    if not BRIDGE_ID.isdigit() or int(BRIDGE_ID) <= 0:
        raise SystemExit("TFA_BRIDGE_ID is required.")
    if not BRIDGE_KEY.startswith("tfa_demo_"):
        raise SystemExit("TFA_BRIDGE_KEY is required.")
    if not (0 < REQUESTED_R <= 1):
        raise SystemExit("TFA_SANDBOX_REQUESTED_R must be >0 and <=1.")

def ensure_demo_account():
    account = mt5.account_info()
    if account is None:
        raise RuntimeError(f"account_info_failed:{mt5.last_error()}")
    demo_mode = getattr(mt5, "ACCOUNT_TRADE_MODE_DEMO", 0)
    if account.trade_mode != demo_mode:
        raise RuntimeError("NON_DEMO_ACCOUNT_BLOCKED")
    return account

def resolve_symbol() -> str:
    requested = os.getenv("TFA_MT5_SYMBOL", "XAUUSD").strip()
    if requested and mt5.symbol_select(requested, True):
        return requested
    candidates = mt5.symbols_get(group="*XAUUSD*") or ()
    for item in candidates:
        if mt5.symbol_select(item.name, True):
            return item.name
    raise RuntimeError("XAUUSD_symbol_not_found")

def deal_side(deal) -> str | None:
    if deal.type == getattr(mt5, "DEAL_TYPE_BUY", 0):
        return "LONG"
    if deal.type == getattr(mt5, "DEAL_TYPE_SELL", 1):
        return "SHORT"
    return None

def recent_symbol_deals(symbol: str):
    end = datetime.now(timezone.utc) + timedelta(seconds=1)
    start = end - timedelta(minutes=3)
    deals = mt5.history_deals_get(start, end, group=f"*{symbol}*")
    if deals is None:
        return ()
    return tuple(d for d in deals if getattr(d, "symbol", None) == symbol and deal_side(d))

def baseline_existing_deals(state: dict, symbol: str) -> None:
    progress = state.setdefault("deal_progress", {})
    if progress:
        return
    for deal in recent_symbol_deals(symbol):
        progress[str(int(deal.ticket))] = "done"
    save_state(state)

def forward_new_deals(state: dict, symbol: str) -> None:
    progress = state.setdefault("deal_progress", {})
    for deal in recent_symbol_deals(symbol):
        ticket = str(int(deal.ticket))
        stage = progress.get(ticket)
        if stage == "done":
            continue
        orders = mt5.history_orders_get(ticket=int(deal.order))
        if not orders:
            continue
        order = orders[0]
        requested_price = float(getattr(order, "price_open", 0.0) or 0.0)
        fill_price = float(getattr(deal, "price", 0.0) or 0.0)
        side = deal_side(deal)
        if not side or requested_price <= 0 or fill_price <= 0:
            continue
        common = {
            "client_order_id": f"mt5-{int(deal.order)}",
            "broker_order_id": str(int(deal.order)),
            "side": side,
            "requested_r": REQUESTED_R,
            "requested_price": requested_price,
        }
        if stage is None:
            post_event(state, {"event_type": "ORDER_ACK", **common})
            progress[ticket] = "ack"
            save_state(state)
        if progress.get(ticket) == "ack":
            post_event(state, {"event_type": "FILL", **common, "fill_price": fill_price})
            progress[ticket] = "done"
            if len(progress) > 500:
                for old in list(progress)[:-500]:
                    progress.pop(old, None)
            save_state(state)

def forward_quote(state: dict, symbol: str, last_tick: tuple | None):
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        raise RuntimeError(f"symbol_info_tick_failed:{mt5.last_error()}")
    signature = (int(getattr(tick, "time_msc", 0) or 0), float(tick.bid), float(tick.ask))
    if signature == last_tick:
        return last_tick
    if tick.bid <= 0 or tick.ask <= tick.bid:
        return last_tick
    post_event(state, {"event_type": "QUOTE", "bid": float(tick.bid), "ask": float(tick.ask)})
    return signature

def run(kill_switch: bool) -> None:
    ensure_config()
    if not mt5.initialize():
        raise RuntimeError(f"mt5_initialize_failed:{mt5.last_error()}")
    try:
        ensure_demo_account()
        symbol = resolve_symbol()
        state = load_state()
        baseline_existing_deals(state, symbol)
        if kill_switch:
            post_event(state, {"event_type": "KILL_SWITCH_ACK", "kill_switch_state": "ENGAGED"})
            print("V184 sandbox bridge kill-switch acknowledged; relay stopped. Capital remains 0R.")
            return
        print(f"V184 relay active for {symbol}. DEMO account verified. No order-submission code is present.")
        last_tick = None
        while True:
            ensure_demo_account()
            forward_new_deals(state, symbol)
            last_tick = forward_quote(state, symbol, last_tick)
            time.sleep(QUOTE_INTERVAL)
    finally:
        mt5.shutdown()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="THE FATHER ANALYTICS MT5 demo-only bridge")
    parser.add_argument("--kill-switch", action="store_true", help="Send a sandbox kill-switch acknowledgement and stop.")
    args = parser.parse_args()
    try:
        run(args.kill_switch)
    except KeyboardInterrupt:
        print("Bridge stopped.")
    except Exception as exc:
        print(f"Bridge halted: {exc}", file=sys.stderr)
        sys.exit(1)
