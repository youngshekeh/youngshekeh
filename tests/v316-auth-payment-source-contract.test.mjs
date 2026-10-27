import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const member=readFileSync(new URL('../src/member.ts',import.meta.url),'utf8');
const checkout=readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8');
const owner=readFileSync(new URL('../src/owner.ts',import.meta.url),'utf8');

test('member session storage retains access token only and never persists provider refresh secret',()=>{
  assert.match(member,/sessionStorage\.setItem\(/);
  assert.match(member,/access_token:\s*data\.access_token/);
  assert.doesNotMatch(member,/refresh_token:\s*data\.refresh_token/);
  assert.match(member,/sessionStorage\.removeItem\('tfa_session'\)/);
  assert.match(member,/const verdict = await verifySession\(data\.access_token, attempt\)/);
  assert.match(member,/attempt\.assertCurrent\(\)/);
});
test('self-service checkout remains hard-sealed until private server guard review',()=>{
  assert.match(checkout,/const CHECKOUT_SERVER_GUARD_DEPLOYED=false;/);
  assert.match(checkout,/if\(!CHECKOUT_SERVER_GUARD_DEPLOYED\)\{\s*lock\(/);
  assert.match(checkout,/if\(!verified\|\|btn\.disabled\|\|charging\)return;/);
  assert.match(checkout,/await verifyAcceptanceBeforeCharge\(token\)/);
  assert.match(checkout,/!validProviderCheckout\(data\?\.checkout_url\)/);
});
test('owner requires server-side identity and explicitly verified AAL2 for private controls',()=>{
  assert.match(owner,/verdict\.is_owner !== true/);
  assert.match(owner,/status\.aal2 === true && status\.aal === 'aal2'/);
  assert.match(owner,/if \(!ownerVerified \|\| !accessToken\) return;/);
  assert.match(owner,/lockOwnerPaperQuote\(\)/);
});
