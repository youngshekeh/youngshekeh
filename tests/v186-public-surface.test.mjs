import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const [ts,html,feed,closure]=await Promise.all([
 readFile(new URL('../src/public-surfaces.ts',import.meta.url),'utf8'),
 readFile(new URL('../gold-live/index.html',import.meta.url),'utf8'),
 readFile(new URL('../api/market-feed.js',import.meta.url),'utf8'),
 readFile(new URL('../api/production-closure.js',import.meta.url),'utf8')
]);
test('V186 live surface uses a two-second read-only price lane',()=>{
 assert.match(ts,/\/api\/gold-live-price/);assert.match(ts,/2000/);assert.match(ts,/public-gold-live-xauusd/);
 assert.match(html,/V186 · LIVE XAUUSD PRICE ENGINE/);assert.match(html,/v186-bid/);assert.match(html,/MACHINE ORDERS/);
});
test('market feed and closure expose V186 without capital promotion',()=>{
 assert.match(feed,/public-gold-live-xauusd/);assert.match(closure,/live_xauusd:/);assert.match(closure,/market_data_only:true/);assert.match(closure,/capital_permission:'0R'/);
});
