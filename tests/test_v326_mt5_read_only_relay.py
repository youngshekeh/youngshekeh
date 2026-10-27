"""No broker terminal, account, network, payments or secrets needed for V326 tests."""
import importlib.util
import io
import json
import pathlib
import tempfile
import time
import unittest
import urllib.error
from contextlib import redirect_stdout
from types import SimpleNamespace
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
RELAY=ROOT/"scripts"/"v326_mt5_xauusd_read_only_relay.py"
spec=importlib.util.spec_from_file_location("tfa_v326_relay",RELAY)
relay=importlib.util.module_from_spec(spec)
spec.loader.exec_module(relay)

def fixture(now_ms=None, **updates):
    now_ms=now_ms or int(time.time()*1000)
    tick=SimpleNamespace(time_msc=now_ms-500,bid=4100.2,ask=4100.6,
        flags=6,volume_real=0.0,last=0)
    sym=SimpleNamespace(visible=True,digits=2,point=0.01)
    terminal=SimpleNamespace(connected=True,build=5600)
    account=SimpleNamespace(trade_mode=2)
    payload=relay.tick_payload(tick,sym,terminal,account,
        relay.MT5_REQUIRED_PACKAGE,now_ms,now_ms)
    payload.update(updates)
    return payload,tick,sym,terminal,account

class FakeResponse:
    def __init__(self,doc,code=200):
        self.doc=doc
        self.code=code
    def __enter__(self):return self
    def __exit__(self,*args):return False
    def read(self,size):return json.dumps(self.doc).encode()[:size]
    def getcode(self):return self.code

class FakeOpener:
    def __init__(self,doc=None,error=None):
        self.doc=doc or {
            "ok":True,"inserted":True,
            "state":"LIVE_XAUUSD_TICK_RECORDED",
            "governance":{"machine_execution_allowed":False}}
        self.error=error
        self.calls=[]
    def open(self,request,timeout=None):
        self.calls.append((request,timeout))
        if self.error:raise self.error
        return FakeResponse(self.doc)

class TestReadOnlyRelay(unittest.TestCase):
    def test_offline_selftest_no_terminal_or_network_or_api_key(self):
        b=io.StringIO()
        with redirect_stdout(b):relay.self_test()
        self.assertIn("NO_NETWORK / NO_TRADING",b.getvalue())

    def test_exact_post_body_no_broker_account_or_order_fields(self):
        p,*_=fixture()
        self.assertEqual(set(p),{
            "observed_at","sequence","trade_mode","bid","ask",
            "terminal_tick_time_msc","tick_flags","volume_real",
            "terminal_build","terminal_connected","digits","point",
            "relay_version","mt5_package_version","os_family"})
        self.assertEqual(p["trade_mode"],"REAL")
        self.assertEqual(p["os_family"],"Windows")
        self.assertEqual(p["mt5_package_version"],"5.0.6231")
        self.assertNotIn("account_id",json.dumps(p))
        self.assertNotIn("password",json.dumps(p))
        self.assertNotIn("order",json.dumps(p))

    def test_real_account_alone_never_changes_relay_execution_permission(self):
        p,*_=fixture()
        op=FakeOpener()
        k="tfa_live_"+"A"*43
        self.assertEqual(relay.send_tick(p,1,k,opener=op),"TICK_RECORDED")
        req,timeout=op.calls[0]
        self.assertEqual(req.get_method(),"POST")
        self.assertEqual(req.full_url,relay.ENDPOINT)
        self.assertEqual(timeout,3)
        self.assertEqual(req.get_header("X-tfa-live-bridge-key"),k)
        self.assertNotIn(k,req.data.decode())
        self.assertNotIn("account",req.data.decode())
        self.assertNotIn("order_send",RELAY.read_text())

    def test_duplicate_server_ack_is_successful_but_does_not_submit_order(self):
        p,*_=fixture()
        op=FakeOpener({
            "ok":True,"inserted":False,
            "state":"DUPLICATE_TICK_ALREADY_RECORDED",
            "governance":{"machine_execution_allowed":False}})
        self.assertEqual(relay.send_tick(p,1,"tfa_live_"+"a"*43,opener=op),
            "DUPLICATE_TICK_CONFIRMED")

    def test_200_without_server_insert_ack_fails_closed(self):
        p,*_=fixture()
        for doc in [
            {"ok":True,"inserted":False,"state":"noop",
             "governance":{"machine_execution_allowed":False}},
            {"ok":True,"inserted":True,
             "governance":{"machine_execution_allowed":True}},
            {"ok":False,"inserted":True,"governance":{"machine_execution_allowed":False}},
        ]:
            with self.subTest(doc=doc),self.assertRaises(relay.RelayError):
                relay.send_tick(p,1,"tfa_live_"+"a"*43,opener=FakeOpener(doc))

    def test_401_cannot_expose_bridge_key_to_exception_message(self):
        p,*_=fixture()
        secret="tfa_live_"+"b"*43
        err=urllib.error.HTTPError(relay.ENDPOINT,401,"bad",{},None)
        with self.assertRaises(relay.RelayError) as ctx:
            relay.send_tick(p,1,secret,opener=FakeOpener(error=err))
        self.assertEqual(str(ctx.exception),"BRIDGE_AUTH_REJECTED")
        self.assertNotIn(secret,str(ctx.exception))

    def test_stale_and_future_quote_rejected_locally(self):
        now=int(time.time()*1000)
        _,tick,sym,terminal,acct=fixture(now)
        for skew in (-9000,6500):
            tick.time_msc=now+skew
            with self.subTest(skew=skew),self.assertRaisesRegex(
                relay.RelayError,"BROKER_TICK_NOT_FRESH"):
                relay.tick_payload(tick,sym,terminal,acct,
                    relay.MT5_REQUIRED_PACKAGE,now,now)

    def test_spread_and_price_validity_protect_intake(self):
        now=int(time.time()*1000)
        _,tick,sym,terminal,acct=fixture(now)
        for bid,ask in [(0,2),(4200,4100),(4100,4200)]:
            tick.bid=bid;tick.ask=ask
            with self.subTest(bid=bid,ask=ask),self.assertRaises(relay.RelayError):
                relay.tick_payload(tick,sym,terminal,acct,
                    relay.MT5_REQUIRED_PACKAGE,now,now)

    def test_disconnected_or_hidden_symbol_denied(self):
        now=int(time.time()*1000)
        _,tick,sym,terminal,acct=fixture(now)
        terminal.connected=False
        with self.assertRaisesRegex(relay.RelayError,"TERMINAL_DISCONNECTED"):
            relay.tick_payload(tick,sym,terminal,acct,relay.MT5_REQUIRED_PACKAGE,now,now)
        terminal.connected=True; sym.visible=False
        with self.assertRaisesRegex(relay.RelayError,"XAUUSD_SYMBOL_NOT_VISIBLE"):
            relay.tick_payload(tick,sym,terminal,acct,relay.MT5_REQUIRED_PACKAGE,now,now)

    def test_version_mismatch_cannot_spoof_pinned_mt5_client(self):
        now=int(time.time()*1000)
        _,tick,sym,terminal,acct=fixture(now)
        with self.assertRaisesRegex(relay.RelayError,"MT5_PACKAGE_VERSION_MISMATCH"):
            relay.tick_payload(tick,sym,terminal,acct,"5.0.7000",now,now)

    def test_key_shape_and_invalid_bridge_id_cannot_call_network(self):
        p,*_=fixture()
        for bridge_id,key in [(0,"tfa_live_"+"a"*43),(1,"bad-key"),(-2,"tfa_live_"+"a"*43)]:
            opener=FakeOpener()
            with self.subTest(bridge_id=bridge_id),self.assertRaises(relay.RelayError):
                relay.send_tick(p,bridge_id,key,opener=opener)
            self.assertEqual(opener.calls,[])

    def test_persisted_sequence_across_restarts_and_no_secret_in_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=pathlib.Path(tmp)/"relay"/"seq.txt"
            a=relay.reserve_sequence(p,now_ms=100000)
            b=relay.reserve_sequence(p,now_ms=100000)
            c=relay.reserve_sequence(p,now_ms=99999)
            self.assertEqual((a,b,c),(100000,100001,100002))
            self.assertEqual(p.read_text(),"100002")
            self.assertNotIn("tfa_live_",p.read_text())

    def test_broken_sequence_file_fails_closed_instead_of_resetting(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=pathlib.Path(tmp)/"seq"
            p.write_text("invalid")
            with self.assertRaisesRegex(relay.RelayError,"SEQUENCE_FILE_CORRUPT"):
                relay.reserve_sequence(p,now_ms=999)

    def test_full_live_runner_rejects_nonwindows_host_before_mt5_import(self):
        if relay.os.name != "nt":
            with self.assertRaisesRegex(relay.RelayError,"WINDOWS_HOST_REQUIRED"):
                relay.run()

    def test_nonapproved_redirect_rejected_by_http_handler(self):
        self.assertIsNone(relay.NoRedirect().redirect_request(
            None,None,None,None,None,"https://not-the-project.invalid"))
        self.assertTrue(relay.ENDPOINT.startswith(
            "https://mpcelmjiycjpdyyflisn.supabase.co/"))

if __name__=="__main__":
    unittest.main()
