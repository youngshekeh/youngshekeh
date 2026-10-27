import './gold-commissioning-v328.css';

const URL='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-bridge-readiness-v195';
const RUNBOOK='https://github.com/youngshekeh/youngshekeh/blob/security/v327-broker-symbol-provenance/docs/release/V326-FIRST-BROKER-TICK-COMMISSIONING-CHECKPOINT.md';
const VERIFIED_VERSION='v326-gold-bridge-first-tick-truth-review';
const PROOF='PERSISTED_TICK_NOT_CREDENTIAL_USE';
const MAX_AGE_MS=5_000;

function bool(v){return v===true;}
function parseTime(v){
 if(typeof v!=='string'||!v.trim())return null;
 const n=Date.parse(v);
 return Number.isFinite(n)?n:null;
}

/**
 * Converts public backend commissioning evidence into a strictly non-executable
 * UI model. Never accepts old v195 "used credential => received tick" logic.
 * This does not prove provider market-data licensing, nor orders can be sent.
 */
export function brokerCommissioningModel(data,nowMs=Date.now()){
 const validNow=Number.isFinite(nowMs)?nowMs:Date.now();
 const contract=data?.ok===true&&data?.version===VERIFIED_VERSION&&
   data?.gates?.first_tick_received?.proof===PROOF&&
   data?.governance?.automatic_execution===false&&
   data?.governance?.capital_permission==='0R'&&
   data?.governance?.machine_execution_allowed===false&&
   data?.governance?.live_order_submission_enabled===false;
 const legacy=data?.ok===true&&!contract;
 const enrolled=bool(data?.gates?.bridge_enrolled?.pass);
 const auth=contract&&bool(data?.gates?.bridge_authenticated?.pass);
 const tick=contract&&bool(data?.gates?.first_tick_received?.pass);
 const observed=tick?parseTime(data?.gates?.first_tick_received?.observed_at):null;
 const ageMs=observed===null?null:validNow-observed;
 const clockValid=ageMs!==null&&ageMs>=-2_000;
 const fresh=contract&&enrolled&&auth&&tick&&clockValid&&
   ageMs<MAX_AGE_MS&&bool(data?.gates?.quote_fresh?.pass)&&
   bool(data?.gates?.broker_live?.pass)&&
   data?.state==='BROKER_LIVE';
 const stages=[
   {key:'enrollment',title:'Bridge provisioned',
     detail:'Read-only data credentials enrolled by the owner.',
     status:enrolled?'done':'waiting'},
   {key:'authentication',title:'Relay authenticated',
     detail:'A Windows MT5 relay has presented its private bridge credential.',
     status:!contract?'unverified':auth?'done':'waiting'},
   {key:'firstTick',title:'First tick accepted',
     detail:'A broker quote is actually persisted, not merely authenticated.',
     status:!contract?'unverified':tick?'done':'waiting'},
   {key:'live',title:'Sustained freshness',
     detail:'The latest persisted observation is recent; execution stays OFF.',
     status:!contract?'unverified':fresh?'done':'waiting'}
 ];
 let status='DATA_NOT_VERIFIED',title='Evidence unavailable';
 let description='We cannot certify a broker connection from this response.';
 let next='Inspect the read-only receiver and commissioning runbook.';
 if(legacy){
   status='LEGACY_CONTRACT_HOLD';
   title='Waiting for verified receiver evidence';
   description='The existing status endpoint does not distinguish credential authentication from a persisted tick.';
   next='Complete the reviewed V326/V327 status release before certifying this connection.';
 }else if(contract&&!enrolled){
   status='BRIDGE_NOT_ENROLLED';
   title='Read-only bridge needed';
   description='No active read-only broker bridge is reported.';
   next='An MFA-verified owner must enroll a read-only bridge.';
 }else if(contract&&!auth){
   status='RELAY_NOT_AUTHENTICATED';
   title='Windows relay not connected';
   description='The read-only bridge exists, but the receiver has no verified credential activity.';
   next='Run the read-only relay on the authorized Windows MT5 terminal.';
 }else if(contract&&!tick){
   status='WAITING_FIRST_TICK';
   title='Waiting for a recorded broker tick';
   description='Credential authentication is not proof that the backend accepted a market quote.';
   next='Check symbol suffix, UTC clock, tick freshness and the receiver acknowledgement.';
 }else if(contract&&!fresh){
   status='TICK_NOT_FRESH';
   title='Broker observation needs refreshing';
   description='A first tick was recorded, but there is no fresh broker observation.';
   next='Restore a stable read-only MT5 feed and verify recent persisted timestamps.';
 }else if(fresh){
   status='READ_ONLY_FEED_OBSERVED';
   title='Read-only broker feed observed';
   description='A fresh tick is recorded. Commercial display rights and trading remain unverified.';
   next='Review sustained streaming, market-data licensing and separate launch approval.';
 }
 const lastSeen=tick&&observed!==null&&clockValid?
   new Date(observed).toISOString():null;
 return Object.freeze({
   version:'v328-broker-commissioning-ui',
   status,title,description,next,
   proof:contract?'PERSISTED_TICK_CONTRACT':'NO_VERIFIABLE_TICK_CONTRACT',
   stages:Object.freeze(stages.map(x=>Object.freeze(x))),
   lastObservedAt:lastSeen,
   quoteAgeSeconds:ageMs!==null&&clockValid?
     Math.max(0,Math.round(ageMs/1000)):null,
   brokerPriceVisible:false,accountIdentityVisible:false,
   providerLicenseVerified:false,
   machineExecutionAllowed:false,commercialActivationAllowed:false,
   action:'WAIT',capitalPermission:'0R'
 });
}

function el(tag,className,text){
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(text!==undefined)node.textContent=text;
 return node;
}

/** Mounts in the existing Gold Workspace Broker Data tab; no user secrets. */
export function mountBrokerCommissioning(target,{
 fetchImpl=globalThis.fetch,clock=()=>Date.now(),endpoint=URL
}={}){
 if(!target||typeof target.append!=='function')return null;
 const container=el('section','bc-shell');
 container.id='v328-broker-commissioning';
 container.setAttribute('aria-label','Read-only XAUUSD connection commissioning');
 const head=el('div','bc-head');
 const brand=el('div','bc-overline','THE FATHER  /  DATA INFRASTRUCTURE');
 const title=el('h3','bc-title','XAUUSD Connection Desk');
 const caption=el('p','bc-caption','Credential, quote and market permission are separate gates. This desk never submits trades.');
 const lead=el('div','bc-lead');lead.append(brand,title,caption);
 const status=el('span','bc-badge','VERIFYING');
 status.setAttribute('role','status');
 status.setAttribute('aria-live','polite');
 head.append(lead,status);
 const summary=el('div','bc-summary');
 const stateTitle=el('h4','bc-state','Checking broker evidence');
 const stateCopy=el('p','bc-detail','Requesting read-only receiver status.');
 const stamp=el('div','bc-stamp','Last verified quote: not established');
 summary.append(stateTitle,stateCopy,stamp);
 const steps=el('ol','bc-steps');
 const rowNodes=[];
 for(const [i,label,details] of [
  ['01','Bridge provisioned','Read-only enrollment'],
  ['02','Relay authenticated','Receiver credential event'],
  ['03','First tick accepted','Persisted quote evidence'],
  ['04','Sustained freshness','Recent observed timestamp']
 ]){
   const item=el('li','bc-step');
   const mark=el('span','bc-step-number',i);
   const labelBox=el('div','bc-step-text');
   labelBox.append(el('strong','',label),el('small','',details));
   const outcome=el('span','bc-step-status','UNKNOWN');
   item.append(mark,labelBox,outcome);
   steps.append(item);
   rowNodes.push({item,outcome});
 }
 const locked=el('div','bc-locked');
 locked.append(el('strong','bc-locked-title','EXECUTION LOCKED  ·  WAIT / 0R'),
   el('span','','No broker quote on this page grants trading permission or paid redistribution rights.'));
 const actions=el('div','bc-actions');
 const refresh=el('button','bc-refresh','Refresh evidence');
 refresh.type='button';
 const link=el('a','bc-runbook','Windows MT5 setup guide');
 link.href=RUNBOOK;link.target='_blank';link.rel='noopener noreferrer';
 const foot=el('p','bc-next','Evidence required before this feed is considered live.');
 actions.append(refresh,link);
 container.append(head,summary,steps,locked,actions,foot);
 target.prepend(container);
 let disposed=false;
 let inFlight=false;
 const apply=(model)=>{
   status.textContent=model.status==='READ_ONLY_FEED_OBSERVED'?'RESEARCH-ONLY DATA':'NOT TRADE-READY';
   status.dataset.state=model.status==='READ_ONLY_FEED_OBSERVED'?'observed':'hold';
   stateTitle.textContent=model.title;
   stateCopy.textContent=model.description;
   stamp.textContent=model.lastObservedAt?
     'Last accepted quote: '+new Date(model.lastObservedAt).toLocaleTimeString()+
      (model.quoteAgeSeconds!==null?' · '+model.quoteAgeSeconds+'s old':''):
     'Last accepted quote: not independently verified';
   model.stages.forEach((s,i)=>{
     const row=rowNodes[i];
     row.item.dataset.state=s.status;
     row.outcome.textContent=s.status==='done'?'VERIFIED':s.status==='waiting'?'PENDING':'NOT VERIFIED';
   });
   foot.textContent='NEXT  /  '+model.next;
 };
 apply(brokerCommissioningModel(null,clock()));
 const refreshEvidence=async()=>{
   if(disposed||inFlight)return;
   inFlight=true;refresh.disabled=true;
   try{
     // Do not request private broker intake GET. Its currently deployed v1
     // response can contain unlicensed prices, bridge IDs and owner details.
     const response=await fetchImpl(endpoint,{
       method:'GET',cache:'no-store',
       headers:{Accept:'application/json'},
       signal:AbortSignal.timeout(5500)
     });
     if(!response.ok)throw new Error('evidence_unavailable');
     const json=await response.json();
     if(disposed)return;
     apply(brokerCommissioningModel(json,clock()));
   }catch{
     if(!disposed)apply(brokerCommissioningModel(null,clock()));
   }finally{
     inFlight=false;if(!disposed)refresh.disabled=false;
   }
 };
 refresh.addEventListener('click',refreshEvidence);
 void refreshEvidence();
 return {element:container,refresh:refreshEvidence,
   dispose(){disposed=true;container.remove();}
 };
}
