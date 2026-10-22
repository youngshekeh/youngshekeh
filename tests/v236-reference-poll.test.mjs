import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('front page shares one public provider request lane across both boards',()=>{
 const publicClient=read('src/public-market-reference.mjs');
 const marketBoard=read('src/v235-public-board.mjs');
 assert.match(publicClient,/fetch\('\/api\/public-market-reference'/);
 assert.match(publicClient,/new CustomEvent\('tfa:public-references'/);
 assert.match(publicClient,/window\.__tfaPublicReferencePacket=data/);
 assert.match(publicClient,/window\.__tfaPublicReferencePacket=\{ok:false\}/);
 assert.match(marketBoard,/addEventListener\('tfa:public-references'/);
 assert.match(marketBoard,/window\.__tfaPublicReferencePacket\?\?null/);
 assert.doesNotMatch(marketBoard,/fetch\(/);
});
test('reference values revalidate and clear on stale evidence',()=>{
 const board=read('src/v235-public-board.mjs');
 assert.match(board,/window\.setInterval\(\(\)=>paint\(/);
 assert.match(board,/verifiedPublicReferences\(packet,Date\.now\(\)\)/);
 assert.match(board,/quote\.value\.toLocaleString/);
});
test('initial public HTML is calm and never claims the private engines are loading forever',()=>{
 const home=read('index.html');
 assert.doesNotMatch(home,/>SYNCING</);
 assert.doesNotMatch(home,/>LOADING</);
 assert.match(home,/>AWAITING SOURCE</);
 assert.match(home,/id="public-market-reference"/);
 assert.match(home,/id="independentLaneState"/);
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
});
