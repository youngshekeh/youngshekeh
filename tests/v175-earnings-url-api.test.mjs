import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import handler from '../api/earnings-calendar.js';

function responseHarness(){
  const headers=new Map();
  return {
    code:200,
    body:null,
    setHeader(k,v){headers.set(String(k).toLowerCase(),String(v));},
    status(code){this.code=code;return this;},
    json(body){this.body=body;return body;},
    headers
  };
}

test('V175 earnings handler uses WHATWG URL searchParams instead of req.query', async () => {
  const originalFetch=globalThis.fetch;
  let requestedUrl='';
  globalThis.fetch=async (url)=>{
    requestedUrl=String(url);
    return {ok:true,status:200,json:async()=>({data:{rows:[]}})};
  };
  try{
    const req={
      method:'GET',
      url:'/api/earnings-calendar?date=2026-10-02',
      query:{date:'1999-01-01'}
    };
    const res=responseHarness();
    await handler(req,res);
    assert.equal(res.code,200);
    assert.equal(res.body?.date,'2026-10-02');
    assert.match(requestedUrl,/date=2026-10-02$/);
    assert.equal(res.headers.get('x-tfa-engine'),'V175-EARNINGS');
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('V175 source contract contains no legacy query-parser access', () => {
  const source=fs.readFileSync(new URL('../api/earnings-calendar.js',import.meta.url),'utf8');
  assert.match(source,/new URL\(/);
  assert.match(source,/searchParams\.get\('date'\)/);
  assert.doesNotMatch(source,/req\.query/);
  assert.doesNotMatch(source,/url\.parse\s*\(/i);
});
