import {assessPublicResearchAvailability} from './public-research-readiness.mjs';

// Do not queue a public reference check behind database, auth, billing, or
// private QA requests. This lane only needs the delivered page and one public
// provider response; a rejected read still reports the website truthfully.
export async function probePublicStatus({readReference,report=()=>{},now=Date.now}={}){
 if(typeof readReference!=='function')throw new TypeError('readReference_required');
 let reference;
 try{reference=await readReference()}catch{reference=null}
 const result=assessPublicResearchAvailability({pageServed:true,reference},now());
 report(result);
 return result;
}
