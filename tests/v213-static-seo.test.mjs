import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import test from 'node:test';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Vite public folder ships SEO assets at public route roots',()=>{
 assert.ok(existsSync(new URL('../public/robots.txt',import.meta.url)));
 assert.ok(existsSync(new URL('../public/sitemap.xml',import.meta.url)));
 const config=read('vite.config.ts');
 assert.doesNotMatch(config,/publicDir:\s*false/);
 assert.match(read('package.json'),/"build": "vite build"/);
});
test('published copies exactly match canonical source',()=>{
 assert.equal(read('public/robots.txt'),read('robots.txt'));
 assert.equal(read('public/sitemap.xml'),read('sitemap.xml'));
});
test('search index includes commercial research but excludes authentication and checkout',()=>{
 const map=read('public/sitemap.xml');
 const robots=read('public/robots.txt');
 for(const route of ['/pricing','/research','/live-markets','/world-economy'])
  assert.match(map,new RegExp('https://thefatheranalytics\\.com'+route));
 assert.match(robots,/Disallow: \/checkout\//);
 assert.match(robots,/Disallow: \/member\//);
 assert.match(robots,/Sitemap: https:\/\/thefatheranalytics\.com\/sitemap\.xml/);
 assert.doesNotMatch(map,/\/checkout|\/member|\/owner/);
});
test('public payment lock and research client-only form remain independent of SEO',()=>{
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(read('src/research.ts'),/buildEnquiry\(collect\(\)\)/);
});
