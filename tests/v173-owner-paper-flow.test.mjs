import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPaperQuoteSubmitter,paperQuoteMessage} from '../src/owner-paper-quote.mjs';
import {paperQuoteView} from '../src/paper-quote-view.mjs';

const source=(await readFile(new URL('../src/owner.ts',import.meta.url),'utf8')).replace(/^\s*import .*;\s*$/gm,'');
function element(id,hidden=false) {
  const classes=new Set(hidden?['hidden']:[]);
  return {id,value:'',textContent:'',disabled:id==='paperQuoteSubmit',children:[],style:{},
    classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
    appendChild(child){this.children.push(child);},replaceChildren(){this.children=[];},
    addEventListener(type,listener){this[type]=listener;},querySelectorAll(){return [];}};
}
function setup() {
  const nodes=new Map();const hidden=new Set(['paperQuoteIntake','reviewInbox','reviewIntelligence','mfa','code','verify']);
  const get=id=>{if(!nodes.has(id))nodes.set(id,element(id,hidden.has(id)));return nodes.get(id);};
  let owner=true,mfa=true,enrolled=true,token='session-1',quoteError=null;
  const requests=[];
  const fetch=async(url,options={})=>{
    requests.push({url,options});let data,status=200;
    if(url.includes('/auth/v1/token'))data={access_token:token};
    else if(url.endsWith('/member-session'))data={is_owner:owner};
    else if(url.endsWith('/owner-mfa-actions')) {
      const action=JSON.parse(options.body).action;
      data=action==='verify'?{access_token:token}:{mfa_enrolled:enrolled,aal2:mfa,factors:[{id:'factor-1'}]};
    }
    else if(url.endsWith('/owner-gold-review-actions'))data={queue:[],counts:{},review_intelligence:{}};
    else if(url.endsWith('/paper-broker-quote-intake')&&options.method==='POST'){
      status=quoteError?401:200;
      data=quoteError?{ok:false,error:quoteError}:{ok:true,mode:'PAPER_DEMO',capital_permission:'0R',execution_grade:false,broker_verified:false,live_order_submission_enabled:false,state:'PAPER_QUOTE_RECORDED',inserted:true,receipt_id:42,governance:{capital_permission:'0R',action_permitted:'WAIT',live_order_submission_enabled:false,paper_quotes_can_unlock_capital:false}};
    }
    else if(url.endsWith('/paper-broker-quote-intake'))data={ok:true,state:'NOT_CONNECTED',latest_quote:null};
    else throw new Error('Unexpected fixture request');
    return {ok:status===200,status,json:async()=>data};
  };
  const clocks=[];
  const document={getElementById:get,createElement:tag=>element(tag),hidden:false};
  const window={setInterval:callback=>{clocks.push(callback);}};
  new Function('createPaperQuoteSubmitter','paperQuoteMessage','paperQuoteView','document','window','fetch',source)(createPaperQuoteSubmitter,paperQuoteMessage,paperQuoteView,document,window,fetch);
  const signin=async()=>{get('email').value='fixture@example.invalid';get('password').value='fixture-password';await get('signin').onclick();};
  const submit=async()=>get('paperQuoteForm').submit({preventDefault(){}});
  const draft=()=>JSON.stringify({mode:'PAPER_DEMO',asset:'XAUUSD',provenance:'BROKER_DEMO_USER_SUPPLIED',source_code:'DEMO_01',provider_symbol:'XAUUSD',sequence:1,observed_at:new Date().toISOString(),bid:4000,ask:4000.2});
  return {get,requests,clocks,signin,submit,draft,set:value=>{if('owner'in value)owner=value.owner;if('mfa'in value)mfa=value.mfa;if('enrolled'in value)enrolled=value.enrolled;if('token'in value)token=value.token;if('quoteError'in value)quoteError=value.quoteError;}};
}
test('signed-out form is hidden and programmatic submit sends nothing',async()=>{
  const ctx=setup();assert.equal(ctx.get('paperQuoteIntake').classList.contains('hidden'),true);assert.equal(ctx.get('paperQuoteSubmit').disabled,true);
  await ctx.submit();assert.equal(ctx.requests.length,0);
});
test('non-owner sign-in cannot open the quote panel',async()=>{
  const ctx=setup();ctx.set({owner:false});await ctx.signin();assert.equal(ctx.get('paperQuoteIntake').classList.contains('hidden'),true);
  assert.equal(ctx.requests.some(r=>r.url.endsWith('/paper-broker-quote-intake')),false);
});
for(const status of [{enrolled:false},{mfa:false},{mfa:'true'}])test('unverified MFA cannot open quote panel '+JSON.stringify(status),async()=>{
  const ctx=setup();ctx.set(status);await ctx.signin();assert.equal(ctx.get('paperQuoteIntake').classList.contains('hidden'),true);
  assert.equal(ctx.get('paperQuoteSubmit').disabled,true);
});
test('server-confirmed owner and MFA opens without submitting a quote',async()=>{
  const ctx=setup();await ctx.signin();assert.equal(ctx.get('paperQuoteIntake').classList.contains('hidden'),false);
  assert.equal(ctx.get('paperQuoteSubmit').disabled,false);assert.equal(ctx.requests.some(r=>r.url.endsWith('/paper-broker-quote-intake')&&r.options.method==='POST'),false);
});
test('MFA verification must survive a fresh status check',async()=>{
  const ctx=setup();ctx.set({mfa:false});await ctx.signin();ctx.get('code').value='000000';await ctx.get('verify').onclick();
  assert.equal(ctx.get('paperQuoteIntake').classList.contains('hidden'),true);
  ctx.set({mfa:true});await ctx.get('verify').onclick();assert.equal(ctx.get('paperQuoteIntake').classList.contains('hidden'),false);
});
test('owner submit uses in-memory bearer and only demo source fields',async()=>{
  const ctx=setup();await ctx.signin();ctx.get('paperQuoteJson').value=ctx.draft();await ctx.submit();
  const writes=ctx.requests.filter(r=>r.url.endsWith('/paper-broker-quote-intake')&&r.options.method==='POST');assert.equal(writes.length,1);
  assert.equal(writes[0].options.headers.Authorization,'Bearer session-1');assert.equal(JSON.parse(writes[0].options.body).mode,'PAPER_DEMO');
  assert.equal(ctx.get('paperQuoteReceipt').textContent.includes('Receipt #42'),true);assert.equal(ctx.get('paperQuoteSubmit').disabled,false);
});
test('freshness timer marks an expired receipt without transmitting',async()=>{
  const ctx=setup();await ctx.signin();ctx.get('paperQuoteJson').value=ctx.draft();await ctx.submit();
  const before=ctx.requests.length;const realNow=Date.now;Date.now=()=>realNow()+11000;
  try{ctx.clocks[0]();assert.equal(ctx.get('paperQuoteReceipt').textContent.includes('quote expired'),true);assert.equal(ctx.requests.length,before);}finally{Date.now=realNow;}
});
test('expired server session locks quote controls',async()=>{
  const ctx=setup();await ctx.signin();ctx.set({quoteError:'invalid_session'});ctx.get('paperQuoteJson').value=ctx.draft();await ctx.submit();
  assert.equal(ctx.get('paperQuoteIntake').classList.contains('hidden'),true);assert.equal(ctx.get('paperQuoteSubmit').disabled,true);
});
test('a second sign-in clears the old receipt and relocks until verification',async()=>{
  const ctx=setup();await ctx.signin();ctx.get('paperQuoteJson').value=ctx.draft();await ctx.submit();ctx.set({token:'session-2',owner:false});await ctx.signin();
  assert.equal(ctx.get('paperQuoteIntake').classList.contains('hidden'),true);assert.equal(ctx.get('paperQuoteReceipt').textContent,'No receipt confirmed.');
});
