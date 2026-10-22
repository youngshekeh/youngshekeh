import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {withholdResearchPanel} from '../src/research-panel-state.mjs';
import {buildGoldCommandSnapshot} from '../src/gold-command-v194.mjs';
import handler from '../api/gold-command-v194.js';
const source=readFileSync(new URL('../src/public-surfaces.ts',import.meta.url),'utf8');
class Node{
 constructor(id='',tagName='STRONG'){this.id=id;this.tagName=tagName;this.textContent='OLD VERIFIED VALUE';this.children=[];}
 append(...children){this.children.push(...children);}appendChild(child){this.children.push(child);}
 replaceChildren(...children){this.children=children;}
}
for(const [name,prefix,grid] of [
 ['renderV187SignalMap','v187','v187-zone-grid'],['renderV188Lifecycle','v188','v188-session-grid'],
 ['renderV189TriggerWatch','v189','v189-trigger-grid'],['renderV192AlertRouter','v192','v192-alert-grid'],
 ['renderV191EventLedger','v191','v191-event-grid'],['renderV194GoldCommand','v194','v194-component-grid'],
 ['renderV195BridgeReadiness','v195',null],['renderV196FeedQuality','v196',null],
 ['renderV197LiveAnchorGuard','v197',null],['renderV198SessionIntelligence','v198',null],
 ['renderV199RelayObservability','v199',null],['renderV202RelayLedger','v202','v202-event-grid'],
 ['renderV204ActivationOrchestrator','v204','v204-gate-grid']]){
 test(`${prefix}: the real renderer clears old success and never invents zero counts or no blockers after source failure`,()=>{
  const fields=['state','chain','count','failures','blockers','alerts','ledger','certified','review','ready','score','permission','detail','blocker-copy'];
  const nodes=new Map(fields.map(field=>[prefix+'-'+field,new Node(prefix+'-'+field)]));
  if(grid){const node=new Node(grid,'DIV');node.textContent='';node.append(new Node('old-event'));nodes.set(grid,node);}
  const document={querySelectorAll:()=>[...nodes.values()],createElement:tag=>new Node('',tag.toUpperCase())};
  const set=(id,value)=>{if(nodes.has(id))nodes.get(id).textContent=value==null?'WITHHELD':String(value);};
  const begin=source.indexOf('function '+name+'('),end=source.indexOf('\nasync function poll',begin);
  const render=new Function('withholdResearchPanel','document','set','byId',stripTypeScriptTypes(source.slice(begin,end))+'\nreturn '+name+';')(
   withholdResearchPanel,document,set,id=>nodes.get(id));
  render({ok:false,state:'UNAVAILABLE'});
  assert.equal(nodes.get(prefix+'-state').textContent,'UNAVAILABLE');
  assert.equal(nodes.get(prefix+'-count').textContent,'WITHHELD');
  assert.equal(nodes.get(prefix+'-blockers').textContent,'UNKNOWN');
  assert.equal(nodes.get(prefix+'-permission').textContent,'WAIT · 0R');
  assert.doesNotMatch([...nodes.values()].map(x=>x.textContent).join(' '),/OLD VERIFIED VALUE|both pass|requirements are satisfied/);
  if(grid){assert.equal(nodes.get(grid).children.length,1);assert.equal(nodes.get(grid).children[0].children[0].textContent,'EVIDENCE UNAVAILABLE');}
 });
}
test('missing command ledger and router observations stay null rather than zero',()=>{
 const result=buildGoldCommandSnapshot();
 assert.equal(result.evidence.event_count,null);assert.equal(result.evidence.visible_alerts,null);
 assert.equal(result.evidence.notification_ready,null);assert.equal(result.ok,false);
 for(const mid of [null,'',false,0,-1]){
  const out=buildGoldCommandSnapshot({live:{ok:true,state:'BROKER_LIVE',quality:{fresh:true},quote:{mid}}});
  assert.equal(out.command.live_price,null);
 }
});
test('an HTTP error with a success-shaped command dependency cannot qualify as a healthy command snapshot',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:false,status:503,json:async()=>({ok:true,state:'BROKER_LIVE',quality:{fresh:true},quote:{mid:4060}})});
 try{
  const res={setHeader(){},status(n){this.statusCode=n;return this;},json(body){this.body=body;}};
  await handler({method:'GET'},res);assert.equal(res.statusCode,503);assert.equal(res.body.ok,false);
  assert.equal(res.body.command.live_price,null);assert.equal(res.body.governance.capital_permission,'0R');
 }finally{globalThis.fetch=previous;}
});
