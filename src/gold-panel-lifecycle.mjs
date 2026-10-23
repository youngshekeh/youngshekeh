// Restore both polling and independent expiry checks after browser page-cache navigation.
export function startGoldPanelLifecycle({page=window,visibility=document,paint,refresh,every}){
 let timer=null,expiryTimer=null;
 const wake=()=>{paint();if(!visibility.hidden)void refresh();};
 const start=()=>{
  if(timer!==null)return;
  timer=page.setInterval(()=>{if(!visibility.hidden)void refresh();},every);
  expiryTimer=page.setInterval(paint,1000);
  visibility.addEventListener('visibilitychange',wake);
 };
 const stop=()=>{
  page.clearInterval(timer);page.clearInterval(expiryTimer);
  timer=null;expiryTimer=null;
  visibility.removeEventListener('visibilitychange',wake);
 };
 const restore=()=>{start();wake();};
 page.addEventListener('pagehide',stop);
 page.addEventListener('pageshow',restore);
 start();void refresh();
 return ()=>{stop();page.removeEventListener('pagehide',stop);page.removeEventListener('pageshow',restore);};
}
