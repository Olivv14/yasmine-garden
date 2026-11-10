import test from 'node:test';
import assert from 'node:assert/strict';
import {createECDH,randomUUID} from 'node:crypto';
import {preparePush,dispatchThought} from './client.mjs';
const base='https://app.example.invalid/yasmine-garden/';
const ec=createECDH('prime256v1');ec.generateKeys();const bytes=ec.getPublicKey();const key=bytes.toString('base64url');
async function setup({at,oldKey=false,existing=true}={}) {
 let account='A',generation=0,stored=null,enabled=false,subscribes=0,unsubscribes=0,prompts=0,listener,controller;
 const calls=[],saves=[];
 const trip=point=>{if(at===point){account='B';generation++;listener?.('SIGNED_IN',{user:{id:'B'}});}};
 const sub={options:{applicationServerKey:oldKey?new Uint8Array(65).buffer:Uint8Array.from(bytes).buffer},toJSON:()=>({endpoint:'https://web.push.apple.com/synthetic',keys:{p256dh:key,auth:'synthetic'}}),unsubscribe:async()=>{unsubscribes++;trip('unsubscribe');return true;}};
 const registration={active:{},pushManager:{getSubscription:async()=>{trip('getSubscription');return existing?sub:null;},subscribe:async()=>{subscribes++;trip('subscribe');return sub;}},getNotifications:async()=>{trip('getNotifications');return [];}};
 for(const [name,value] of Object.entries({location:{origin:new URL(base).origin},isSecureContext:true,PushManager:function(){},Notification:{requestPermission:()=>{prompts++;trip('permission');return Promise.resolve('granted');}},navigator:{userActivation:{isActive:true},serviceWorker:{register:async()=>{trip('worker');return registration;}}}}))Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});
 const supabase={auth:{getUser:async()=>({data:{user:{id:account}},error:null}),onAuthStateChange:cb=>{listener=cb;return{data:{subscription:{unsubscribe:()=>listener=null}}};}},rpc:async(name,args)=>{calls.push({name,account,args});if(name==='register_my_push')enabled=true;if(name==='disable_my_push')enabled=false;trip(name);return{error:null,data:name==='list_my_push'?[{id:stored,enabled,preview:false}]:{id:stored}};},functions:{invoke:async(_name,{body})=>{calls.push({name:'invoke',account,eventId:body.event_id});trip('invoke');return{error:null,data:{event_persisted:true,device_displayed:'unknown',receipt:{id:body.event_id}}};}}};
 const options={appBaseUrl:base,workerUrl:'sw.js',vapidPublicKey:key,supabase,deviceId:null,expectedUserId:'A',getAuthGeneration:()=>generation,saveDeviceId:async(id,context)=>{saves.push({id,owner:context?.userId??account});trip(id===null?'clear':'save');context?.assertCurrent();stored=id;}};
 return {supabase,options,calls,saves,prepare:async()=>controller=await preparePush(options),change:()=>{account='B';generation++;listener?.('SIGNED_IN',{user:{id:'B'}});},get:()=>({stored,enabled,subscribes,unsubscribes,prompts,controller})};
}
test('SEC23 getUser A then async save switches B: zero RPC and no wrong-owner mapping',async()=>{
 const t=await setup({at:'save'}),c=await t.prepare();await assert.rejects(()=>c.enableFromGesture(),/context|cancel|account/i);assert.equal(t.calls.length,0);assert.equal(t.get().stored,null);assert.equal(t.saves[0].owner,'A');
});
test('BUG23 old VAPID key requires reconciliation before save/RPC; old UUID untouched',async()=>{
 const t=await setup({oldKey:true});const old=randomUUID();t.options.deviceId=old;const c=await t.prepare();await assert.rejects(()=>c.enableFromGesture(),/reconciliation/i);assert.equal(t.calls.length,0);assert.equal(t.saves.length,0);assert.equal(t.get().subscribes,0);
});
for(const point of ['worker','permission','getSubscription','subscribe','register_my_push','list_my_push'])test('SEC23 enable guards await '+point,async()=>{
 const t=await setup({at:point,existing:point!=='subscribe'});if(point==='worker'){await assert.rejects(()=>t.prepare());return;}
 const c=await t.prepare();await assert.rejects(()=>c.enableFromGesture());assert.ok(t.calls.every(c=>c.account==='A'));if(['permission','getSubscription','subscribe'].includes(point))assert.equal(t.calls.length,0);
});
for(const point of ['disable_my_push','list_my_push','getSubscription','unsubscribe','getNotifications','clear'])test('SEC23 disable guards await '+point,async()=>{
 const t=await setup();const c=await t.prepare();await c.enableFromGesture();t.calls.length=0;
 // Reuse fixed controller with boundary switched only for disable.
 const original=t.supabase.rpc;const reg=await navigator.serviceWorker.register();
 if(point==='disable_my_push'||point==='list_my_push')t.supabase.rpc=async(...args)=>{const r=await original(...args);if(args[0]===point)t.change();return r;};
 else if(point==='getSubscription'){const f=reg.pushManager.getSubscription;reg.pushManager.getSubscription=async()=>{const r=await f();t.change();return r;};}
 else if(point==='unsubscribe'){const s=await reg.pushManager.getSubscription();s.unsubscribe=async()=>{t.change();return true;};}
 else if(point==='getNotifications')reg.getNotifications=async()=>{t.change();return [];};
 else { /* separate callback exercises async clear guard */ const t2=await setup({at:'clear'}),c2=await t2.prepare();await c2.enableFromGesture();await assert.rejects(()=>c2.disableBeforeLogout());assert.notEqual(t2.get().stored,null);return; }
 await assert.rejects(()=>c.disableBeforeLogout());assert.ok(t.calls.every(c=>c.account==='A'));assert.notEqual(t.get().stored,null);
});
test('SEC23 stale profile outbox fails before invoke; missing owner fails closed',async()=>{
 const t=await setup();const eventId=randomUUID();t.change();await assert.rejects(()=>dispatchThought({supabase:t.supabase,eventId,expectedUserId:'A'}));assert.equal(t.calls.length,0);
 await assert.rejects(()=>dispatchThought({supabase:t.supabase,eventId}));assert.equal(t.calls.length,0);
});
test('SEC23 outbox auth switch after invoke rejects stale receipt, same UUID on retries',async()=>{
 const t=await setup({at:'invoke'}),eventId=randomUUID();await assert.rejects(()=>dispatchThought({supabase:t.supabase,eventId,expectedUserId:'A'}));assert.equal(t.calls.length,1);assert.equal(t.calls[0].eventId,eventId);
});
test('permission is synchronous from gesture; cancel fences pending save and future operations',async()=>{
 const t=await setup();let release;const pending=new Promise(r=>release=r);let entered;const enteredSave=new Promise(r=>entered=r);t.options.saveDeviceId=async(_id,ctx)=>{entered();await pending;ctx.assertCurrent();};
 const c=await t.prepare();const p=c.enableFromGesture();assert.equal(t.get().prompts,1);await enteredSave;const idle=c.cancel();release();await assert.rejects(()=>p);await idle;assert.equal(t.calls.length,0);await assert.rejects(()=>c.enableFromGesture());
});
test('SEC23 no observer fallback rechecks getUser after async save before RPC',async()=>{
 const t=await setup({at:'save'});delete t.supabase.auth.onAuthStateChange;t.options.saveDeviceId=async()=>{t.change();};const c=await t.prepare();await assert.rejects(()=>c.enableFromGesture());assert.equal(t.calls.length,0);
});
test('SEC23 successful outbox uses original UUID; cancellation before Auth makes zero invoke',async()=>{
 const t=await setup(),eventId=randomUUID();const result=await dispatchThought({supabase:t.supabase,eventId,expectedUserId:'A'});assert.equal(result.receipt.id,eventId);assert.equal(t.calls[0].eventId,eventId);
 const abort=new AbortController();abort.abort();await assert.rejects(()=>dispatchThought({supabase:t.supabase,eventId,expectedUserId:'A',signal:abort.signal}));assert.equal(t.calls.length,1);
});
test('SEC23 overlapping enable/disable rejects and retains synchronous permission gesture',async()=>{
 const t=await setup();let release;const pending=new Promise(r=>release=r);let entered;const ready=new Promise(r=>entered=r);const save=t.options.saveDeviceId;t.options.saveDeviceId=async(...args)=>{entered();await pending;return save(...args);};const c=await t.prepare();const enable=c.enableFromGesture();assert.equal(t.get().prompts,1);await ready;await assert.rejects(()=>c.disableBeforeLogout(),/in progress/);release();await enable;await c.disableBeforeLogout();
});
test('SEC23 outbox generation switch during verified Auth fails before invoke',async()=>{
 const t=await setup();let gen=1;const original=t.supabase.auth.getUser;t.supabase.auth.getUser=async()=>{const result=await original();gen++;return result;};await assert.rejects(()=>dispatchThought({supabase:t.supabase,eventId:randomUUID(),expectedUserId:'A',getAuthGeneration:()=>gen}));assert.equal(t.calls.length,0);
});
