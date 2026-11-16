// Independent CAS domains; resource format versions never enter SQL arguments.
import {uiError} from './experience.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHRASE=/^affection\.phrase(?:0[1-9]|10)$/;
export const validThoughtIntent=i=>!!i&&i.type==='affection.requested'&&i.version===1&&i.tapCount===10&&UUID.test(i.idempotencyKey)&&PHRASE.test(i.phraseKey);
export function validThoughtReceipt(intent,r,{me,pairId,members}={}){
 const peers=(members??[]).filter(m=>m.pair_id===pairId&&m.profile_id!==me?.id);
 return validThoughtIntent(intent)&&!!r&&UUID.test(pairId)&&UUID.test(me?.id)&&peers.length===1&&UUID.test(peers[0].profile_id)&&r.id===intent.idempotencyKey&&r.pair_id===pairId&&r.sender_id===me.id&&r.recipient_id===peers[0].profile_id&&r.recipient_id!==me.id&&PHRASE.test(r.phrase_key)&&Number.isSafeInteger(r.sequence)&&r.sequence>=1&&r.sequence<=10000&&r.phrase_key==='affection.phrase'+String((r.sequence-1)%10+1).padStart(2,'0')&&typeof r.created_at==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(r.created_at)&&Number.isFinite(Date.parse(r.created_at))&&r.read_at===null;
}
export const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export class DomainDraft{
 constructor(){this.base=null;this.server=null;this.value=null;this.version=0;this.pending=false;this.conflict=false;this.error=null;}
 get dirty(){return !this.base||!equal(this.value,this.base);}
 receive(value,version,configured){this.server={value:{...value},version,configured};if(!this.value||(!this.dirty&&!this.pending&&!this.conflict)){this.value={...value};this.base=configured?{...value}:null;this.version=version;} }
 edit(patch){this.value={...this.value,...patch};this.error=null;}
 reconcile(){if(!this.server)return;this.base=this.server.configured?{...this.server.value}:null;this.version=this.server.version;this.conflict=false;this.error=null;}
 begin(){if(this.pending||this.conflict)throw Error('Domain is pending or conflicted');this.pending=true;this.error=null;return {value:{...this.value},version:this.version};}
 complete(value,version){this.base={...value};this.version=version;this.server={value:{...value},version,configured:true};this.conflict=false;}
 fail(error){this.error=error;this.conflict=error?.code==='40001';}
}
export const ownDomains=({profile,details,preferences})=>({profile:{value:{display_name:profile.display_name,bio:details?.bio??'',mood_animal:details?.mood_animal??'none'},version:details?.version??0,configured:!!details},preferences:{value:{theme:preferences?.theme??'dark',locale:preferences?.locale??'en',partner_nickname:preferences?.partner_nickname??null},version:preferences?.version??0,configured:!!preferences}});
// Stores one immutable operation + sanitized receipt, never a delivery/read claim.
export class ThoughtOutbox{
 constructor(scope,storage=globalThis.sessionStorage){this.key='connection-thought:'+scope;this.storage=storage;this.value=null;try{const v=JSON.parse(storage.getItem(this.key));if(validThoughtIntent(v?.intent))this.value=v;}catch{}}
 put(intent,receipt=null){if(!validThoughtIntent(intent))throw uiError('errors.invalidValue');if(this.value&&this.value.intent.idempotencyKey!==intent.idempotencyKey)throw uiError('errors.invalidValue');const next={intent:Object.freeze({...intent}),receipt:receipt?{...receipt}:null};
  // Keep the operation retryable, but never expose a receipt until its write succeeds.
  if(!this.value)this.value={intent:next.intent,receipt:null};
  try{this.storage.setItem(this.key,JSON.stringify(next));}catch(cause){const e=uiError('errors.localStorage');e.code='OUTBOX_STORAGE_FAILED';e.cause=cause;throw e;}this.value=next;return next;}
 validate(context){if(this.value?.receipt&&!validThoughtReceipt(this.value.intent,this.value.receipt,context)){const intent=this.value.intent;this.value={intent,receipt:null};this.put(intent);}return this.value;}
 clear(){this.value=null;try{this.storage.removeItem(this.key);}catch{}}
}
