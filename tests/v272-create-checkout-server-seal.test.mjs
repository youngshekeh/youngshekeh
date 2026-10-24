import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../supabase/functions/create-checkout/index.ts',import.meta.url),'utf8');
const checkout=readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8');
const deployed=(request='POST')=>request==='OPTIONS'?'CORS':request!=='POST'?'METHOD_NOT_ALLOWED':'PAYMENT_HOLD';
test('V272 server payment seal is a reviewed compile-time false, not env enabled',()=>{
 assert.match(src,/const V272_CHARGES_ENABLED=false;/);
 assert.doesNotMatch(src,/V272_CHARGES_ENABLED\s*=\s*Deno\.env|TFA_COMMERCE_ENABLED|process\.env\..*CHECKOUT/);
 assert.match(src,/if\(!V272_CHARGES_ENABLED\)return Response\.json\(/);
 assert.match(src,/error:'commercial_checkout_not_released'/);
 assert.match(src,/state:'PAYMENT_HOLD'/);
 assert.match(src,/charged:false/);
 assert.match(src,/status:503/);
 assert.match(src,/'Cache-Control':'no-store'/);
 assert.match(checkout,/const CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.equal(deployed('POST'),'PAYMENT_HOLD');
});
test('POST guard precedes ALL session, database, checkout-intent and provider operations',()=>{
 const start=src.indexOf('Deno.serve(async(req:Request)');
 const seal=src.indexOf('if(!V272_CHARGES_ENABLED)return Response.json',start);
 const auth=src.indexOf("const base=Deno.env.get('SUPABASE_URL')",start);
 const customer=src.indexOf("const ur=await fetch",start);
 const precharge=src.indexOf('await requireCommercialAcceptance(base,key);',start);
 const intent=src.indexOf("const created=await insert(base,key,'checkout_intents'",start);
 const money=src.indexOf("fetch('https://api.flutterwave.com/v3/payments'",start);
 assert.ok(start>=0&&seal>start&&auth>seal&&customer>seal&&precharge>customer&&intent>precharge&&money>intent);
 assert.match(src,/req.method==='OPTIONS'/);
 assert.match(src,/req.method!=='POST'/);
 // JWT enforcement is supplied by Supabase function deployment metadata, not Deno source.
 assert.match(src,/auth\.toLowerCase\(\)\.startsWith\('bearer '\)/);
});
test('server precharge requires independent signed billing evidence and private run separation',()=>{
 for(const x of [
  "final?.state==='FULL_ACCEPTANCE_READY'",
  "final?.database_incident?.active===false",
  "billing?.gates?.provider_plan_parity==='PASS'",
  "billing?.gates?.signed_payment_evidence==='PASS'",
  "billing?.gates?.active_entitlement_evidence==='PASS'",
  "status:'eq.SUCCEEDED'","const unique=new Map<string,number>()",
  "if(conflicting||!separated)throw new Error('two_kernel_successes_not_verified')",
  "Math.abs(a-b)>=60_000"
 ])assert.ok(src.includes(x),x);
});
test('only valid provider HTTPS hostnames and positive USD recurring prices may be used',()=>{
 for(const x of [
  "u.protocol==='https:'","!u.username&&!u.password&&!u.port",
  "'checkout.flutterwave.com'","'www.flutterwave.com'",
  "validFlutterwaveCheckout(existing.checkout_url)",
  "validFlutterwaveCheckout(fp?.data?.link)",
  "Number.isFinite(amount)","amount<=0","map.currency!=='USD'",
  "Number.isSafeInteger(Number(map.provider_plan_id))"
 ])assert.ok(src.includes(x),x);
 assert.doesNotMatch(src,/function validFlutterwaveCheckout\([^)]*\)\{[\s\S]*?u\.hostname\.endsWith/);
});
test('production server charge guard is locked even if browser or provider catalog claims success',()=>{
 assert.match(checkout,/async function verifyCheckout\(\)\{\s*if\(!CHECKOUT_SERVER_GUARD_DEPLOYED\)/);
 assert.match(checkout,/async function startCheckout\(\)\{\s*if\(!CHECKOUT_SERVER_GUARD_DEPLOYED\)/);
 assert.doesNotMatch(src,/ALTER SYSTEM|cron\.alter_job|place_order|execute_trade/);
 const testDocs=readFileSync(new URL('../docs/operations/2026-10-24-v272-server-checkout-seal.md',import.meta.url),'utf8');
 assert.match(testDocs,/CURRENT SUPABASE DEPLOYMENT/);
 assert.match(testDocs,/not a full commercial launch/i);
});
