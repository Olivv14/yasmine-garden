import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {randomUUID,createECDH,randomBytes} from 'node:crypto';
import {preparePush} from './client.mjs';
import {buildPayload} from './payload.mjs';
import {notificationOptions} from './protocol.mjs';
const base='https://app.example.invalid/yasmine-garden/';
const eventId=randomUUID();const payload=buildPayload(eventId,{locale:'en',sender:'Synthetic <A>',preview:true,phrase_key:'affection.phrase01'});
test('pure payload options have stable event tag and scope-local URL',()=>{
 const n=notificationOptions({...payload,url:'https://evil.invalid/'},base);
 assert.equal(n.options.tag,'thought-'+eventId);assert.equal(n.options.data.url,base);assert.equal(n.options.renotify,false);
 assert.ok(n.options.body.includes('Synthetic <A>'));assert.equal(n.options.icon,base+'push/icons/icon-192.png');
});
test('actual classic worker push/showNotification/click uses registration scope only',async()=>{
 const handlers={},shown=[],opened=[];let focused=0,closed=0;
 const self={location:{origin:new URL(base).origin},registration:{scope:base,showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>[{url:'https://other.example.invalid/',focus:async()=>{}},{url:base+'?view=inbox',focus:async()=>focused++}],openWindow:async url=>opened.push(url)},addEventListener:(event,handler)=>handlers[event]=handler};
 vm.runInNewContext(readFileSync(new URL('./service-worker.js',import.meta.url),'utf8'),{self,URL});
 async function emit(type,data){let promise;handlers[type]({...data,waitUntil:p=>promise=p});await promise;}
 await emit('push',{data:{text:()=>JSON.stringify(payload),json:()=>({...payload,url:'https://evil.invalid/'})}});
 assert.equal(shown.length,1);assert.equal(shown[0][1].tag,'thought-'+eventId);assert.equal(shown[0][1].data.url,undefined);
 await emit('push',{data:{text:()=>'{',json:()=>{throw new Error('bad')}}});assert.equal(shown.length,1);
 await emit('push',{data:{text:()=>'',json:()=>({...payload,event_id:'x'})}});assert.equal(shown.length,1);
 await emit('notificationclick',{notification:{data:{url:'https://evil.invalid/'},close:()=>closed++}});assert.equal(focused,1);assert.equal(opened.length,0);assert.equal(closed,1);
 self.clients.matchAll=async()=>[{url:base.replace('yasmine-garden/','yasmine-garden-evil/'),focus:async()=>focused++}];
 await emit('notificationclick',{notification:{close:()=>{}}});assert.deepEqual(opened,[base]);
});
test('manifest and original PNG resources resolve under nested Pages app base',()=>{
 const manifest=JSON.parse(readFileSync(new URL('./manifest.webmanifest',import.meta.url),'utf8'));
 const url=new URL('push/manifest.webmanifest',base);
 assert.equal(new URL(manifest.start_url,url).href,base);assert.equal(new URL(manifest.scope,url).href,base);
 assert.equal(manifest.display,'standalone');
 for(const icon of manifest.icons){assert.ok(new URL(icon.src,url).href.startsWith(base+'push/icons/'));const png=readFileSync(new URL(icon.src,new URL('./manifest.webmanifest',import.meta.url)));const size=Number(icon.sizes.split('x')[0]);assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}
});
test('client preparation never prompts; opt-in requires gesture, readback, disable before logout',async()=>{
 const e=createECDH('prime256v1');e.generateKeys();const key=e.getPublicKey().toString('base64url');let prompts=0,unsubscribed=0,stored=null,enabled=false,failDisable=false;const calls=[];
 const subscription={options:{applicationServerKey:Uint8Array.from(e.getPublicKey()).buffer},toJSON:()=>({endpoint:'https://web.push.apple.com/synthetic',keys:{p256dh:key,auth:randomBytes(16).toString('base64url')}}),unsubscribe:async()=>{unsubscribed++;return true;}};
 const registration={active:{},pushManager:{getSubscription:async()=>subscription,subscribe:async()=>subscription},getNotifications:async()=>[]};
 for(const [name,value]of Object.entries({location:{origin:new URL(base).origin},isSecureContext:true,PushManager:function(){},Notification:{requestPermission:async()=>{prompts++;return 'granted';}},navigator:{userActivation:{isActive:false},serviceWorker:{register:async()=>registration}}}))Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});
 const userId=randomUUID();const supabase={auth:{getUser:async()=>({data:{user:{id:userId}},error:null})},rpc:async(name,args)=>{calls.push(name);if(name==='register_my_push')enabled=true;if(name==='disable_my_push'){if(failDisable)return{error:{}};enabled=false;}return{error:null,data:name==='list_my_push'?[{id:stored,enabled,preview:false}]:{id:stored,enabled}};}};
 const client=await preparePush({appBaseUrl:base,workerUrl:'sw.js',vapidPublicKey:key,supabase,deviceId:null,saveDeviceId:async id=>stored=id});assert.equal(prompts,0);assert.equal(calls.length,0);
 await assert.rejects(()=>client.enableFromGesture());assert.equal(prompts,0);
 navigator.userActivation.isActive=true;await client.enableFromGesture();assert.equal(prompts,1);assert.equal(enabled,true);assert.ok(stored);
 failDisable=true;await assert.rejects(()=>client.disableBeforeLogout());assert.equal(unsubscribed,0);failDisable=false;await client.disableBeforeLogout();assert.equal(unsubscribed,1);assert.equal(enabled,false);assert.equal(stored,null);
});
