import {createResearchTransport} from './research-transport.mjs';
// A single shared instance covers the public desks and the broker readiness widget.
export const researchConnection=createResearchTransport({
 fetchImpl:window.fetch.bind(window),origin:window.location.origin,
 isVisible:()=>!document.hidden,
 onState:state=>window.dispatchEvent(new CustomEvent('tfa:research-transport',{detail:state}))
});
export const researchFetch=researchConnection.request;
document.addEventListener('visibilitychange',()=>{
 if(document.hidden)researchConnection.pause();else researchConnection.resume();
});
window.addEventListener('pagehide',()=>researchConnection.pause());
window.addEventListener('pageshow',()=>researchConnection.resume());
