import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../api/gold-session-liquidity.js',import.meta.url),'utf8');
test('V188 session proxy is fixed-source OIDC and fail closed',()=>{
 assert.match(source,/runtime-v188-session-liquidity/);
 assert.match(source,/getVercelOidcToken/);
 assert.match(source,/capital_permission:'0R'/);
 assert.doesNotMatch(source,/req\.query|req\.body|new URL\(req\.url/);
});
