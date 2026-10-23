import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createObservationHandler} from '../_shared/public-launch-observation.mjs';
import {RUNTIME_PATHS,assembleRuntimeObservatory,runtimeCacheTtl} from './readiness.mjs';
Deno.serve(createObservationHandler({paths:RUNTIME_PATHS,assemble:assembleRuntimeObservatory,ttlFor:runtimeCacheTtl}));
