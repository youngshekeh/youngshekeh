import assert from 'node:assert/strict';

const raw=process.env.TFA_BASE_URL||process.argv[2];
if(!raw)throw new Error('TFA_BASE_URL or base URL argument is required');
const base=new URL(raw);
if(base.protocol!=='https:')throw new Error('Production smoke target must use HTTPS');
base.pathname='/';base.search='';base.hash='';
const origin=base.origin;

async function get(path){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try{return await fetch(new URL(path,origin),{redirect:'manual',signal:controller.signal,headers:{Accept:path.endsWith('.js')?'text/javascript':'text/html,application/json;q=0.9'}})}
  finally{clearTimeout(timer)}
}

const health=await get('/__tfa/health');
assert.equal(health.status,200,'gateway health must return HTTP 200');
assert.match(health.headers.get('cache-control')||'',/no-store/i,'gateway health must be no-store');
const h=await health.json();
assert.equal(h.ok,true,'gateway health ok must be true');
assert.equal(h.gateway_version,'52.2.0','deployed gateway version must be 52.2.0');
assert.equal(h.auth_proxy,true,'Auth proxy must be enabled');
assert.equal(h.functions_proxy,true,'Functions proxy must be enabled');
assert.equal(h.provider_rate_limit,'UNVERIFIED_EXTERNALLY','provider-side rate-limit state must not be inferred by frontend health');

for(const path of ['/access','/member','/owner','/status']){
  const r=await get(path);
  assert.equal(r.status,200,`${path} must return HTTP 200`);
  assert.match(r.headers.get('content-type')||'',/text\/html/i,`${path} must return HTML`);
  const text=await r.text();
  assert.match(text,/THE FATHER ANALYTICS/i,`${path} must render the application shell`);
  assert.ok(!text.includes('mpcelmjiycjpdyyflisn.supabase.co'),`${path} HTML must not expose a raw Supabase browser target`);
  assert.ok(!/VERIFIED_LIFTED_BY_(?:SUPABASE_)?SUPPORT/.test(text),`${path} must not claim externally unverified provider lift`);
  if(path==='/member'||path==='/owner'){
    assert.match(r.headers.get('cache-control')||'',/no-store/i,`${path} must be no-store`);
    assert.match(r.headers.get('x-robots-tag')||'',/noindex/i,`${path} must be noindex`);
  }
}

const common=await get('/common.js?v=52.2.0');
assert.equal(common.status,200,'common.js must load');
const commonText=await common.text();
assert.match(commonText,/USE_GATEWAY/,'same-origin gateway selection must be present');
assert.match(commonText,/location\.origin/,'production runtime must select the canonical origin');

console.log(`POSTDEPLOY SMOKE PASS: ${origin} serves v52.2 gateway, protected route headers, and truth-correct provider status.`);
