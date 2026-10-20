import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { unsafePath,inspectPaths } from '../scripts/continuity-vault.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('source backups fail closed on private key and dotenv paths',()=>{
  for(const path of ['.env','sub/.env.production','private/id_rsa','prod/secrets.json','certs/domain.pem','payment/merchant.p12'])
    assert.equal(unsafePath(path),true,path);
  for(const path of ['.env.example','src/market.ts','docs/continuity/RECOVERY.md'])
    assert.equal(unsafePath(path),false,path);
  assert.throws(()=>inspectPaths(['src/index.ts','private/service-account.json']),/Source snapshot rejected/);
});
test('source archive is tied to exact SHA and checksummed, with honest omissions',()=>{
  const src=read('scripts/continuity-vault.mjs');
  assert.match(src,/git\('rev-parse','HEAD'\)/);
  assert.match(src,/GITHUB_SHA!==sha/);
  assert.match(src,/sha256\(zip\)/);
  assert.match(src,/git',\['archive'/);
  assert.match(src,/tfa-source\.tar\.gz/);
  assert.match(src,/Supabase database records/);
  assert.match(src,/Supabase Storage objects/);
  assert.match(src,/environment secrets/);
});
test('production capture is not run on untrusted PR code',()=>{
  const wf=read('.github/workflows/v214-continuity-vault.yml');
  assert.match(wf,/push:\n\s+branches: \[the-father-analytics-deploy\]/);
  assert.match(wf,/github\.event_name != 'pull_request'/);
  assert.match(wf,/actions\/upload-artifact@/);
  assert.match(wf,/retention-days: 90/);
  assert.match(wf,/persist-credentials: false/);
});
test('recovery notes preserve live-money and billing firewall',()=>{
  const doc=read('docs/continuity/RECOVERY.md');
  assert.match(doc,/WAIT \/ 0R/);
  assert.match(doc,/Supabase.*Backups/);
  assert.match(doc,/signed webhook/);
  assert.match(doc,/Never store in public logs\/artifacts|Store encrypted credentials only/i);
  const checkout=read('src/checkout.ts');
  assert.match(checkout,/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
  assert.match(read('api/ops-heartbeat.js'),/database_scheduler:\{changed:false/);
});
