import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createObservationHandler} from '../_shared/public-launch-observation.mjs';
import {FINAL_PATHS,assembleFinalReadiness,finalCacheTtl} from './readiness.mjs';
Deno.serve(createObservationHandler({paths:FINAL_PATHS,assemble:assembleFinalReadiness,
 ttlFor:finalCacheTtl,allowHead:true}));
