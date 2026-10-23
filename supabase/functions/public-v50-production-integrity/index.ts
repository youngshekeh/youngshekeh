import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createObservationHandler} from '../_shared/public-launch-observation.mjs';
import {INTEGRITY_PATHS,assembleProductionIntegrity,integrityCacheTtl} from './readiness.mjs';
Deno.serve(createObservationHandler({paths:INTEGRITY_PATHS,assemble:assembleProductionIntegrity,
 ttlFor:integrityCacheTtl,readTimeouts:{'public-app-config':6000}}));
