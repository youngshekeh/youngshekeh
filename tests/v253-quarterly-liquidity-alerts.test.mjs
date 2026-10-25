import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {QUARTER_ASSETS,quarterBounds,parseYahooQuarterBars,parseCoinbaseQuarterBars,
 calculateQuarterlyZones,quarterlyPacket,verifyQuarterlyPacket} from '../src/quarterly-liquidity-core.mjs';
import {classifyQuarterAlert,acceptQuarterAlert} from '../src/quarterly-alert-rules.mjs';
import {observeQuarterlyRanges} from '../api/public-quarterly-zones.js';
const now=Date.parse('2026-10-23T14:45:00Z');
const config=QUARTER_ASSETS;
function sessions(){
 const dates=[];
 for(let m=6;m<=9;m++){
  for(let d=1;d<=31;d++){
   const t=Date.UTC(2026,m,d),a=new Date(t);
   if(a.getUTCMonth()!==m||t>now)continue;
   const day=a.getUTCDay();if(day>0&&day<6)dates.push(t);
  }
 }
 return dates;
}
function yahoo(asset,{broken=false}={}){
 const cfg=config[asset],dates=sessions(),n=dates.length;
 const highs=dates.map((_,i)=>100+i*.2+3),lows=dates.map((_,i)=>100+i*.2-2);
 const metadata={symbol:cfg.symbol,instrumentType:cfg.kind,exchangeName:cfg.exchange,
  currency:'USD',regularMarketPrice:120,regularMarketTime:Math.floor((now-20000)/1000),
  shortName:asset==='wti'?'Crude Oil Dec 26':asset==='gold'?'Gold Dec 26':'Vendor continuous reference'};
 if(broken)metadata.symbol='WRONG';
 return {chart:{error:null,result:[{meta:metadata,timestamp:dates.map(x=>x/1000),
  indicators:{quote:[{high:highs,low:lows,open:lows.map(x=>x+1),close:highs.map(x=>x-1)}]}}]}};
}
function coinbase(){
 const result=[];
 for(let m=6;m<=9;m++)for(let d=1;d<=31;d++){
  const t=Date.UTC(2026,m,d),date=new Date(t);
  if(date.getUTCMonth()!==m||t>now)continue;
  result.push([t/1000,80000+d*10,84000+d*10,81000+d*10,82000+d*10,5]);
 }
 return result;
}
test('all nine declared asset identities are distinct and honest',()=>{
 assert.equal(Object.keys(config).length,9);
 assert.deepEqual(Object.keys(config),['gold','bitcoin','brent','wti','eurusd','dxy','spx','nasdaq','treasury']);
 assert.equal(config.gold.symbol,'GC=F');
 assert.notEqual(config.gold.symbol,'XAUUSD');
 assert.equal(config.nasdaq.symbol,'^IXIC');
 assert.equal(config.treasury.symbol,'^TNX');
});
test('UTC period rolls Q3 2026 to Q4 2026 and Q4 to Q1 2027 correctly',()=>{
 const q=quarterBounds(now);
 assert.equal(q.previous_label,'Q3 2026');
 assert.equal(q.current_label,'Q4 2026');
 assert.equal(q.previous_start,'2026-07-01T00:00:00.000Z');
 assert.equal(q.previous_end,'2026-10-01T00:00:00.000Z');
 const q1=quarterBounds(Date.parse('2027-01-10T12:00:00Z'));
 assert.equal(q1.previous_label,'Q4 2026');
 assert.equal(q1.current_label,'Q1 2027');
});
test('Yahoo real daily OHLC is validated by exact exchange, instrument, symbol',()=>{
 for(const asset of Object.keys(config).filter(x=>x!=='bitcoin')){
  const parsed=parseYahooQuarterBars(yahoo(asset),asset);
  assert.equal(parsed?.instrument,config[asset].symbol,asset);
  const zone=calculateQuarterlyZones(parsed,asset,now);
  assert.ok(zone,asset);
  assert.equal(zone.previous_quarter,'Q3 2026');
  assert.equal(zone.current_quarter,'Q4 2026');
  assert.equal(zone.is_actual_orderbook_liquidity,false);
  assert.ok(zone.sample_days_prev>=48);
  assert.equal(zone.governance.capital_permission,'0R');
 }
});
test('Bitcoin Coinbase candles map [time,low,high,open,close,volume], not OHLC order',()=>{
 const bars=parseCoinbaseQuarterBars(coinbase());
 const zone=calculateQuarterlyZones(bars,'bitcoin',now);
 assert.ok(zone);assert.equal(zone.source,'Coinbase Exchange');
 assert.equal(zone.quote,null);
 assert.ok(zone.previous_high>zone.previous_low);
 assert.equal(zone.sample_days_prev,92);
});
test('previous quarter incomplete month is rejected, not estimated from other months',()=>{
 const data=yahoo('gold');
 const ts=data.chart.result[0].timestamp,quotes=data.chart.result[0].indicators.quote[0];
 for(let i=ts.length-1;i>=0;i--)if(new Date(ts[i]*1000).getUTCMonth()===7){
  ts.splice(i,1);for(const key of ['high','low','open','close'])quotes[key].splice(i,1);
 }
 const zone=calculateQuarterlyZones(parseYahooQuarterBars(data,'gold'),'gold',now);
 assert.equal(zone,null);
});
test('ICE DXY full-empty calendar placeholders are skipped, never imputed',()=>{
 const p=yahoo('dxy');
 const v=p.chart.result[0].indicators.quote[0];
 for(let i=0;i<v.high.length;i+=12){v.high[i]=null;v.low[i]=null}
 const parsed=parseYahooQuarterBars(p,'dxy');
 assert.ok(parsed);
 assert.ok(parsed.rows.length<p.chart.result[0].timestamp.length);
 const zone=calculateQuarterlyZones(parsed,'dxy',now);
 assert.ok(zone);
 assert.ok(zone.sample_days_prev>=48);
});
test('malformed, duplicate, future and non-positive price candles fail closed',()=>{
 const p=yahoo('gold');p.chart.result[0].meta.symbol='XAUUSD=X';
 assert.equal(parseYahooQuarterBars(p,'gold'),null);
 const x=yahoo('dxy');x.chart.result[0].indicators.quote[0].high[4]=-1;
 assert.equal(parseYahooQuarterBars(x,'dxy'),null);
 const btc=coinbase();btc.push([...btc[0]]);
 assert.equal(parseCoinbaseQuarterBars(btc),null);
 const future=yahoo('gold');future.chart.result[0].timestamp[0]=999999999999;
 assert.equal(parseYahooQuarterBars(future,'gold'),null);
});
test('new quarter retains completed-quarter levels when no QTD bars exist yet',()=>{
 const early=Date.parse('2026-10-01T00:20:00Z');
 const parsed=parseYahooQuarterBars(yahoo('gold'), 'gold', now);
 const older={...parsed,rows:parsed.rows.filter(x=>x.at<'2026-10-01')};
 const zone=calculateQuarterlyZones(older,'gold',early);
 assert.ok(zone);
 assert.equal(zone.previous_quarter,'Q3 2026');
 assert.equal(zone.sample_days_qtd,0);
 assert.equal(zone.current_qtd_low,null);
 assert.equal(zone.current_qtd_high,null);
});
test('derived zones use previous quarter extreme and exactly 2% inner band',()=>{
 const zone=calculateQuarterlyZones(parseYahooQuarterBars(yahoo('brent'),'brent'),'brent',now);
 const width=(zone.previous_high-zone.previous_low)*.02;
 assert.ok(Math.abs(zone.buy_side_proxy[0]-(zone.previous_high-width))<1e-8);
 assert.ok(Math.abs(zone.sell_side_proxy[1]-(zone.previous_low+width))<1e-8);
 assert.equal(zone.previous_midpoint,(zone.previous_high+zone.previous_low)/2);
 assert.equal(zone.probability,null);
});
test('quarterly API isolates upstream failures, never requests or displays unlicensed BTC derived ranges',async()=>{
 const requests=[];
 const p=await observeQuarterlyRanges({read:async url=>{
  requests.push(url);
  if(url.includes('GC%3DF'))throw Error('gold source unavailable');
  const match=Object.keys(config).find(asset=>asset!=='bitcoin'&&
    url.includes(encodeURIComponent(config[asset].symbol)));
  if(!match)throw Error('unknown asset fixture '+url);
  return yahoo(match);
 },now:()=>now});
 assert.equal(requests.length,8);
 assert.equal(requests.some(u=>u.includes('coinbase')),false);
 assert.equal(p.source_count,7);
 assert.equal(p.expected_assets,9);
 assert.equal(p.assets.gold,null);
 assert.equal(p.assets.bitcoin,null);
 assert.equal(p.source_rights.bitcoin.public_quarterly_range_allowed,false);
 assert.equal(p.not_for_trade_execution,true);
 assert.equal(p.governance.capital_permission,'0R');
});
test('tampered, stale, wrong quarter packets are never accepted',()=>{
 const gold=calculateQuarterlyZones(parseYahooQuarterBars(yahoo('gold'),'gold'),'gold',now);
 const p=quarterlyPacket({gold},now);
 assert.ok(verifyQuarterlyPacket(p,now).gold);
 assert.deepEqual(verifyQuarterlyPacket({...p,governance:{capital_permission:'1R'}},now),{});
 assert.deepEqual(verifyQuarterlyPacket(p,now+13*60*1000),{});
 assert.deepEqual(verifyQuarterlyPacket(p,Date.parse('2027-01-10T00:00:00Z')),{});
 assert.deepEqual(verifyQuarterlyPacket({...p,assets:{gold:{...gold,is_actual_orderbook_liquidity:true}}},now),{});
});
test('research alert requires current exact-source, non-executable inputs',()=>{
 const zone=calculateQuarterlyZones(parseYahooQuarterBars(yahoo('wti'),'wti'),'wti',now);
 const valid={value:zone.previous_high-0.005,at:new Date(now-20000).toISOString(),source:'Yahoo Finance'};
 const a=classifyQuarterAlert(zone,valid,now);
 assert.equal(a.state,'AT_PREVIOUS_Q_HIGH_ZONE');
 assert.equal(a.capital_permission,'0R');
 assert.equal(a.not_execution_signal,true);
 assert.equal(classifyQuarterAlert(zone,{...valid,source:'Coinbase'},now),null);
 assert.equal(classifyQuarterAlert(zone,{...valid,at:new Date(now-70*60*1000).toISOString()},now),null);
 assert.equal(classifyQuarterAlert({...zone,governance:{capital_permission:'1R'}},valid,now),null);
});
test('alert dedup suppresses repeated samples, and only a zone transition emits a new event',()=>{
 const zone=calculateQuarterlyZones(parseYahooQuarterBars(yahoo('dxy'),'dxy'),'dxy',now);
 const quote=value=>({value,at:new Date(now-1000).toISOString(),source:'Yahoo Finance'});
 let s=new Map();
 let r=acceptQuarterAlert(s,classifyQuarterAlert(zone,quote(zone.previous_high-.002),now),now);
 assert.ok(r.event);s=r.state;
 r=acceptQuarterAlert(s,classifyQuarterAlert(zone,quote(zone.previous_high-.002),now),now+1000);
 assert.equal(r.event,null);s=r.state;
 r=acceptQuarterAlert(s,classifyQuarterAlert(zone,quote(zone.previous_high+.1),now),now+2000);
 assert.equal(r.event.state,'ABOVE_PREVIOUS_Q_HIGH');
});
test('Bitcoin spot alert requires current Coinbase receipt and cannot reuse stale data',()=>{
 const zone=calculateQuarterlyZones(parseCoinbaseQuarterBars(coinbase()),'bitcoin',now);
 const yes={value:zone.previous_high,at:new Date(now-1000).toISOString(),source:'Coinbase'};
 assert.ok(classifyQuarterAlert(zone,yes,now));
 assert.equal(classifyQuarterAlert(zone,{...yes,source:'Coinbase Exchange'},now),null);
 assert.equal(classifyQuarterAlert(zone,{...yes,at:new Date(now-31000).toISOString()},now),null);
});
test('UI enables notifications only after deliberate user clicks, no background push fiction',()=>{
 const ui=readFileSync(new URL('../src/quarterly-observatory.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('../market-observatory/index.html',import.meta.url),'utf8');
 const api=readFileSync(new URL('../api/public-quarterly-zones.js',import.meta.url),'utf8');
 assert.match(ui,/alertsArmed=false/);
 assert.match(ui,/Notification\.requestPermission\(\)/);
 assert.match(ui,/quarter-zones/);
 assert.match(html,/id="quarter-zones"/);
 assert.match(html,/background push, SMS and email delivery are not enabled/);
 assert.match(api,/req.method!=='GET'/);
 assert.doesNotMatch(ui+api,/submit_order|place_order|SERVICE_ROLE|SUPABASE_DB_URL|cron\.alter_job|send_mail|send_sms/i);
});
