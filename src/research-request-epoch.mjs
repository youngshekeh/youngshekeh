// Monotonic request generations prevent responses from a previous page lifecycle
// from overwriting a newer, validated research snapshot.
export function createResearchEpoch(){
 let current=0;
 return Object.freeze({begin:()=>++current,invalidate:()=>++current,isCurrent:id=>id===current});
}
