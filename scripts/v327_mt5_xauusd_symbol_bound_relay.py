#!/usr/bin/env python3
"""V327 broker-symbol-bound XAUUSD MT5 relay. REVIEW ONLY.

Runs on a human-controlled Windows host with an already logged-in MetaTrader 5
terminal. Never issues an order, authenticates to trading accounts, or stores
credentials on disk. The receiver is already deployed, but current production
has NO received broker ticks. Run --self-test without MT5/network/keys.

Env variables for real --once / --loop commissioning:
  TFA_LIVE_BRIDGE_ID: existing enrolled bridge numeric id
  TFA_LIVE_BRIDGE_KEY: the displayed-once private bridge key
  TFA_MT5_SYMBOL: exact provider_symbol from that bridge, e.g. XAUUSD

V327 binds the declared exact symbol to the pre-enrolled bridge at the Edge
receiver and uses only bounded retry while a tick is still fresh.

No passwords, Supabase service-role credentials, account IDs or order routes.
Approved destination is pinned to project's Edge intake. Tick acceptance only
means read-only market data; it never means execution-grade or licensed resale.
"""
import argparse
import json
import math
import os
import pathlib
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

ENDPOINT = "https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/broker-live-market-intake"
MT5_REQUIRED_PACKAGE = "5.0.6231"
RELAY_VERSION = "v186.0"
MAX_TICK_AGE_SECONDS = 8.0
MIN_INTERVAL_SECONDS = 0.7

class RelayError(Exception):
    """Fail closed with non-sensitive diagnostic error codes."""

def quote_time(ms):
    if not isinstance(ms, int) or isinstance(ms, bool) or ms < 1_000_000_000:
        raise RelayError("BAD_BROKER_TICK_TIME")
    return datetime.fromtimestamp(ms / 1000, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

def safe_number(value, *, positive=False, zero_ok=True):
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value):
        raise RelayError("INVALID_NUMERIC_TICK")
    if positive and value <= 0:
        raise RelayError("INVALID_NUMERIC_TICK")
    if not zero_ok and value == 0:
        raise RelayError("INVALID_NUMERIC_TICK")
    return value

def tick_payload(tick, symbol, terminal, account, package_version, sequence, now_ms=None):
    """Build receiver's exact allowlisted schema, WITHOUT an account identifier."""
    if package_version != MT5_REQUIRED_PACKAGE:
        raise RelayError("MT5_PACKAGE_VERSION_MISMATCH")
    if not getattr(terminal, "connected", False):
        raise RelayError("TERMINAL_DISCONNECTED")
    if symbol is None or not getattr(symbol, "visible", False):
        raise RelayError("XAUUSD_SYMBOL_NOT_VISIBLE")
    # Caller checks this before sending any payload; avoid mislabeled quote
    # contamination across brokers with XAUUSD suffixes.
    terminal_build = int(getattr(terminal, "build", 0))
    if terminal_build <= 0:
        raise RelayError("INVALID_TERMINAL_BUILD")
    if not isinstance(sequence, int) or isinstance(sequence, bool) or sequence < 1 or sequence > 9_007_199_254_740_991:
        raise RelayError("INVALID_TICK_SEQUENCE")
    current_ms = int(time.time() * 1000) if now_ms is None else now_ms
    tick_ms = int(getattr(tick, "time_msc", 0))
    elapsed = (current_ms - tick_ms) / 1000.0
    if elapsed < -5 or elapsed >= MAX_TICK_AGE_SECONDS:
        raise RelayError("BROKER_TICK_NOT_FRESH")
    bid = safe_number(getattr(tick, "bid", None), positive=True)
    ask = safe_number(getattr(tick, "ask", None), positive=True)
    if ask < bid or ask - bid > bid * 0.01:
        raise RelayError("INVALID_BROKER_SPREAD")
    point = safe_number(getattr(symbol, "point", None), positive=True)
    digits = int(getattr(symbol, "digits", 0))
    if point > 1 or digits < 1 or digits > 6:
        raise RelayError("INVALID_SYMBOL_METADATA")
    raw_mode = getattr(account, "trade_mode", -1)
    if raw_mode not in (0, 2):
        raise RelayError("UNKNOWN_BROKER_TRADE_MODE")
    mode = "REAL" if raw_mode == 2 else "DEMO"
    payload = {
        "observed_at": quote_time(tick_ms),
        "sequence": sequence,
        "trade_mode": mode,
        "bid": bid,
        "ask": ask,
        "terminal_tick_time_msc": tick_ms,
        "tick_flags": int(getattr(tick, "flags", 0)),
        "volume_real": safe_number(getattr(tick, "volume_real", 0)),
        "terminal_build": terminal_build,
        "terminal_connected": True,
        "digits": digits,
        "point": point,
        "relay_version": RELAY_VERSION,
        "mt5_package_version": package_version,
        "os_family": "Windows",
    }
    last = getattr(tick, "last", 0)
    if isinstance(last, (float, int)) and not isinstance(last, bool) and math.isfinite(last) and last > 0:
        payload["last"] = last
    if payload["tick_flags"] < 0 or payload["volume_real"] < 0:
        raise RelayError("INVALID_TICK_METADATA")
    return payload

def sequence_path():
    root = os.environ.get("LOCALAPPDATA")
    if not root:
        raise RelayError("LOCALAPPDATA_NOT_CONFIGURED")
    return pathlib.Path(root) / "TheFatherAnalytics" / "mt5_xauusd_read_only.seq"

def reserve_sequence(path, now_ms=None):
    """Never reuse an id after a crash. This state stores NO secrets or prices."""
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    previous = 0
    if path.exists():
        raw = path.read_text(encoding="ascii").strip()
        if not raw.isdecimal() or len(raw) > 16:
            raise RelayError("SEQUENCE_FILE_CORRUPT")
        previous = int(raw)
    current = int(time.time() * 1000) if now_ms is None else now_ms
    value = max(previous + 1, current)
    if value > 9_007_199_254_740_991:
        raise RelayError("SEQUENCE_EXHAUSTED")
    temp = path.with_suffix(".pending")
    temp.write_text(str(value), encoding="ascii")
    temp.replace(path)
    return value

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None

def send_tick(payload, bridge_id, bridge_key, symbol, *, opener=None):
    """No response/raw error/secret is printed; redirect forbidden."""
    if not isinstance(bridge_id, int) or bridge_id <= 0 or bridge_id > 2**53:
        raise RelayError("INVALID_BRIDGE_ID")
    if not isinstance(bridge_key, str) or not bridge_key.startswith("tfa_live_") or not 40 <= len(bridge_key.removeprefix("tfa_live_")) <= 80:
        raise RelayError("INVALID_BRIDGE_KEY_SHAPE")
    # Exact symbol suffix MUST match the bridge's enrolled provider_symbol.
    # The server verifies this header against authenticated bridge metadata.
    # It is a consistency assertion, not cryptographic proof of MT5 provenance.
    if not isinstance(symbol, str) or not re.fullmatch(r"XAUUSD[A-Za-z0-9._-]{0,16}", symbol):
        raise RelayError("INVALID_BROKER_SYMBOL")
    encoded = json.dumps(payload, separators=(",", ":"), allow_nan=False).encode("utf-8")
    if len(encoded) > 16000:
        raise RelayError("TICK_BODY_TOO_LARGE")
    request = urllib.request.Request(
        ENDPOINT, data=encoded, method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Cache-Control": "no-store",
            "X-TFA-Live-Bridge-Id": str(bridge_id),
            "X-TFA-Live-Bridge-Key": bridge_key,
            "X-TFA-MT5-Symbol": symbol,
        })
    target = opener or urllib.request.build_opener(
        urllib.request.HTTPSHandler(context=ssl.create_default_context()),
        NoRedirect())
    try:
        with target.open(request, timeout=3) as response:
            code = response.getcode()
            data = response.read(12000)
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            raise RelayError("BRIDGE_AUTH_REJECTED") from None
        if exc.code in (409, 422):
            raise RelayError("TICK_VALIDATION_OR_ORDER_REJECTED") from None
        raise RelayError("UPSTREAM_HTTP_FAILURE") from None
    except Exception:
        raise RelayError("UPSTREAM_CONNECTIVITY_FAILURE") from None
    if code != 200:
        raise RelayError("UNEXPECTED_HTTP_STATUS")
    try:
        parsed = json.loads(data)
    except (ValueError, UnicodeError):
        raise RelayError("INVALID_INTAKE_RESPONSE") from None
    if not isinstance(parsed, dict):
        raise RelayError("INVALID_INTAKE_RESPONSE")
    if parsed.get("ok") is not True or parsed.get("governance", {}).get("machine_execution_allowed") is not False:
        raise RelayError("UNVERIFIED_INTAKE_ACK")
    if parsed.get("inserted") is not True and parsed.get("state") != "DUPLICATE_TICK_ALREADY_RECORDED":
        raise RelayError("ACK_WITHOUT_RECORDED_TICK")
    return "TICK_RECORDED" if parsed.get("inserted") else "DUPLICATE_TICK_CONFIRMED"

def deliver_with_retry(payload, bridge_id, bridge_key, symbol, *, sender=send_tick,
                       pause=time.sleep, now=time.time, max_attempts=3):
    """Bounded retry on transient failures; same sequence for each attempt.
    
    Never retry invalid key, mismatched symbol, validation failure, or
    dishonest HTTP acknowledgement. No outdated or future broker ticks.
    Stopping on exhausted retry is safer than silently losing data.
    """
    attempts = 0
    while attempts < max_attempts:
        attempts += 1
        try:
            age = now() - int(payload["terminal_tick_time_msc"]) / 1000.0
        except (KeyError, ValueError, TypeError, OverflowError):
            raise RelayError("INVALID_BROKER_TICK_TIME") from None
        if age < -5 or age >= MAX_TICK_AGE_SECONDS:
            raise RelayError("BROKER_TICK_NOT_FRESH")
        try:
            return sender(payload, bridge_id, bridge_key, symbol)
        except RelayError as exc:
            # Exact whitelist prevents repeatedly hammering invalid credentials
            # or continually sending invalid server-validated tick payloads.
            if str(exc) not in ("UPSTREAM_CONNECTIVITY_FAILURE", "UPSTREAM_HTTP_FAILURE"):
                raise
            if attempts >= max_attempts:
                raise RelayError("BOUNDED_TICK_DELIVERY_EXHAUSTED") from None
            pause(0.35)
    raise RelayError("BOUNDED_TICK_DELIVERY_EXHAUSTED")


def run(*, loop=False):
    if os.name != "nt":
        raise RelayError("WINDOWS_HOST_REQUIRED")
    # Import only after platform check and only in real invocation.
    try:
        import MetaTrader5 as mt5
    except ImportError:
        raise RelayError("METATRADER5_PACKAGE_NOT_INSTALLED") from None
    package = str(mt5.__version__)
    if package != MT5_REQUIRED_PACKAGE:
        raise RelayError("MT5_PACKAGE_VERSION_MISMATCH")
    raw_id = os.getenv("TFA_LIVE_BRIDGE_ID", "")
    bridge_key = os.getenv("TFA_LIVE_BRIDGE_KEY", "")
    symbol_name = os.getenv("TFA_MT5_SYMBOL", "")
    if not raw_id.isdecimal() or not symbol_name.startswith("XAUUSD") or len(symbol_name) > 22:
        raise RelayError("BRIDGE_CONFIGURATION_INCOMPLETE")
    if not mt5.initialize():
        raise RelayError("MT5_TERMINAL_NOT_READY")
    try:
        last_tick_ms = 0
        while True:
            terminal = mt5.terminal_info()
            account = mt5.account_info()
            symbol = mt5.symbol_info(symbol_name)
            tick = mt5.symbol_info_tick(symbol_name)
            if terminal is None or account is None or tick is None:
                raise RelayError("MT5_DATA_NOT_AVAILABLE")
            tick_ms = int(getattr(tick, "time_msc", 0))
            if tick_ms == last_tick_ms:
                if not loop:
                    raise RelayError("NO_NEW_TICK")
                time.sleep(MIN_INTERVAL_SECONDS)
                continue
            if last_tick_ms and tick_ms < last_tick_ms:
                raise RelayError("BROKER_TICK_CLOCK_REGRESSION")
            sequence = reserve_sequence(sequence_path())
            payload = tick_payload(tick, symbol, terminal, account, package, sequence)
            status = deliver_with_retry(payload, int(raw_id), bridge_key, symbol_name)
            # Never log price, bridge secret, broker account or raw API response.
            print("V327_READ_ONLY_"+status+" WAIT_0R", flush=True)
            last_tick_ms = tick_ms
            if not loop:
                return
            time.sleep(MIN_INTERVAL_SECONDS)
    finally:
        mt5.shutdown()

def self_test():
    from types import SimpleNamespace
    now_ms = int(time.time()*1000)
    tick = SimpleNamespace(time_msc=now_ms-1000,bid=4100.0,ask=4100.4,
        flags=6,volume_real=0,last=0)
    sym = SimpleNamespace(visible=True,digits=2,point=0.01)
    terminal = SimpleNamespace(connected=True,build=5600)
    acct = SimpleNamespace(trade_mode=0)
    quote = tick_payload(tick,sym,terminal,acct,MT5_REQUIRED_PACKAGE,now_ms,now_ms)
    assert quote["trade_mode"]=="DEMO"
    assert quote["relay_version"]==RELAY_VERSION
    assert quote["terminal_connected"] is True
    assert "account" not in quote and "password" not in quote
    print("V327_LOCAL_PAYLOAD_SELFTEST_PASSED / NO_NETWORK / NO_TRADING")

def main():
    parser=argparse.ArgumentParser(description="THE FATHER ANALYTICS MT5 XAUUSD read-only broker quote relay V327")
    group=parser.add_mutually_exclusive_group()
    group.add_argument("--self-test",action="store_true",help="no MT5 connection, credentials, or network")
    group.add_argument("--loop",action="store_true",help="run as foreground read-only quote relay")
    group.add_argument("--once",action="store_true",help="submit one current read-only tick")
    args=parser.parse_args()
    try:
        if args.self_test:
            self_test()
        else:
            run(loop=args.loop)
    except RelayError as exc:
        print("V326_READ_ONLY_RELAY_HOLD:"+str(exc)+" WAIT_0R",file=sys.stderr)
        return 2
    return 0

if __name__=="__main__":
    raise SystemExit(main())
