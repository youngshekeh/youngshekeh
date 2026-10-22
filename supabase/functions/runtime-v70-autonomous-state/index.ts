import {createReadOnlyState} from './read-only-state.mjs';
// The pre-recovery source is preserved in legacy-source.ts; it is not executed.
// Vercel OIDC is verified by the existing private verifier before any DB read.
Deno.serve(createReadOnlyState({
  base:Deno.env.get('SUPABASE_URL')||'https://mpcelmjiycjpdyyflisn.supabase.co',
  serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''
}));
