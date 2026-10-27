"""V327 broker symbol and retry tests, all offline, no accounts or network."""
import importlib.util
import json
import pathlib
import time
import unittest
from types import SimpleNamespace

SOURCE=pathlib.Path(__file__).resolve().parents[1]/"scripts"/"v327_mt5_xauusd_symbol_bound_relay.py"
spec=importlib.util.spec_from_file_location("v327_mt5_relay",SOURCE)
relay=importlib.util.module_from_spec(spec)
spec.loader.exec_module(relay)

class FakeResponse:
    def __init__(self, body,code=200):
        self.body=body
        self.code=code
    def __enter__(self):return self
    def __exit__(self,*args):return False
    def getcode(self):return self.code
    def read(self,n):return json.dumps(self.body).encode()[:n]

class FakeOpener:
    def __init__(self):
        self.requests=[]
    def open(self,request,timeout=None):
        self.requests.append((request,timeout))
        return FakeResponse({"ok":True,"inserted":True,
            "state":"LIVE_XAUUSD_TICK_RECORDED",
            "governance":{"machine_execution_allowed":False}})

def fixture(now_ms=None, mode=0):
    now_ms=now_ms or int(time.time()*1000)
    tick=SimpleNamespace(time_msc=now_ms-1000,bid=4400.15,ask=4400.65,
        flags=6,volume_real=0.0,last=0)
    symbol=SimpleNamespace(visible=True,digits=2,point=0.01)
    terminal=SimpleNamespace(connected=True,build=5600)
    account=SimpleNamespace(trade_mode=mode)
    payload=relay.tick_payload(tick,symbol,terminal,account,
        relay.MT5_REQUIRED_PACKAGE,now_ms,now_ms)
    return payload,tick,symbol,terminal,account

class V327ReadOnlyRelayTests(unittest.TestCase):
    def test_offline_v327_selftest_still_requires_zero_broker_access(self):
        relay.self_test()

    def test_exact_provider_symbol_asserted_in_http_header_not_tick_body(self):
        payload,*_=fixture()
        opener=FakeOpener()
        outcome=relay.send_tick(payload,13,"tfa_live_"+"A"*48,"XAUUSD.r",opener=opener)
        self.assertEqual(outcome,"TICK_RECORDED")
        request,timeout=opener.requests[0]
        self.assertEqual(request.get_header("X-tfa-mt5-symbol"),"XAUUSD.r")
        self.assertEqual(request.full_url,relay.ENDPOINT)
        self.assertEqual(timeout,3)
        self.assertNotIn("XAUUSD.r",request.data.decode())
        self.assertNotIn("account_id",request.data.decode())
        self.assertNotIn("order",request.data.decode())

    def test_invalid_symbol_suffix_and_non_gold_codes_block_before_http(self):
        payload,*_=fixture()
        opener=FakeOpener()
        for s in ["","GOLD","XAU/USD","XAUUSD|BTC","BTCUSD",
                  "XAUUSD"+"9"*20,None]:
            with self.subTest(symbol=s),self.assertRaisesRegex(
                relay.RelayError,"INVALID_BROKER_SYMBOL"):
                relay.send_tick(payload,13,"tfa_live_"+"A"*48,s,opener=opener)
        self.assertEqual(opener.requests,[])

    def test_unknown_broker_trade_mode_is_error_not_silent_demo_fallback(self):
        now=int(time.time()*1000)
        _,tick,symbol,terminal,_=fixture(now)
        for mode in [-1,1,3,None]:
            with self.subTest(mode=mode),self.assertRaisesRegex(
                relay.RelayError,"UNKNOWN_BROKER_TRADE_MODE"):
                relay.tick_payload(tick,symbol,terminal,
                    SimpleNamespace(trade_mode=mode),
                    relay.MT5_REQUIRED_PACKAGE,8,now)

    def test_real_and_demo_account_modes_both_remain_market_data_only(self):
        real,*_=fixture(mode=2)
        demo,*_=fixture(mode=0)
        self.assertEqual(real["trade_mode"],"REAL")
        self.assertEqual(demo["trade_mode"],"DEMO")
        self.assertNotIn("execution",json.dumps(real))

    def test_retry_once_on_ambiguous_transient_network_error_same_sequence(self):
        payload,*_=fixture()
        attempts=[]
        def sender(p,bridge,key,symbol):
            attempts.append((p["sequence"],bridge,symbol))
            if len(attempts)==1:
                raise relay.RelayError("UPSTREAM_CONNECTIVITY_FAILURE")
            return "TICK_RECORDED"
        sent=relay.deliver_with_retry(payload,13,"tfa_live_"+"B"*48,
            "XAUUSD.r",sender=sender,pause=lambda _:None,
            now=lambda:int(payload["terminal_tick_time_msc"])/1000+1)
        self.assertEqual(sent,"TICK_RECORDED")
        self.assertEqual(len(attempts),2)
        self.assertEqual(attempts[0],attempts[1])

    def test_retry_has_fixed_cap_and_redacted_exhaustion_error(self):
        payload,*_=fixture()
        attempts=[]
        def sender(p,*args):
            attempts.append(p["sequence"])
            raise relay.RelayError("UPSTREAM_HTTP_FAILURE")
        with self.assertRaisesRegex(relay.RelayError,"BOUNDED_TICK_DELIVERY_EXHAUSTED"):
            relay.deliver_with_retry(payload,13,"tfa_live_"+"B"*48,
                "XAUUSD.r",sender=sender,pause=lambda _:None,
                now=lambda:int(payload["terminal_tick_time_msc"])/1000+1)
        self.assertEqual(len(attempts),3)

    def test_nontransient_bad_key_or_symbol_mismatch_not_retried(self):
        payload,*_=fixture()
        for err in ["BRIDGE_AUTH_REJECTED","INVALID_BROKER_SYMBOL",
                    "TICK_VALIDATION_OR_ORDER_REJECTED",
                    "UNVERIFIED_INTAKE_ACK"]:
            attempts=[]
            def sender(*args):
                attempts.append(1)
                raise relay.RelayError(err)
            with self.subTest(error=err),self.assertRaisesRegex(relay.RelayError,err):
                relay.deliver_with_retry(payload,13,"tfa_live_"+"B"*48,
                    "XAUUSD.r",sender=sender,pause=lambda _:None,
                    now=lambda:int(payload["terminal_tick_time_msc"])/1000+1)
            self.assertEqual(len(attempts),1)

    def test_expired_quote_is_never_retried_after_transient_error(self):
        payload,*_=fixture()
        attempts=[]
        def sender(*args):
            attempts.append(True)
            raise relay.RelayError("UPSTREAM_CONNECTIVITY_FAILURE")
        times=[int(payload["terminal_tick_time_msc"])/1000+1,
               int(payload["terminal_tick_time_msc"])/1000+9]
        def clock():return times.pop(0)
        with self.assertRaisesRegex(relay.RelayError,"BROKER_TICK_NOT_FRESH"):
            relay.deliver_with_retry(payload,13,"tfa_live_"+"B"*48,
                "XAUUSD.r",sender=sender,pause=lambda _:None,now=clock)
        self.assertEqual(len(attempts),1)

    def test_unknown_server_json_shape_never_counts_as_ack(self):
        payload,*_=fixture()
        class BadOpener:
            def open(self,*args,**kwargs):return FakeResponse([1,2])
        with self.assertRaisesRegex(relay.RelayError,"INVALID_INTAKE_RESPONSE"):
            relay.send_tick(payload,13,"tfa_live_"+"A"*48,"XAUUSD",opener=BadOpener())

    def test_receiver_server_cannot_unlock_trade_through_ack(self):
        payload,*_=fixture()
        class UnsafeOpener:
            def open(self,*args,**kwargs):
                return FakeResponse({"ok":True,"inserted":True,
                    "governance":{"machine_execution_allowed":True}})
        with self.assertRaisesRegex(relay.RelayError,"UNVERIFIED_INTAKE_ACK"):
            relay.send_tick(payload,13,"tfa_live_"+"A"*48,
                "XAUUSD",opener=UnsafeOpener())

    def test_source_has_no_trade_command_password_or_unapproved_destination(self):
        text=SOURCE.read_text()
        for forbidden in ["order_send(", "mt5.login(", "MetaTrader5.login(",
                          "SUPABASE_SERVICE_ROLE_KEY", "password=",
                          "www.example.com"]:
            self.assertNotIn(forbidden,text)
        self.assertIn("https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/broker-live-market-intake",
            relay.ENDPOINT)

if __name__=="__main__":
    unittest.main()
