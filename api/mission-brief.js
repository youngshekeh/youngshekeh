import { getVercelOidcToken } from '@vercel/oidc';
import {createPrivateStateHandler} from '../src/private-state-bridge.mjs';
const read=createPrivateStateHandler({getToken:getVercelOidcToken,functionSlug:'runtime-v115-mission-brief'});
export default function handler(req,res){
  res.setHeader('X-TFA-Release-Provenance','VERCEL_ATTESTATION_BRIDGE');
  return read(req,res);
}
