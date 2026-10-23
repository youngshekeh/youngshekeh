import test from 'node:test';
import assert from 'node:assert/strict';
import {validatedEyePacket} from '../src/directional-eye-packet.mjs';
const now=Date.UTC(2026,9,23,12);
const packet={version:'directional-eye-v1',generated_at:new Date(now).toISOString(),research_only:true,live_orders:false,capital_permission:'0R',assets:[{asset:'Bitcoin',state:'TRIGGER'}]};
test('research packet expires independently of individual signal expiry',()=>{
 assert.equal(validatedEyePacket(packet,now+59999),packet);
 assert.equal(validatedEyePacket(packet,now+60001),null);
 assert.equal(validatedEyePacket(packet,now-6000),null);
});
test('fail closed on invalid packet or execution permission',()=>{
 for(const p of [null,{...packet,assets:null},{...packet,live_orders:true},{...packet,capital_permission:'1R'},{...packet,generated_at:'invalid'}])assert.equal(validatedEyePacket(p,now),null);
});
