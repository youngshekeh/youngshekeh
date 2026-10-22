// Unknown evidence must not render as zero events, no blockers or completed gates.
export function withholdResearchPanel(data,prefix,{document,set,byId,grids=[]}){
 if(data?.ok===true)return false;
 const message='Research source unavailable. Status, counts and readiness are not verified.';
 for(const element of document.querySelectorAll('[id^="'+prefix+'-"]')){
  if(['STRONG','H2','H3'].includes(element.tagName))set(element.id,null);
 }
 for(const suffix of ['state','chain'])set(prefix+'-'+suffix,'UNAVAILABLE');
 set(prefix+'-blockers','UNKNOWN');
 for(const suffix of ['detail','blocker-copy','liquidity-copy','session-copy','next-copy','latest-copy'])
  set(prefix+'-'+suffix,message);
 for(const suffix of ['permission','capital','decision'])set(prefix+'-'+suffix,'WAIT · 0R');
 for(const id of grids){
  const grid=byId(id);if(!grid)continue;grid.replaceChildren();
  const card=document.createElement('article');card.className='command-card';
  const heading=document.createElement('h3');heading.textContent='EVIDENCE UNAVAILABLE';
  const copy=document.createElement('p');copy.textContent=message;
  card.append(heading,copy);grid.appendChild(card);
 }
 return true;
}
