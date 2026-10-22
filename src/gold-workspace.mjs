import './gold-workspace.css';
import {researchConnection} from './research-connection.mjs';

export function workspaceCategory(value){
 const code=String(value).match(/\bV(\d{2,3})(?:[.\s·–-]|$)/i)?.[1];
 const n=Number(code);
 if(n>=141&&n<=166)return 'operations';
 if([172,186,195,196,197,199,202,204].includes(n))return 'broker';
 if([75,79,80,81,82,83,187,188,189,192,198].includes(n))return 'signals';
 if(n>=119&&n<=140&&n!==120||n===191)return 'learning';
 return 'overview';
}
function setup(){
 if(document.body.dataset.surface!=='gold-live')return;
 const main=document.querySelector('main');
 if(!main||main.dataset.workspaceReady)return;
 const sections=Array.from(main.querySelectorAll('section.section-block, section[id].command-card'));
 const labels=new Map(sections.map(section=>[section,section.querySelector('.kicker')?.textContent||'']));
 if(!sections.length)return;
 main.dataset.workspaceReady='true';
 const create=(tag,className,text)=>{
  const element=document.createElement(tag);element.className=className;
  if(text!==undefined)element.textContent=text;return element;
 };
 const root=create('section','gold-workspace');root.id='gold-workspace';
 root.setAttribute('aria-label','Gold research workspace');
 const head=create('div','gw-head');
 const title=create('div','gw-title');
 title.append(create('span','gw-kicker','THE RESEARCH DESK'),create('h2','','Explore Gold intelligence'));
 head.append(title);
 const status=create('p','gw-connection');
 const stateLabel=create('span','gw-state');stateLabel.setAttribute('role','status');stateLabel.setAttribute('aria-live','polite');
 const timingLabel=create('span','gw-timing');timingLabel.setAttribute('aria-live','off');
 status.append(stateLabel,timingLabel);head.append(status);root.append(head);
 const tabs=create('div','gw-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Research categories');root.append(tabs);
 const groups=[['overview','Overview','Market context and scenarios'],['signals','Signals & zones','Liquidity, timing and structural levels'],
  ['learning','Evidence & learning','Outcomes, calibration and signal history'],['broker','Broker data','Read-only feed and connection evidence'],
  ['operations','Operations','Service health and release checks']];
 const panels=new Map(),buttons=new Map(),counts=new Map();
 for(const [key,label,description] of groups){
  const button=create('button','gw-tab',label);button.type='button';button.id='gw-tab-'+key;
  button.setAttribute('role','tab');button.setAttribute('aria-controls','gw-panel-'+key);
  tabs.append(button);buttons.set(key,button);counts.set(key,0);
  const panel=create('section','gw-panel');panel.id='gw-panel-'+key;
  panel.dataset.workspacePanel=key;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);
  panel.append(create('p','gw-description',description));root.append(panel);panels.set(key,panel);
 }
 // Move existing nodes rather than cloning: IDs, forms and bound handlers survive.
 const titles={186:'Broker price feed',187:'Signal timing and multi-timeframe zones',
  188:'Setup lifecycle and session liquidity',189:'Upcoming signal windows',191:'Signal event history',
  192:'Alert history and priorities',194:'Gold command summary',195:'Broker connection checklist',
  196:'Market data quality',197:'Live data verification',198:'Session intelligence',
  199:'Broker connection diagnostics',202:'Connection event history',204:'Data activation status',
  120:'Session scenarios and research'};
 for(const section of sections){
  const kicker=labels.get(section);
  const category=workspaceCategory(kicker);
  const code=Number(kicker.match(/^V(\d+)/)?.[1]);
  const heading=section.querySelector('.section-heading h2');
  if(heading&&titles[code])heading.textContent=titles[code];
  for(const label of section.querySelectorAll('.kicker')){
   label.textContent=label.textContent.replace(/^V\d+(?:\.\d+)?(?:[–-]V\d+)?\s*·\s*/,'');
  }
  panels.get(category).append(section);counts.set(category,counts.get(category)+1);
 }
 let selected='overview';
 const activate=(key,focus=false)=>{
  if(!panels.has(key))return;selected=key;
  for(const [id,panel] of panels){
   panel.hidden=id!==key;
   buttons.get(id).setAttribute('aria-selected',String(id===key));buttons.get(id).tabIndex=id===key?0:-1;
  }
  if(focus)buttons.get(key).focus();
 };
 for(const [key,button] of buttons){
  const count=create('span','gw-count',String(counts.get(key)));count.setAttribute('aria-hidden','true');button.append(count);
  button.addEventListener('click',()=>activate(key));
  button.addEventListener('keydown',event=>{
   const keys=[...buttons.keys()],index=keys.indexOf(selected);
   const next=event.key==='ArrowRight'?keys[(index+1)%keys.length]:event.key==='ArrowLeft'?keys[(index+keys.length-1)%keys.length]
    :event.key==='Home'?keys[0]:event.key==='End'?keys.at(-1):null;
   if(next){event.preventDefault();activate(next,true);}
  });
 }
 const locationChanged=()=>{
  let id;try{id=decodeURIComponent(window.location.hash.slice(1));}catch{return;}
  const target=id?document.getElementById(id):null,panel=target?.closest('[data-workspace-panel]');
  if(panel){activate(panel.dataset.workspacePanel);target.scrollIntoView({block:'start'});}
 };
 const first=main.querySelector('.gold-command');
 const summary=first?.nextElementSibling;
 if(summary?.matches('.command-strip'))summary.insertAdjacentElement('afterend',root);
 else if(first)first.insertAdjacentElement('afterend',root);else main.append(root);
 // Keep the original summary visible above the categories.
 activate('overview');locationChanged();window.addEventListener('hashchange',locationChanged);
 const paintConnection=()=>{
  const state=researchConnection.snapshot();
  const text=state.state==='OPEN'?'Advanced research is recovering':state.state==='HALF_OPEN'?'Checking a research source'
   :state.state==='PAUSED'?'Research updates paused'
   :state.last_success_at!==null?'Research responses received'
   :'Awaiting research sources';
  const timing=state.state==='OPEN'&&state.retry_in_seconds?' · next check in '+state.retry_in_seconds+'s'
   :state.state==='CLOSED'&&state.last_success_at!==null?' · last '+new Date(state.last_success_at).toLocaleTimeString():'';
  if(stateLabel.textContent!==text)stateLabel.textContent=text;
  if(timingLabel.textContent!==timing)timingLabel.textContent=timing;
  status.dataset.state=state.state;
 };
 let timer=null;
 const start=()=>{if(timer!==null)return;paintConnection();timer=window.setInterval(paintConnection,1000);};
 window.addEventListener('tfa:research-transport',paintConnection);
 window.addEventListener('pagehide',()=>{window.clearInterval(timer);timer=null;});
 window.addEventListener('pageshow',start);start();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
