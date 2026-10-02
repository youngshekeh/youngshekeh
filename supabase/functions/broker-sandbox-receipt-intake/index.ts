import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createSandboxReceiptHandler} from './handler.mjs';
function serverKey(){
  const bundle=Deno.env.get('SUPABASE_SECRET_KEYS');
  if(bundle){try{const keys=JSON.parse(bundle);if(keys.default)return keys.default;}catch{}}
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!key)throw new Error('server_key_unavailable');return key;
}
Deno.serve(createSandboxReceiptHandler({base:Deno.env.get('SUPABASE_URL')!,serverKey}));
