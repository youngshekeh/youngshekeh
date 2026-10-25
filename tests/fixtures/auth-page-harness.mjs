// Execute the real browser entrypoints against an isolated DOM and fake HTTP.
// No credentials, accounts, live network, or real browser storage are used.
import {readFileSync} from 'node:fs';
import * as lifecycle from '../../src/auth-session-lifecycle.mjs';
import {assessMemberSession} from '../../src/member-session-proof.mjs';
import * as paper from '../../src/owner-paper-quote.mjs';
import * as view from '../../src/paper-quote-view.mjs';
import * as sandbox from '../../src/owner-sandbox-receipt.mjs';
import * as bridge from '../../src/owner-bridge-control.mjs';
import * as live from '../../src/owner-live-market-control.mjs';

export const fakeToken = suffix => 'synthetic_only_not_a_real_access_token_' + suffix;
export const ownerProof = Object.freeze({ok:true, version:'member-session-v12-strict-paid-term',
  user:{id:'00000000-0000-0000-0000-000000000012'}, is_owner:true, access_state:'owner'});
export const freeProof = Object.freeze({...ownerProof, is_owner:false, access_state:'limited'});
export const mfaProof = Object.freeze({ok:true, owner:true, mfa_enrolled:true,
  aal:'aal1', aal2:false, factors:[{id:'synthetic-factor'}]});
export const reply = (data, status=200) => ({ok:status>=200&&status<300,status,json:async()=>data});
export function deferred() {
  let resolve;
  const promise = new Promise(r => {resolve=r});
  return {promise, resolve};
}
export function authPage(kind, transport) {
  const html=readFileSync(new URL(`../../${kind}/index.html`,import.meta.url),'utf8');
  const source=readFileSync(new URL(`../../src/${kind}.ts`,import.meta.url),'utf8')
    .replace(/^\s*import .*;\s*$/gm,'');
  const nodes=new Map(),events=new Map(),storage=new Map(),requests=[];
  for(const match of html.matchAll(/<[a-z][^>]*\bid="([^"]+)"[^>]*>/gi)) {
    const tag=match[0],id=match[1],classes=new Set((tag.match(/class="([^"]*)"/)?.[1]||'').split(/\s+/));
    const attributes=new Map();
    nodes.set(id,{id,value:'',textContent:'',disabled:/\sdisabled(?:\s|>|=)/.test(tag),
      style:{},children:[],className:'',
      classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
      setAttribute:(k,v)=>attributes.set(k,v),removeAttribute:k=>attributes.delete(k),
      getAttribute:k=>attributes.get(k)??null,
      replaceChildren(){this.children=[]},appendChild(child){this.children.push(child)},
      querySelectorAll(){return []},addEventListener(type,fn){this[type]=fn}});
  }
  const get=id=>{
    if(!nodes.has(id))throw new Error('Unknown DOM fixture '+id);
    return nodes.get(id);
  };
  const document={getElementById:get,hidden:false,createElement:()=>({style:{},appendChild(){}})};
  const window={setInterval(){},addEventListener:(event,fn)=>events.set(event,fn)};
  const sessionStorage={setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)??null,
    removeItem:k=>storage.delete(k)};
  const fetch=async(url,options)=>{
    requests.push({url,options});
    return transport(url,options,requests);
  };
  const imports={...lifecycle,assessMemberSession,...paper,...view,...sandbox,...bridge,...live};
  new Function(...Object.keys(imports),'document','window','sessionStorage','fetch',
    // requestAuthJson uses its injected transport, not the host global fetch.
    source)(...Object.values({...imports,requestAuthJson:(url,options,settings)=>
      lifecycle.requestAuthJson(url,options,{...settings,fetchImpl:fetch})}),
      document,window,sessionStorage,fetch);
  return {get,requests,storage,events,signin(){
    get('email').value='fixture@example.invalid';get('password').value='fake-only-password';
    return get('signin').onclick();
  },clear:()=>get('signout').onclick()};
}
