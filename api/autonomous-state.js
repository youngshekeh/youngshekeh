import { getVercelOidcToken } from '@vercel/oidc';
import {createPrivateStateHandler} from '../src/private-state-bridge.mjs';

export default createPrivateStateHandler({getToken:getVercelOidcToken});
