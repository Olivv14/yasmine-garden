import {appURL,decodeKey,UUID} from '../push/protocol.mjs';
export function nativeConfig(value,base){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join(',')!=='appBaseUrl,vapidPublicKey,workerUrl')throw Error('config');
 const url=appURL(value.appBaseUrl),actual=new URL('./',base);
 if(url.href!==actual.href||value.workerUrl!==new URL('sw.js',url).href)throw Error('config');
 decodeKey(value.vapidPublicKey,65);return Object.freeze({...value});
}
// A synchronous lease is acquired BEFORE invoking gesture-sensitive work.
export class NativeTransition{
 constructor(){this.generation=0;this.abort=new AbortController();this.tasks=new Set();this.frozen=false;this.transition=null;}
 context(userId){const generation=this.generation,signal=this.abort.signal;return {userId,authGeneration:generation,signal,assertCurrent:()=>{if(signal.aborted||this.generation!==generation)throw Error('stale');}};}
 begin(){if(this.frozen)throw Error('transition');let done;const task=new Promise(r=>done=r);this.tasks.add(task);return ()=>{this.tasks.delete(task);done();};}
 track(fn){const end=this.begin();try{return Promise.resolve(fn()).finally(end);}catch(e){end();throw e;}}
 async drain(){while(this.tasks.size)await Promise.allSettled([...this.tasks]);}
 invalidate(){this.generation++;this.abort.abort();this.abort=new AbortController();this.transition=null;}
 logout(cleanup,signout){if(this.transition)return this.transition;const c=this.context(null);this.frozen=true;const task=(async()=>{await this.drain();c.assertCurrent();await cleanup(c);c.assertCurrent();await signout(c);})().finally(()=>{if(this.transition===task)this.transition=null;});this.transition=task;return task;}
 reset(){this.frozen=false;}
}
export class NativeStore{
 constructor(base,storage){this.base=new URL('./',base).href;this.adapter=storage;}
 // Storage access is lazy: a native-only storage denial must not break core login.
 get storage(){return this.adapter??globalThis.localStorage;}
 key(owner,kind){if(!UUID.test(owner))throw Error('owner');return 'connection-native:'+this.base+':'+owner+':'+kind;}
 device(owner){const raw=this.storage.getItem(this.key(owner,'device'));if(raw!==null&&!UUID.test(raw))throw Error('storage');return raw;}
 binding(){const raw=this.storage.getItem('connection-native:'+this.base+':binding');if(raw===null)return null;const b=JSON.parse(raw);if(!UUID.test(b?.owner)||!UUID.test(b?.id)||Object.keys(b).sort().join(',')!=='id,owner')throw Error('storage');return b;}
 async saveDeviceId(id,context){if(id!==null&&!UUID.test(id))throw Error('device');const key=this.key(context.userId,'device'),bindingKey='connection-native:'+this.base+':binding',b=this.binding();if(b&&(b.owner!==context.userId||(id&&b.id!==id)))throw Error('unknown');context.assertCurrent();if(context.signal.aborted)throw Error('stale');if(id===null){this.storage.removeItem(bindingKey);context.assertCurrent();this.storage.removeItem(key);}else{this.storage.setItem(key,id);context.assertCurrent();this.storage.setItem(bindingKey,JSON.stringify({owner:context.userId,id}));}}
 events(owner){const raw=this.storage.getItem(this.key(owner,'events'));if(raw===null)return [];const rows=JSON.parse(raw);if(!Array.isArray(rows)||rows.length>32||rows.some(x=>!x||x.owner!==owner||!UUID.test(x.id)||typeof x.stored!=='boolean'||Object.keys(x).some(k=>!['owner','id','stored','push'].includes(k))))throw Error('storage');for(const x of rows)if(x.push){if(!x.stored)throw Error('storage');pushReceipt({event_persisted:true,receipt:{id:x.id},device_displayed:'unknown',push:x.push},x.id);}return rows;}
 putEvent(owner,id,{stored=false,push}={},context){if(!UUID.test(id))throw Error('event');let rows=this.events(owner),row=rows.find(x=>x.id===id);if(!row){rows=rows.filter(x=>!x.push||x.push.retriable>0);if(rows.length>=32)throw Error('queueFull');row={owner,id,stored:false};rows.push(row);}row.stored ||= stored;if(push)row.push=push;context?.assertCurrent();this.storage.setItem(this.key(owner,'events'),JSON.stringify(rows));return row;}
}
export function pushReceipt(data,id){
 if(data?.event_persisted!==true||data?.receipt?.id!==id||data?.device_displayed!=='unknown')throw Error('receipt');
 const p=data.push;if(!p||Object.keys(p).sort().join(',')!=='provider_accepted,retriable,targets,terminal'||Object.values(p).some(x=>!Number.isSafeInteger(x)||x<0)||p.provider_accepted+p.retriable+p.terminal!==p.targets)throw Error('receipt');
 return {...p};
}
export function pushRecords(rows){if(!Array.isArray(rows)||rows.some(r=>!UUID.test(r?.id)||typeof r.enabled!=='boolean'||typeof r.preview!=='boolean'||typeof r.created_at!=='string'||Object.keys(r).sort().join(',')!=='created_at,enabled,id,preview'))throw Error('readback');return rows;}
