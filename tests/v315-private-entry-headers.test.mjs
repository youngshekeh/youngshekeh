import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));

function applicable(path){
  return (config.headers||[]).filter(entry=>{
    try {return new RegExp('^'+entry.source+'$').test(path);}
    catch{return false;}
  }).flatMap(entry=>entry.headers||[]);
}
function values(path,key){
  return applicable(path).filter(x=>x.key.toLowerCase()===key.toLowerCase())
    .map(x=>x.value);
}
test('all auth and checkout entry routes refuse public caching and indexing',()=>{
  for(const segment of ['access','member','owner','checkout']){
    for(const suffix of ['','/','/login/','/billing']){
      const path='/'+segment+suffix;
      assert.ok(values(path,'Cache-Control').includes('private, no-store'),
        'missing private no-store for '+path);
      assert.ok(values(path,'X-Robots-Tag').some(v=>v.includes('noindex')),
        'missing noindex for '+path);
    }
  }
});
test('ordinary public routes are not made private by the new security entries',()=>{
  for(const path of ['/','/live-markets/','/research/','/pricing/']){
    assert.ok(!values(path,'Cache-Control').includes('private, no-store'),
      'unexpected private header on '+path);
  }
});
test('global transport and framing protections are unchanged',()=>{
  const paths=['/','/access/','/owner/','/live-markets/'];
  for(const path of paths){
    assert.ok(values(path,'Content-Security-Policy').some(v=>
      v.includes("frame-ancestors 'none'")));
    assert.ok(values(path,'Strict-Transport-Security').some(v=>
      /max-age=63072000/.test(v)));
    assert.ok(values(path,'X-Frame-Options').includes('DENY'));
  }
});
