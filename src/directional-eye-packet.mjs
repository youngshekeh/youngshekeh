// Reject cached research packets once their original evidence receipt has expired.
export const EYE_PACKET_MAX_AGE_MS=60000;
export function validatedEyePacket(packet,now=Date.now()){
 if(!packet||packet.version!=='directional-eye-v1'||packet.research_only!==true||packet.live_orders!==false||packet.capital_permission!=='0R'||!Array.isArray(packet.assets))return null;
 const age=now-Date.parse(packet.generated_at);
 if(!Number.isFinite(age)||age< -5000||age>EYE_PACKET_MAX_AGE_MS)return null;
 return packet;
}
