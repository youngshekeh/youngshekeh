import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateHomeEvidence,HOMEPAGE_PUBLIC_ENDPOINTS} from '../src/institutional-evidence.mjs';
const get=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const now=Date.parse('2026-10-24T10:00:00Z'),at=ms=>new Date(ms).toISOString();
const sample=()=>({
 references:{ok:true,generated_at:at(now-3000),reference_only:true,not_for_trade_execution:true,assets:{
  gold:{source:'Gold API',price:3996,source_updated_at:at(now-22_000),broker_verified:false,execution_quote:false},
  bitcoin:{source:'Coinbase',price:80500,observed_at:at(now-3000),source_updated_at:null,execution_quote:false}
 }},
 macro:null,
 quarterly:{ok:true,generated_at:at(now-7000),reference_only:true,not_for_trade_execution:true,
  assets:{gold:{source_last_daily_bar:'2026-10-23',is_actual_orderbook_liquidity:false,
     source_rights:'COMMERCIAL_REDISTRIBUTION_NOT_VERIFIED',source_rights:'COMMERCIAL_REDISTRIBUTION_NOT_VERIFIED',zone_method:'PRIOR_COMPLETED_QUARTER_OHLC_RANGE_2PCT_INNER_BANDS'},
    bitcoin:{source_last_daily_bar:'2026-10-24',is_actual_orderbook_liquidity:false,
     zone_method:'PRIOR_COMPLETED_QUARTER_OHLC_RANGE_2PCT_INNER_BANDS'}}},
 recovery:{ok:true,generated_at:at(now-500),state:'DATABASE INCIDENT REPORTED'}
});
const getRow=(a,key)=>a.items.find(x=>x.key===key);
test('timestamped Gold is indicative and Bitcoin lacking upstream time remains receipt-only',()=>{
 const a=evaluateHomeEvidence(sample(),now);
 assert.equal(getRow(a,'gold').state,'current');
 assert.equal(getRow(a,'gold').verdict,'SOURCE TIME VERIFIED');
 assert.equal(getRow(a,'bitcoin').state,'limited');
 assert.equal(getRow(a,'bitcoin').verdict,'RECEIPT ONLY');
 assert.match(getRow(a,'bitcoin').detail,/upstream quote time not supplied/);
 assert.equal(a.core_status,'DATABASE INCIDENT REPORTED');
 assert.equal(a.capital_permission,'0R');
 assert.equal(a.commerce_permitted,false);
});
test('no response or expired source timestamps never produce current Gold or Bitcoin claims',()=>{
 for(const x of [null,{}, {references:{ok:true}}, {
  ...sample(),references:{...sample().references,generated_at:at(now-200_000)}
 }]){
  const a=evaluateHomeEvidence(x||{},now);
  assert.equal(getRow(a,'gold').state,'withheld');
  assert.equal(getRow(a,'bitcoin').state,'withheld');
 }
 const stale=sample();stale.references.assets.gold.source_updated_at=at(now-125_000);
 assert.equal(getRow(evaluateHomeEvidence(stale,now),'gold').state,'withheld');
 const fake=sample();fake.references.assets.gold.broker_verified=true;
 assert.equal(getRow(evaluateHomeEvidence(fake,now),'gold').state,'withheld');
});
test('quarterly zones are labelled OHLC history, never current order-book liquidity',()=>{
 const x=evaluateHomeEvidence(sample(),now);
 assert.equal(getRow(x,'quarterly').state,'historical');
 assert.match(getRow(x,'quarterly').detail,/not order-book liquidity/);
 assert.match(getRow(x,'quarterly').detail,/redistribution rights unverified/);
 const bad=sample();bad.quarterly.assets.gold.is_actual_orderbook_liquidity=true;
 assert.equal(getRow(evaluateHomeEvidence(bad,now),'quarterly').state,'withheld');
});
test('macro 503 and missing license proof cannot be dressed as a live feed',()=>{
 assert.equal(getRow(evaluateHomeEvidence(sample(),now),'macro').state,'withheld');
 const x=sample();x.macro={ok:true,generated_at:at(now-1000),
  reference_only:true,not_for_trade_execution:true};
 assert.equal(getRow(evaluateHomeEvidence(x,now),'macro').verdict,'DELAYED REFERENCE ONLY');
 assert.notEqual(getRow(evaluateHomeEvidence(x,now),'macro').state,'current');
});
test('homepage uses only same-origin public endpoints without browser credentials',()=>{
 assert.deepEqual([...HOMEPAGE_PUBLIC_ENDPOINTS],
 ['/api/public-market-reference','/api/public-macro-reference',
 '/api/public-quarterly-zones','/api/public-recovery-triage']);
 const code=get('src/institutional-home.ts');
 assert.match(code,/credentials:'omit'/);
 assert.match(code,/referrerPolicy:'no-referrer'/);
 assert.match(code,/AbortSignal\.timeout\(7500\)/);
 assert.match(code,/\.textContent=/);
 assert.doesNotMatch(code,/innerHTML|localStorage|sessionStorage|document\.cookie|eval\(|new Function\(/);
 assert.doesNotMatch(code,/fetch\(['"]https:\/\//);
});
test('institutional design remains an accessible conceptual graphic with no misleading quote',()=>{
 const html=get('index.html'),css=get('src/institutional-home.css');
 assert.match(html,/id="institutional-lens"/);
 assert.match(html,/id="source-provenance"/);
 assert.match(html,/data-lens-horizon="quarterly"/);
 assert.match(html,/aria-pressed="true"/);
 assert.match(html,/not actual market prices or trading liquidity/);
 assert.match(html,/rights unverified/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css, /focus-visible/);
});
test('security headers, crawl exclusions and no payment or execution changes',()=>{
 const config=JSON.parse(get('vercel.json'));
 const global=config.headers.find(x=>x.source==='/(.*)').headers;
 const csp=global.find(x=>x.key==='Content-Security-Policy').value;
 assert.match(csp,/script-src 'self'/);
 assert.match(csp,/object-src 'none'/);
 assert.match(csp,/frame-ancestors 'none'/);
 assert.doesNotMatch(csp,/script-src[^;]*'unsafe-inline'/);
 assert.ok(config.headers.some(x=>x.source==='/api/(.*)'&&x.headers.some(v=>v.key==='X-Robots-Tag')));
 assert.ok(config.headers.some(x=>x.source.includes('checkout')&&x.headers.some(v=>v.value.includes('no-store'))));
 assert.match(get('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(get('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
 assert.match(get('public/sitemap.xml'),/market-observatory/);
});
