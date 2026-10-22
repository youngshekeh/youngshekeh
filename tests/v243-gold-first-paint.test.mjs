import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../gold-live/index.html',import.meta.url),'utf8');
function initial(id){
 const match=html.match(new RegExp('<strong\\s+id="'+id+'"[^>]*>([^<]*)<\\/strong>','i'));
 assert.ok(match,'Missing Gold DOM ID '+id);
 return match[1].trim();
}
const unverifiedCounters=[
 'v191-count','v192-visible','v192-notify','v195-active','v195-active-used',
 'v196-ticks','v199-auth','v199-ticks','v199-ticks60','v202-count',
 'v202-failures','v138-control-alloc','v138-challenger-alloc',
 'v138-control-only','v138-challenger-only','v137-decisions','v137-open'
];
test('first paint withholds all observations until a data response verifies them',()=>{
 for(const id of unverifiedCounters)assert.equal(initial(id),'WITHHELD',id);
});
test('first paint does not assert unverified feed or session connectivity',()=>{
 assert.equal(initial('v186-source'),'UNVERIFIED');
 assert.equal(initial('v187-window'),'WITHHELD');
});
test('pre-existing execution safety locks remain OFF and capital remains 0R',()=>{
 assert.equal(initial('v156-orders'),'OFF');
 assert.equal(initial('v156-capital'),'0R');
});
test('936 Gold DOM IDs are retained and unique',()=>{
 const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,936);
 assert.equal(new Set(ids).size,936);
});
