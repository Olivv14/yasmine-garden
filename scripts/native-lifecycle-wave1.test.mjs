import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeTransition} from '../src/native-state.js';
import {createNativeUI} from '../src/native-ui.js';
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
for(const stage of ['drain','cleanup'])test('wave1 obsolete logout is rejected at '+stage+' and A→B→A cannot revive it',async()=>{
 const gate=new NativeTransition(),held=deferred(),started=deferred(),effects=[];
 const end=stage==='drain'?gate.begin():null;
 const task=gate.logout(async()=>{effects.push('cleanup:A');started.resolve();if(stage==='cleanup')await held.promise;},async()=>effects.push('signout:A'));
 const rejected=assert.rejects(task,/stale/);
 if(stage==='cleanup')await started.promise;
 gate.invalidate();gate.reset();gate.invalidate();gate.reset();end?.();held.resolve();await rejected;
 assert.deepEqual(effects,stage==='cleanup'?['cleanup:A']:[]);
});
test('wave1 stale finally cannot release a newer logout transition',async()=>{
 const gate=new NativeTransition(),first=deferred(),second=deferred(),started=deferred();
 const old=gate.logout(async()=>{started.resolve();await first.promise;},async()=>{});const rejected=assert.rejects(old,/stale/);await started.promise;
 gate.invalidate();gate.reset();const next=gate.logout(async()=>second.promise,async()=>{});
 first.resolve();await rejected;assert.equal(gate.transition,next);second.resolve();await next;assert.equal(gate.transition,null);
});
test('wave1 refresh cancels frozen logout but current generation can explicitly retry after drain',async()=>{
 const gate=new NativeTransition(),end=gate.begin();let signed=0;
 const old=gate.logout(async()=>{},async()=>signed++);const rejected=assert.rejects(old,/stale/);gate.invalidate();
 assert.equal(gate.frozen,true);assert.throws(()=>gate.begin(),/transition/);end();await rejected;
 await gate.logout(async()=>{},async()=>signed++);assert.equal(signed,1);
});
// Minimal DOM only for outer UI ownership/storage logic; built SDK coverage lives
// in the independent acceptance. No claims of browser rendering from this seam.
class Node {
 constructor(tag='div'){this.tag=tag;this.children=[];this.hidden=false;this.disabled=false;this.isConnected=true;this.listeners={};}
 setAttribute(){} append(...nodes){this.children.push(...nodes);} after(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=nodes;}
 addEventListener(name,fn){this.listeners[name]=fn;} scrollIntoView(){} focus(){}
}
function fixture({denied=false,registration=undefined,configStatus=404}={}){
 let owner=A,fetches=[];const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
 const el=(tag,text)=>{const n=new Node(tag);if(text!==undefined)n.textContent=typeof text==='function'?text():text;return n;};
 const button=(text,fn)=>{const n=el('button',text);n.onclick=fn;return n;};
 globalThis.document={baseURI:'https://example.test/garden/'};globalThis.isSecureContext=true;globalThis.PushManager=class{};globalThis.Notification={permission:'default'};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'test',serviceWorker:{getRegistration:async()=>registration}}});
 globalThis.localStorage={getItem(){if(denied)throw new DOMException('native only','SecurityError');return null;}};
 globalThis.fetch=async url=>{fetches.push(String(url));return {ok:false,status:configStatus};};
 const ui=createNativeUI({$,el,button,client:{},getOwner:()=>owner,getPreferences:()=>({locale:'en'})});ui.receive(A);
 const all=()=>{const result=[];const walk=n=>{result.push(n);for(const c of n.children)if(typeof c==='object')walk(c);};for(const n of nodes.values())walk(n);return result;};
 const find=id=>all().find(n=>n.id===id);
 return {ui,find,fetches,forceB(){owner=B;ui.invalidate();ui.receive(B);}};
}
test('wave1 native-only SecurityError with positively absent worker/config allows core logout',async()=>{
 const f=fixture({denied:true});let signed=0;await f.ui.logout(async()=>signed++,async()=>{});assert.equal(signed,1);assert.equal(f.fetches.length,1);
});
for(const state of ['registration','configured','network'])test('wave1 native-only denial remains blocked for '+state+' uncertainty',async()=>{
 const f=fixture({denied:true,registration:state==='registration'?{}:undefined,configStatus:state==='configured'?200:503});let signed=0;
 await assert.rejects(f.ui.logout(async()=>signed++,async()=>{}),{name:'SecurityError'});assert.equal(signed,0);assert.equal(f.ui.gate.frozen,true);assert.equal(f.find('nativeRecovery').hidden,false);
});
test('wave1 late original cleanup failure cannot paint recovery under B',async()=>{
 const f=fixture(),held=deferred(),started=deferred();const old=f.ui.logout(async()=>assert.fail('stale signout'),async()=>{started.resolve();await held.promise;throw Error('old A failure');});
 const rejected=assert.rejects(old,/old A failure/);await started.promise;f.forceB();const before=f.find('nativeStatus').textContent;held.resolve();await rejected;
 assert.equal(f.find('nativeStatus').textContent,before);assert.equal(f.find('nativeRecovery').hidden,true);assert.equal(f.ui.gate.frozen,false);
});
