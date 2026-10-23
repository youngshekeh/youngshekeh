import test from 'node:test';
import assert from 'node:assert/strict';
import {createResearchEpoch} from '../src/research-request-epoch.mjs';
test('a previous request cannot overwrite a later refresh',()=>{
 const epoch=createResearchEpoch();const first=epoch.begin();const second=epoch.begin();
 assert.equal(epoch.isCurrent(first),false);assert.equal(epoch.isCurrent(second),true);
});
test('pagehide invalidates pending responses',()=>{
 const epoch=createResearchEpoch();const first=epoch.begin();epoch.invalidate();
 assert.equal(epoch.isCurrent(first),false);
});
