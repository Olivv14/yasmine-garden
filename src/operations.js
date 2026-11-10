// Only operation UUIDs, never content, credentials or identity aliases.
export class OperationIds{
 constructor(userId,storage=globalThis.sessionStorage){if(!userId)throw Error('Real Auth identity required');this.prefix='connection-operation:'+userId+':';this.storage=storage;this.memory=new Map();}
 id(slot){let id=this.memory.get(slot);if(id)return id;try{id=this.storage.getItem(this.prefix+slot);}catch{}if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id||''))id=crypto.randomUUID();this.memory.set(slot,id);try{this.storage.setItem(this.prefix+slot,id);}catch{}return id;}
 done(slot){this.memory.delete(slot);try{this.storage.removeItem(this.prefix+slot);}catch{}}
 clear(){this.memory.clear();try{for(let i=this.storage.length-1;i>=0;i--){const k=this.storage.key(i);if(k?.startsWith(this.prefix))this.storage.removeItem(k);}}catch{}}
}
